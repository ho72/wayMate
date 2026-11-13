package com.waymate.app.data.repository

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.waymate.app.data.api.ApiException
import com.waymate.app.data.api.DemoApi
import com.waymate.app.data.api.JourneyParser
import com.waymate.app.model.Journey
import com.waymate.app.model.NavigationUiState
import com.waymate.app.platform.navigation.NavigationDriver
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

/**
 * One in-flight HTTP operation. Durable pending user commands recover by receipt, never by a new
 * ID.
 */
class HandoffRepository(
    context: Context,
    private val navigation: NavigationDriver,
    private val display: (HandoffConnectionState) -> Unit,
) {
    private val api = DemoApi()
    private val preferences = context.getSharedPreferences("handoff-v4", Context.MODE_PRIVATE)
    private val contentReads =
        ContentReadStore(
            keys = { preferences.all.keys },
            read = { preferences.getBoolean(it, false) },
            write = { preferences.edit().putBoolean(it, true).apply() },
            remove = { keys ->
                preferences.edit().also { editor -> keys.forEach(editor::remove) }.apply()
            },
        )
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val deviceId =
        (preferences.getString("deviceId", null)
            ?: context
                .getSharedPreferences("handoff-v3", Context.MODE_PRIVATE)
                .getString("deviceId", null))
            ?: UUID.randomUUID().toString().also {
                preferences.edit().putString("deviceId", it).commit()
            }
    private var sessionId = UUID.randomUUID().toString()
    private var seq = 0L
    @Volatile private var foreground = false
    @Volatile private var restricted: Boolean? = null
    @Volatile private var closed = false
    @Volatile private var loading = false
    @Volatile private var state: JSONObject? = null
    @Volatile private var pending = preferences.getString("pending", null)?.let(::JSONObject)
    private var stopPending = preferences.getString("stopPending", null)?.let(::JSONObject)
    private val stopCommands =
        StopCommandOutbox<JSONObject, JSONObject>(
            pending = { stopPending },
            persist = { command ->
                check(preferences.edit().putString("stopPending", command.toString()).commit())
                stopPending = command
            },
            clear = {
                check(preferences.edit().remove("stopPending").commit())
                stopPending = null
            },
            receipt = { command ->
                val result =
                    api.request(
                        "/api/commands/${command.getString("commandId")}?runId=${command.getString("runId")}"
                    )
                if (result.getString("status") == "applied") result.getJSONObject("state") else null
            },
            submit = { command -> api.request("/api/commands", command).getJSONObject("state") },
            applied = { command, current ->
                updateState(current)
                if (
                    command.getString("type") == "CANCEL_PENDING_COMMAND" &&
                        command.getJSONObject("payload").getString("originalCommandId") ==
                            pending?.getString("commandId")
                )
                    clearPending()
            },
            httpStatus = { (it as? ApiException)?.status },
        )
    private var candidate = preferences.getString("candidate", null)?.let(::JSONObject)
    @Volatile private var loaded: Journey? = null
    @Volatile private var networkReady = false
    @Volatile private var dismissedEndingScope: String? = null
    @Volatile private var contentVisible = false
    @Volatile private var meetingVisible = false
    @Volatile private var socialNotice: String? = null
    @Volatile private var navigationVisible = false
    @Volatile private var navigationNotice: String? = null
    @Volatile private var lifecycleGeneration = 0L
    @Volatile private var navIntent: NavIntent? = null

    private data class NavIntent(
        val operation: String,
        val reviewed: JSONObject,
        val at: Long,
        val generation: Long,
        val resetId: String?,
    )

    private var resetLocalId: String? = null
    private var resetObservedAt = 0L
    private var observedSeq = 0L
    private val polling = AtomicBoolean(false)
    private val tick =
        object : Runnable {
            override fun run() {
                if ((!foreground && !navigation.hasWork()) || closed) return
                main.postDelayed(this, 500)
                if (loading || !polling.compareAndSet(false, true)) return
                worker.execute {
                    try {
                        sync()
                    } catch (e: Exception) {
                        networkReady = false
                        show(errorText(e))
                    } finally {
                        polling.set(false)
                    }
                }
            }
        }

    fun resume() {
        foreground = true
        navigation.resume()
        restricted = null
        main.removeCallbacks(tick)
        main.post(tick)
    }

    fun restriction(value: Boolean?) {
        if (restricted != value) {
            lifecycleGeneration++
            navIntent = null
        }
        restricted = value
        if (value != false) show("정차 상태와 차량 제한을 확인한 뒤 불러올 수 있어요.")
    }

    fun pause() {
        foreground = false
        lifecycleGeneration++
        navIntent = null
        navigation.pause()
        restricted = null
        main.removeCallbacks(tick)
        if (navigation.hasWork()) main.post(tick)
        show("화면이 비활성화되어 여행 불러오기를 잠시 멈췄어요.")
        worker.execute {
            try {
                if (state?.getJSONObject("vehicle")?.optString("vehicleSessionId") == sessionId)
                    report()
            } catch (_: Exception) {
                /* Local actions already blocked; server heartbeat expires within 2 seconds. */
            }
        }
    }

    fun close() {
        closed = true
        main.removeCallbacks(tick)
        worker.shutdown()
        navigation.close()
    }

    private fun read(): JSONObject =
        api.request("/api/state?view=car").also {
            require(it.getInt("schemaVersion") == 4 && it.getString("scope") == "mobile-meeting-v4")
            updateState(it)
        }

    private fun updateState(current: JSONObject) {
        val old = state?.optString("runId") ?: preferences.getString("lastRunId", null)
        val runs = current.optJSONArray("completedRunIds")
        contentReads.clearCompleted(
            current.getString("runId"),
            if (runs == null) emptySet()
            else (0 until runs.length()).map { runs.getString(it) }.toSet(),
        )
        val completed =
            old != null && runs != null && (0 until runs.length()).any { runs.getString(it) == old }
        if (old != null && old != current.getString("runId") && completed) {
            lifecycleGeneration++
            navIntent = null
            navigation.abandonGrant()
            clearPending()
            check(preferences.edit().remove("stopPending").commit())
            stopPending = null
            candidate = null
            loaded = null
            dismissedEndingScope = null
            contentVisible = false
            meetingVisible = false
            navigationVisible = false
            navigationNotice = null
            socialNotice = null
            resetLocalId = null
            sessionId = UUID.randomUUID().toString()
            seq = 0
            observedSeq = 0
        }
        if (preferences.getString("lastRunId", null) != current.getString("runId"))
            check(preferences.edit().putString("lastRunId", current.getString("runId")).commit())
        state = current
    }

    private fun recordedScopeAllowed(rec: JSONObject): Boolean {
        val report = rec.optJSONObject("report")
        val current = state
        val currentScope =
            current?.let { it.getString("storeId") + ":" + it.getString("runId") + ":" + deviceId }
        val completed = current?.optJSONArray("completedNavigation")
        val proven =
            completed != null &&
                (0 until completed.length()).any { i ->
                    val item = completed.getJSONObject(i)
                    val ids = item.getJSONArray("settledAttemptIds")
                    item.getString("deviceId") == deviceId &&
                        rec.optString("scope") ==
                            state!!.getString("storeId") +
                                ":" +
                                item.getString("runId") +
                                ":" +
                                deviceId &&
                        (0 until ids.length()).any {
                            ids.getString(it) == rec.optString("attemptId")
                        }
                }
        return ResetNavigationPolicy.mayLeaveRecordedScope(
            currentScope,
            rec.optString("scope"),
            rec.optBoolean("acknowledged"),
            report?.optString("outcome"),
            proven,
        )
    }

    private fun syncReset() {
        val r =
            state?.optJSONObject("reset")
                ?: run {
                    show()
                    return
                }
        if (resetLocalId != r.getString("id")) {
            resetLocalId = r.getString("id")
            resetObservedAt = SystemClock.elapsedRealtime()
            lifecycleGeneration++
            navIntent = null
            navigation.abandonGrant()
            dismissedEndingScope = null
            contentVisible = false
            meetingVisible = false
            navigationVisible =
                r.optBoolean("navigationRequired") || state?.optJSONObject("mockNavigation") != null
            loaded = null
            candidate = null
            socialNotice = null
            navigationNotice = null
            if (pending?.optString("type")?.startsWith("NAV_") != true) clearPending()
        }
        if (r.optString("requiredDeviceId") != deviceId) {
            show()
            return
        }
        if (pending != null && !recover()) {
            val c = pending!!
            if (
                c.getString("type") in listOf("NAV_REPORT", "NAV_CANCEL") ||
                    c.getString("type") == "NAV_REMOVE_APPROVE" &&
                        c.getJSONObject("target").optString("resetId") == r.getString("id") ||
                    c.getString("type") == "NAV_RETRY" &&
                        c.getJSONObject("payload").optString("source") == "mock" &&
                        c.getJSONObject("payload").optString("operation") == "remove" &&
                        state?.optJSONObject("mockNavigation")?.optJSONArray("attempts")?.let {
                            attempts ->
                            (0 until attempts.length()).any { i ->
                                val a = attempts.getJSONObject(i)
                                a.optString("attemptId") ==
                                    c.getJSONObject("target").optString("attemptId") &&
                                    a.optString("resetId") == r.getString("id")
                            }
                        } == true
            )
                sendPending()
            else clearPending() // Reset gates prevent a late ordinary command or old add grant.
        }
        if (state!!.getJSONObject("vehicle").optString("vehicleSessionId") != sessionId) {
            persist(
                envelope(
                    "CAR_SESSION_OPEN",
                    JSONObject()
                        .put("deviceId", deviceId)
                        .put("vehicleSessionId", sessionId)
                        .put("pendingAttempts", JSONArray())
                        .put("navigationSource", navigation.source),
                )
            )
            sendPending()
        }
        report()
        networkReady = true
        navigationSync(true)
        val current = state ?: return
        val binding = current.optJSONObject("actionBindings")?.optJSONObject("RESET_ACK")
        val e = navigation.evidence()
        val rec = navigation.record()
        val n = current.optJSONObject("navigation")
        val unresolved = attempts().any { it.getString("outcome") in listOf("pending", "unknown") }
        val real = r.optBoolean("navigationRequired")
        val freshRoute =
            !real || e != null && e.getJSONObject("first").getLong("startedAt") > resetObservedAt
        val localSettled =
            rec == null ||
                recordedScopeAllowed(rec) &&
                    (rec.optString("scope") != navScope() || rec.optBoolean("acknowledged"))
        if (
            binding != null &&
                ResetNavigationPolicy.mayAcknowledge(
                    foreground,
                    pending != null || navIntent != null,
                    navigation.hasWork(),
                    unresolved,
                    n?.optJSONObject("owned") != null,
                    localSettled,
                    freshRoute,
                )
        ) {
            val payload = JSONObject(binding.getJSONObject("payload").toString())
            if (real && rec != null && rec.optString("scope") == navScope()) {
                val report = rec.optJSONObject("report") ?: return
                if (report.getString("outcome") !in listOf("removed", "not_dispatched")) return
                payload.put(
                    "journal",
                    JSONObject()
                        .put("scope", rec.getString("scope"))
                        .put("attemptId", rec.getString("attemptId"))
                        .put("reportId", report.getString("reportId"))
                        .put("outcome", report.getString("outcome"))
                        .put("acknowledged", rec.optBoolean("acknowledged"))
                        .put("sdkCalls", rec.getInt("sdkCalls")),
                )
            }
            stopCommands.send { envelope("RESET_ACK", payload, binding.getJSONObject("target")) }
        }
        show()
    }

    private fun envelope(
        type: String,
        payload: JSONObject,
        target: JSONObject = JSONObject(),
    ): JSONObject {
        val current = read()
        return JSONObject()
            .put("schemaVersion", 4)
            .put("runSeq", current.getInt("runSeq"))
            .put("runId", current.getString("runId"))
            .put("commandId", UUID.randomUUID().toString())
            .put("expectedVersion", current.getInt("version"))
            .put("actor", "car")
            .put("type", type)
            .put("target", target)
            .put("payload", payload)
    }

    private fun persist(command: JSONObject) {
        check(
            preferences
                .edit()
                .putString("pending", command.toString())
                .putString("candidate", candidate?.toString())
                .commit()
        )
        pending = command
    }

    private fun clearPending() {
        check(preferences.edit().remove("pending").remove("candidate").commit())
        pending = null
        candidate = null
    }

    private fun accept(command: JSONObject, current: JSONObject) {
        updateState(current)
        if (command.getString("type") == "CAR_SESSION_OPEN") {
            sessionId = command.getJSONObject("payload").getString("vehicleSessionId")
            seq = 0
            observedSeq = 0
        }
        if (command.getString("type") == "CAR_LOADED") {
            val snapshot = candidate
            val meta = current.optJSONObject("handoff")
            if (
                snapshot != null &&
                    meta?.optBoolean("acknowledged") == true &&
                    meta.optString("handoffId") == snapshot.getString("handoffId")
            )
                loaded = JourneyParser.parse(snapshot)
        }
        clearPending()
    }

    private fun sendPending() {
        val command = pending ?: return
        try {
            val result = api.request("/api/commands", command)
            accept(command, result.getJSONObject("state"))
        } catch (e: ApiException) {
            if (e.status < 500 || e.status == 500) clearPending()
            throw e
        }
    }

    private fun recover(): Boolean {
        val command = pending ?: return true
        val result =
            api.request(
                "/api/commands/${command.getString("commandId")}?runId=${command.getString("runId")}"
            )
        updateState(result.getJSONObject("state"))
        if (result.getString("status") == "applied") {
            accept(command, state!!)
            return true
        }
        return false
    }

    private fun report() {
        val command = envelope("CAR_STATUS", JSONObject())
        val value = restricted
        val payload =
            JSONObject()
                .put("vehicleSessionId", sessionId)
                .put("statusSeq", ++seq)
                .put("restrictionKnown", value != null)
                .put("restricted", value != false)
                .put("foreground", foreground)
                .put(
                    "uiContext",
                    if (navigationVisible) "navigation"
                    else if (meetingVisible) "meeting"
                    else if (loaded != null) "home" else "handoff",
                )
        state?.let { current ->
            val connection =
                current.optJSONObject("social")?.optJSONObject("connection")?.optString("id")
            preferences
                .getString("content.q1.${current.getString("runId")}.$connection", null)
                ?.let { payload.put("displayedCue", JSONObject(it)) }
        }
        // Status is a fresh fact with a new sequence, never a replay of an old restriction
        // observation.
        updateState(
            api.request("/api/commands", command.put("payload", payload)).getJSONObject("state")
        )
    }

    private fun recoverStop() {
        stopCommands.recover()
    }

    private fun sync() {
        recoverStop()
        val observed = read()
        if (observed.optJSONObject("reset") != null || observed.optJSONObject("recovery") != null) {
            syncReset()
            return
        }
        if (!foreground) {
            if (pending != null && !recover()) {
                if (pending?.getString("type")?.startsWith("NAV_") == true) sendPending()
                else return
            }
            read()
            navigationSync(false)
            return
        }
        if (pending != null && !recover() && pending?.getString("type")?.startsWith("NAV_") == true)
            sendPending()
        if (pending != null && !recover()) {
            show("이전 요청의 결과가 미확인이에요. 같은 요청 다시 전송을 눌러 주세요.")
            return
        }
        val current = read()
        if (current.getJSONObject("vehicle").optString("vehicleSessionId") != sessionId) {
            persist(
                envelope(
                    "CAR_SESSION_OPEN",
                    JSONObject()
                        .put("deviceId", deviceId)
                        .put("vehicleSessionId", sessionId)
                        .put("pendingAttempts", JSONArray())
                        .put("navigationSource", navigation.source),
                )
            )
            sendPending()
        }
        if (!foreground) return
        report()
        networkReady = true
        navigationSync(true)
        val meta = state?.optJSONObject("handoff")
        loaded = state?.optJSONObject("activeJourney")?.let { JourneyParser.preparation(it) }
        show(
            when {
                restricted == null -> "차량의 제한 상태를 확인하고 있어요."
                restricted == true -> "정차 후 여행을 불러올 수 있어요."
                loaded != null -> "차량에서 시작한 내 여행을 이어가요."
                meta == null -> "웹에서 프로필·여행을 저장하고 차량 전달을 준비해 주세요."
                else -> "여행이 준비됐어요. 내 여행 불러오기를 눌러 주세요."
            }
        )
    }

    fun startTrip(reviewed: Journey?) = executeStart(reviewed)

    private fun executeStart(reviewed: Journey?) {
        if (loading || !foreground || restricted != false || pending != null) return
        loading = true
        worker.execute {
            try {
                report()
                val payload = JSONObject().put("vehicleSessionId", sessionId)
                if (reviewed != null)
                    payload
                        .put("origin", "stored_preparation")
                        .put(
                            "sourceVersions",
                            JSONObject()
                                .put("profile", reviewed.profileVersion)
                                .put("trip", reviewed.tripVersion),
                        )
                else payload.put("origin", "demo_preset").put("presetId", "gangneung-01")
                val command = envelope("CAR_START_TRIP", payload)
                check(foreground && restricted == false)
                persist(command)
                sendPending()
                sync()
            } catch (e: Exception) {
                networkReady = false
                show(errorText(e))
            } finally {
                loading = false
                show()
            }
        }
    }

    fun load() {
        if (loading || !foreground || restricted != false) return
        loading = true
        show("여행 정보를 불러오고 있어요.")
        worker.execute {
            try {
                if (pending != null) {
                    if (!recover()) {
                        if (pending?.getString("type") in listOf("CAR_LOADED", "CAR_START_TRIP"))
                            report()
                        check(foreground && restricted == false)
                        sendPending()
                    }
                } else {
                    report()
                    val snapshot = api.request("/api/handoff")
                    JourneyParser.parse(snapshot) // Reject unsupported values before ACK.
                    val c =
                        envelope(
                            "CAR_LOADED",
                            JSONObject()
                                .put("vehicleSessionId", sessionId)
                                .put("handoffId", snapshot.getString("handoffId"))
                                .put("handoffVersion", snapshot.getInt("handoffVersion"))
                                .put("sourceVersions", snapshot.getJSONObject("sourceVersions"))
                                .put("mode", snapshot.getString("mode")),
                        )
                    check(foreground && restricted == false)
                    candidate = snapshot
                    persist(c)
                    sendPending()
                }
                sync()
            } catch (e: Exception) {
                networkReady = false
                show(errorText(e))
            } finally {
                loading = false
                show()
            }
        }
    }

    fun openEnding() {
        dismissedEndingScope = null
        contentVisible = false
        navigationVisible = false
        meetingVisible = false
        show()
    }

    fun closeEnding() {
        dismissedEndingScope = endingUi().scope
        contentVisible = false
        navigationVisible = false
        meetingVisible = false
        navIntent = null
        show()
    }

    fun markProfileCue(questionId: String) {
        if (closed || questionId != "Q1" || !foreground || restricted != false || !contentVisible)
            return
        val displayed = state ?: return
        val content = displayed.optJSONObject("content") ?: return
        val run = displayed.getString("runId")
        val connection = content.getString("connectionId")
        val version = content.getInt("profileVersion")
        worker.execute {
            if (closed || !foreground || restricted != false || !contentVisible) return@execute
            val current = state ?: return@execute
            val c = current.optJSONObject("content") ?: return@execute
            if (
                current.getString("runId") != run ||
                    c.getString("connectionId") != connection ||
                    c.getInt("profileVersion") != version
            )
                return@execute
            val qs = c.getJSONArray("questions")
            if (
                !(0 until qs.length()).any {
                    qs.getJSONObject(it).getString("id") == "Q1" &&
                        qs.getJSONObject(it).getBoolean("known")
                }
            )
                return@execute
            val cue =
                JSONObject()
                    .put("cueId", "S06_Q1_ANSWER")
                    .put("runId", run)
                    .put("connectionId", connection)
                    .put("peerPublicProfileVersion", version)
            val key = "content.q1.$run.$connection"
            if (preferences.getString(key, null) != cue.toString())
                preferences.edit().putString(key, cue.toString()).apply()
        }
    }

    fun openContent() {
        dismissedEndingScope = endingUi().scope
        contentVisible = loaded != null
        show()
    }

    fun closeContent() {
        contentVisible = false
        show()
    }

    fun markMessageRead(threadId: String) {
        if (closed || !foreground || !contentVisible || restricted != false) return
        val run = state?.optString("runId") ?: return
        worker.execute {
            if (closed || !foreground || !contentVisible || restricted != false) return@execute
            val current = state ?: return@execute
            if (current.getString("runId") != run) return@execute
            val threads =
                current.optJSONObject("content")?.optJSONArray("threads") ?: return@execute
            if (
                (0 until threads.length()).any {
                    threads.getJSONObject(it).getString("id") == threadId &&
                        !threads.getJSONObject(it).isNull("response")
                }
            ) {
                contentReads.markRead(run, threadId)
                show()
            }
        }
    }

    fun openNavigation() {
        dismissedEndingScope = endingUi().scope
        contentVisible = false
        navigationVisible = true
        navigationNotice = null
        show()
    }

    fun closeNavigation() {
        navigationVisible = false
        navIntent = null
        show()
    }

    fun approveNavigation(operation: String, reviewed: String) {
        if (
            !foreground ||
                restricted != false ||
                !networkReady ||
                !ResetNavigationPolicy.mayQueueBehindObservation(pending?.optString("type")) ||
                navIntent != null
        )
            return
        val route = JSONObject(reviewed)
        val reviewedReset = route.optString("_resetId").takeIf { it.isNotEmpty() }
        val activeReset = state?.optJSONObject("reset")?.getString("id")
        if (!ResetNavigationPolicy.reviewMatches(activeReset, reviewedReset, operation)) return
        route.remove("_resetId")
        navIntent =
            NavIntent(
                operation,
                route,
                SystemClock.elapsedRealtime(),
                lifecycleGeneration,
                reviewedReset,
            )
        navigationNotice = "승인한 경로를 내비에서 다시 확인하고 있어요."
        show()
    }

    fun cancelNavigation() {
        if (!foreground || restricted != false || loading) return
        loading = true
        worker.execute {
            try {
                val a =
                    attempts().lastOrNull {
                        it.getString("outcome") == "pending" &&
                            it.getString("dispatch") == "not_started"
                    } ?: return@execute
                navCommand("NAV_CANCEL", navPayload().put("attemptId", a.getString("attemptId")))
                navigationNotice = "실행 전 승인을 취소했어요. 다시 확인 후 승인할 수 있어요."
            } catch (e: Exception) {
                navigationNotice = errorText(e)
            } finally {
                loading = false
                show()
            }
        }
    }

    private fun navPayload() =
        JSONObject()
            .put("vehicleSessionId", sessionId)
            .put("vehicleEpoch", state!!.getJSONObject("vehicle").getLong("vehicleEpoch"))

    private fun navScope() =
        state!!.getString("storeId") + ":" + state!!.getString("runId") + ":" + deviceId

    private fun attempts(): List<JSONObject> =
        state?.optJSONObject("navigation")?.optJSONArray("attempts")?.let { a ->
            (0 until a.length()).map { a.getJSONObject(it) }
        } ?: emptyList()

    private fun navCommand(
        type: String,
        payload: JSONObject,
        target: JSONObject = JSONObject(),
    ): JSONObject {
        val command = envelope(type, payload, target)
        persist(command)
        try {
            val result = api.request("/api/commands", command)
            accept(command, result.getJSONObject("state"))
            return result
        } catch (e: ApiException) {
            if (e.status <= 500) clearPending()
            throw e
        }
    }

    private fun sameRoute(a: JSONObject, b: JSONObject): Boolean =
        a.getJSONObject("destination").toString() == b.getJSONObject("destination").toString() &&
            a.getJSONArray("waypoints").toString() == b.getJSONArray("waypoints").toString()

    private fun navigationSync(canAct: Boolean) {
        if (state?.getJSONObject("vehicle")?.optString("vehicleSessionId") != sessionId) return
        val rec = navigation.record()
        if (rec != null && !recordedScopeAllowed(rec)) {
            navigationNotice = "다른 회차의 실행 기록이 남아 있어요. 기록 복구가 필요해요."
            return
        }
        val report = rec?.optJSONObject("report")
        if (report != null && !rec.optBoolean("acknowledged")) {
            val a = attempts().find { it.getString("attemptId") == rec.getString("attemptId") }
            if (a != null) {
                val reports = a.getJSONArray("reports")
                if (
                    (0 until reports.length()).any {
                        reports.getJSONObject(it).getString("reportId") ==
                            report.getString("reportId")
                    }
                )
                    navigation.acknowledge(report.getString("reportId"))
                else {
                    val payload = JSONObject(report.toString())
                    val common = navPayload()
                    payload
                        .put("vehicleSessionId", common.getString("vehicleSessionId"))
                        .put("vehicleEpoch", common.getLong("vehicleEpoch"))
                    navCommand("NAV_REPORT", payload)
                    navigation.acknowledge(report.getString("reportId"))
                    navigationNotice = null
                }
            }
        }
        if (!canAct || navigation.source != "real") return
        val evidence = navigation.evidence() ?: return
        val second = evidence.getJSONObject("second")
        val q = second.getLong("querySeq")
        if (q > observedSeq) {
            // Render the fresh SDK snapshot before durable telemetry can outlive its freshness
            // window. User intents already queue safely behind NAV_OBSERVE, then re-query.
            show()
            navCommand("NAV_OBSERVE", navPayload().put("source", "real").put("evidence", evidence))
            observedSeq = q
        }
        val intent = navIntent ?: return
        if (
            !foreground ||
                restricted != false ||
                !navigationVisible ||
                intent.generation != lifecycleGeneration ||
                intent.resetId != state?.optJSONObject("reset")?.getString("id") ||
                SystemClock.elapsedRealtime() - intent.at > 20000
        ) {
            navIntent = null
            navigationNotice = "상태가 바뀌어 승인을 멈췄어요. 다시 확인해 주세요."
            return
        }
        if (evidence.getJSONObject("first").getLong("startedAt") <= intent.at) return
        navIntent = null
        if (!sameRoute(second, intent.reviewed.getJSONObject("second"))) {
            navigationNotice = "승인한 뒤 경로가 바뀌었어요. 최신 경로를 다시 확인해 주세요."
            return
        }
        try {
            val owned = state?.optJSONObject("navigation")?.optJSONObject("owned")
            val social = state?.optJSONObject("social")
            val meeting = social?.optJSONObject("meeting")
            val linkedTrip = state?.optString("journeyMode") == "connected"
            val ownAdd =
                attempts().find { it.optString("attemptId") == owned?.optString("attemptId") }
            val meetingRemove =
                intent.operation == "remove" && ownAdd?.optString("context") == "meeting"
            val target = JSONObject()
            if (intent.operation == "add" && linkedTrip)
                target.put("proposalId", meeting!!.getString("proposalId"))
            if (intent.resetId != null)
                target.put("resetId", intent.resetId).put("reason", "reset_cleanup")
            else if (meetingRemove)
                target
                    .put("proposalId", ownAdd!!.getString("proposalId"))
                    .put("reason", "meeting_cancel")
            val result =
                navCommand(
                    if (meetingRemove || intent.resetId != null) "NAV_REMOVE_APPROVE"
                    else "NAV_APPROVE",
                    navPayload()
                        .put("operation", intent.operation)
                        .put("reviewed", evidence)
                        .put(
                            "ownedAttemptId",
                            if (intent.operation == "remove")
                                owned?.getString("attemptId") ?: JSONObject.NULL
                            else JSONObject.NULL,
                        ),
                    target,
                )
            if (result.getJSONObject("receipt").getBoolean("replayed")) return
            val a = attempts().last()
            val executionId = UUID.randomUUID().toString()
            navigation.reserve(navScope(), a, executionId)
            val began = SystemClock.elapsedRealtime()
            val grant =
                navCommand(
                    "NAV_DISPATCH_BEGIN",
                    navPayload()
                        .put("attemptId", a.getString("attemptId"))
                        .put("executionRecordId", executionId)
                        .put("dispatchAt", began),
                )
            val execution = grant.optJSONObject("execution")
            if (
                execution?.optBoolean("granted") == true &&
                    !grant.getJSONObject("receipt").getBoolean("replayed") &&
                    execution.getString("executionRecordId") == executionId
            ) {
                navigation.dispatch(executionId, began + execution.getLong("validForMs")) {
                    foreground &&
                        restricted == false &&
                        navigationVisible &&
                        lifecycleGeneration == intent.generation
                }
                navigationNotice = "내비에 요청했어요. 실제 반영 결과를 확인하고 있어요."
            } else navigation.abandonGrant()
        } catch (e: Exception) {
            navigation.abandonGrant()
            navigationNotice = errorText(e)
        }
    }

    private fun navigationUi(): NavigationUiState {
        if (state?.optString("navigationMode") == "mock") {
            val n = state?.optJSONObject("mockNavigation")
            val route = n?.optJSONObject("route")
            val a =
                n?.optJSONArray("attempts")?.let {
                    if (it.length() > 0) it.getJSONObject(it.length() - 1) else null
                }
            val bindings = mutableMapOf<String, String>()
            if (foreground && !loading && pending == null) {
                state?.optJSONObject("actionBindings")?.let { all ->
                    all.keys().forEach { key ->
                        val b = all.getJSONObject(key)
                        if (
                            key.startsWith("NAV_") &&
                                b.getJSONObject("payload").optString("source") == "mock" &&
                                (key == "NAV_CANCEL" || restricted == false && networkReady)
                        )
                            bindings[key] = b.toString()
                    }
                }
            }
            return NavigationUiState(
                visible = navigationVisible,
                source = "mock",
                status =
                    navigationNotice
                        ?: when (a?.optString("outcome")) {
                            "pending" -> "운전자 승인 저장 · 시연자의 모의 결과를 기다려요."
                            "unknown" -> "모의 결과 미확인 · 결과 해소 전 재시도·진행·초기화를 잠갔어요."
                            "failed" -> "모의 실패 확인 · 같은 경로를 다시 확인하고 새로 승인해 주세요."
                            "applied" -> "모의 경유지 추가 확인 · 실제 SDK 호출 없음"
                            "removed" -> "모의 경유지 제거 확인 · 원래 목적지 유지"
                            "not_dispatched" -> "모의 승인 취소 · 경로 변경 없음"
                            else -> "운전자 승인 후 시연 패널에서 모의 결과를 지정해요."
                        },
                destination =
                    route?.optJSONObject("destination")?.optString("name") ?: "모의 기존 목적지 D",
                mockWaypointPresent = (route?.optJSONArray("waypoints")?.length() ?: 0) > 0,
                mockActions = bindings,
            )
        }
        val n = state?.optJSONObject("navigation")
        val list = attempts()
        val unresolved = list.any { it.getString("outcome") in listOf("pending", "unknown") }
        val owned = n?.optJSONObject("owned")
        val e = navigation.evidence()
        val rec = navigation.record()
        val localMatches =
            if (owned != null)
                state != null && navigation.owns(navScope(), owned.getString("attemptId"))
            else
                rec == null ||
                    rec.optString("scope") == state?.let { navScope() } ||
                    recordedScopeAllowed(rec)
        val enabled =
            foreground &&
                restricted == false &&
                networkReady &&
                (loaded != null || state?.optJSONObject("reset") != null) &&
                navigation.source == "real" &&
                e != null &&
                pending == null &&
                !loading &&
                !unresolved &&
                !navigation.hasWork() &&
                localMatches &&
                navIntent == null
        val social = state?.optJSONObject("social")
        val meeting = social?.optJSONObject("meeting")
        val meetingTrip = state?.optString("journeyMode") == "connected"
        val canAddForMeeting =
            !meetingTrip ||
                (meeting?.optString("status") == "confirmed" &&
                    social?.optJSONObject("peer") != null)
        val ownAdd = attempts().find { it.optString("attemptId") == owned?.optString("attemptId") }
        val canRemoveForMeeting =
            state?.optJSONObject("reset") != null ||
                ownAdd?.optString("context") != "meeting" ||
                meeting?.optString("status") == "cancelled"
        val points = e?.getJSONObject("second")?.getJSONArray("waypoints")
        val latest = list.lastOrNull()
        val outcome = latest?.getString("outcome")
        val route = e?.getJSONObject("second")
        val guiding =
            route?.optString("naviMode") == "ROUTE_GUIDING" && !route.optBoolean("isRouting", true)
        val ownRoute =
            owned != null &&
                route != null &&
                points?.length() == 1 &&
                route.getJSONObject("destination").toString() ==
                    owned.getJSONObject("destination").toString() &&
                points.getJSONObject(0).toString() == owned.getJSONObject("waypoint").toString()
        val status =
            navigationNotice
                ?: when (outcome) {
                    "applied" -> "경유지 추가 확인 · 원래 목적지를 유지했어요."
                    "removed" -> "경유지 제거 확인 · 원래 목적지를 유지했어요."
                    "unknown" -> "실행 결과 미확인 · 자동 재실행을 잠갔어요. 내비 경로를 확인해 주세요."
                    "pending" ->
                        if (latest.getString("dispatch") == "not_started")
                            "승인을 저장했어요. 실행하지 않은 승인은 취소할 수 있어요."
                        else "내비 실제 반영 결과를 확인하고 있어요."
                    else -> navigationNotice ?: navigation.message
                }
        return NavigationUiState(
            visible = navigationVisible,
            status =
                if (!localMatches) "이 경유지의 차량 실행 기록을 확인할 수 없어 변경을 잠갔어요."
                else if (navIntent != null) navigationNotice ?: status else status,
            destination =
                e?.getJSONObject("second")?.getJSONObject("destination")?.optString("name")
                    ?: "미확인",
            canAdd =
                enabled &&
                    state?.optJSONObject("reset") == null &&
                    state?.optJSONObject("recovery") == null &&
                    canAddForMeeting &&
                    guiding &&
                    owned == null &&
                    points?.length() == 0,
            canRemove = enabled && canRemoveForMeeting && guiding && ownRoute,
            canCancel =
                foreground &&
                    restricted == false &&
                    latest?.getString("dispatch") == "not_started" &&
                    outcome == "pending",
            reviewed = e?.toString(),
            busy = navIntent != null || navigation.hasWork(),
        )
    }

    fun openMeeting() {
        dismissedEndingScope = endingUi().scope
        contentVisible = false
        meetingVisible = true
        socialNotice = null
        show()
    }

    fun closeMeeting() {
        meetingVisible = false
        show()
    }

    fun retryCurrent() {
        if (state?.optJSONObject("reset") != null || state?.optJSONObject("recovery") != null) {
            if (loading || !foreground) return
            loading = true
            worker.execute {
                try {
                    sync()
                } catch (e: Exception) {
                    show(errorText(e))
                } finally {
                    loading = false
                    show()
                }
            }
        } else load()
    }

    fun socialAction(type: String, reviewed: String) {
        if (closed || !foreground) return
        val stop =
            type in
                listOf(
                    "MEETING_CANCEL",
                    "CONNECT_END",
                    "PROFILE_PRIVATE",
                    "CANCEL_PENDING_COMMAND",
                    "CALL_CANCEL",
                    "CALL_END",
                    "NAV_CANCEL",
                )
        if (
            !stop &&
                (restricted != false ||
                    !networkReady ||
                    loading ||
                    !ResetNavigationPolicy.mayQueueBehindObservation(pending?.optString("type")))
        )
            return
        if (stop) {
            lifecycleGeneration++
            navIntent = null
            navigation.abandonGrant()
        }
        if (!stop) {
            loading = true
            show()
        }
        worker.execute {
            try {
                if (stop) {
                    val b = JSONObject(reviewed)
                    require(b.getString("commandType") == type)
                    stopCommands.send {
                        envelope(type, b.getJSONObject("payload"), b.getJSONObject("target"))
                    }
                    sync()
                    return@execute
                }
                if (pending != null && !recover()) {
                    socialNotice = "이전 요청 결과를 먼저 확인해 주세요."
                    show()
                    return@execute
                }
                if (!stop) {
                    report()
                    check(foreground && restricted == false)
                }
                val b = JSONObject(reviewed)
                require(b.getString("commandType") == type)
                if (type == "FINAL_CHOOSE") {
                    val f = read().optJSONObject("journey")?.optJSONObject("final")
                    val target = b.getJSONObject("target")
                    if (
                        !FinalSubmissionPolicy.maySubmit(
                            f?.optString("status"),
                            f?.optString("myChoice")?.takeIf {
                                it in listOf("together", "my_agent")
                            },
                            pending != null,
                            f?.optString("id"),
                            f?.optInt("round") ?: 0,
                            f?.optString("requestId")?.takeUnless { it == "null" },
                            target.getString("finalId"),
                            target.getInt("finalRound"),
                            target.getString("requestId"),
                        )
                    ) {
                        socialNotice = "선택 회차가 바뀌었거나 이미 제출됐어요. 현재 화면에서 다시 확인해 주세요."
                        show()
                        return@execute
                    }
                }
                navCommand(type, b.getJSONObject("payload"), b.getJSONObject("target"))
                socialNotice = null
                sync()
            } catch (e: Exception) {
                socialNotice = errorText(e)
                show()
            } finally {
                if (!stop) loading = false
                show()
            }
        }
    }

    private fun socialUi(): com.waymate.app.model.SocialUiState {
        val s = state?.optJSONObject("social")
        val status = s?.optJSONObject("meeting")?.optString("status") ?: "none"
        val peer = s?.optJSONObject("peer")?.optString("alias")
        val bindings = state?.optJSONObject("actionBindings")
        val actions = mutableMapOf<String, String>()
        for (type in
            listOf(
                "MEETING_PROPOSE",
                "MEETING_CANCEL",
                "MEETING_DECLINE",
                "CONNECT_END",
                "PROFILE_PRIVATE",
            )) bindings?.optJSONObject(type)?.let { actions[type] = it.toString() }
        pending
            ?.takeIf {
                it.getString("type") in
                    listOf("MEETING_PROPOSE", "NAV_APPROVE", "MESSAGE_SEND", "CALL_PROPOSE")
            }
            ?.let { original ->
                actions["CANCEL_PENDING_COMMAND"] =
                    JSONObject()
                        .put("commandType", "CANCEL_PENDING_COMMAND")
                        .put("target", JSONObject())
                        .put(
                            "payload",
                            JSONObject()
                                .put("originalCommandId", original.getString("commandId"))
                                .put("originalType", original.getString("type")),
                        )
                        .toString()
            }
        return com.waymate.app.model.SocialUiState(
            visible = meetingVisible,
            peerAlias = peer,
            connectionStatus = s?.optJSONObject("connection")?.optString("status") ?: "none",
            meetingStatus = status,
            notice =
                socialNotice
                    ?: when (status) {
                        "proposed" -> "같은 장소·시간에 대한 상대 동의를 기다리고 있어요."
                        "confirmed" -> "양쪽 만남 동의 확인 · 내비는 별도로 승인해 주세요."
                        "started" -> "만남 재연 중이에요. 시간 전환은 O01에서 진행해요."
                        "ended" -> "만남 재연을 마쳤어요. 여행 선택과 내비 정리는 별도로 확인해요."
                        "cancelled" -> "만남을 취소했어요. 내비 경유지는 별도로 확인해요."
                        "declined" -> "이번에는 만나지 않아요. 내 친구와 여행을 이어가요."
                        else -> "이 장소와 시간으로 잠깐 만나볼까요?"
                    },
            actions = actions,
            canInteract =
                foreground &&
                    restricted == false &&
                    networkReady &&
                    !loading &&
                    pending == null &&
                    loaded != null,
            cleanupRequired = s?.optBoolean("cleanupRequired") == true,
            retryPending = pending != null,
            canRetry = foreground && restricted == false && !loading,
        )
    }

    private fun endingUi(): com.waymate.app.model.EndingUiState {
        val current = state
        val j = current?.optJSONObject("journey")
        val phase = j?.optString("phase") ?: "none"
        val f = j?.optJSONObject("final")
        val scope =
            (current?.optString("runId") ?: "") +
                ":" +
                phase +
                ":" +
                (f?.optString("id")
                    ?: current
                        ?.optJSONObject("social")
                        ?.optJSONObject("meeting")
                        ?.optString("proposalId"))
        val actions = mutableMapOf<String, String>()
        current?.optJSONObject("actionBindings")?.let { bindings ->
            bindings.keys().forEach { key ->
                if (key.startsWith("FINAL_CHOOSE_") || key == "CONNECT_END")
                    actions[key] = bindings.getJSONObject(key).toString()
            }
        }
        fun objects(key: String): List<JSONObject> =
            j?.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }
                ?: emptyList()
        return com.waymate.app.model.EndingUiState(
            visible =
                phase in
                    listOf(
                        "travel",
                        "meeting",
                        "pending",
                        "together",
                        "my_agent",
                        "cancelled",
                        "early_end",
                    ) && loaded != null && dismissedEndingScope != scope,
            scope = scope,
            phase = phase,
            replay = j?.optBoolean("replay") == true,
            round = f?.optInt("round") ?: 0,
            myChoice = f?.optString("myChoice")?.takeIf { it in listOf("together", "my_agent") },
            lines =
                objects("scene").map {
                    com.waymate.app.model.EndingLine(it.getString("speaker"), it.getString("text"))
                },
            prompt = j?.optString("ownPrompt")?.takeUnless { it == "null" },
            answers =
                objects("ownQuestions").map {
                    com.waymate.app.model.EndingAnswer(
                        it.getString("id"),
                        it.getString("text"),
                        it.getString("reply"),
                    )
                },
            closing = j?.optString("ownClosing") ?: "",
            canInteract =
                foreground &&
                    restricted == false &&
                    networkReady &&
                    !loading &&
                    loaded != null &&
                    ResetNavigationPolicy.mayQueueBehindObservation(pending?.optString("type")) &&
                    j?.optBoolean("canInteract") == true,
            blocked =
                ContentAccessPolicy.blocked(
                    foreground,
                    restricted,
                    current?.optJSONObject("vehicle")?.optBoolean("fresh") == true,
                    current?.optJSONObject("vehicle")?.optBoolean("restrictionKnown") == true,
                    current?.optJSONObject("vehicle")?.optBoolean("restricted") != false,
                    current?.optJSONObject("vehicle")?.optBoolean("foreground") == true,
                    current?.optJSONObject("social")?.optBoolean("testRestricted") == true,
                ),
            mockNavigation = current?.optString("navigationMode") == "mock",
            cleanupRequired = j?.optBoolean("cleanupRequired") == true,
            actions = actions,
            notice = socialNotice ?: j?.optString("blockedReason")?.takeUnless { it == "null" },
            pending = pending?.optString("type") == "FINAL_CHOOSE",
            canRetry = foreground && restricted == false && !loading,
        )
    }

    private fun contentUi(): com.waymate.app.model.ContentUiState {
        val current = state
        val c = current?.optJSONObject("content")
        fun list(key: String): List<JSONObject> =
            c?.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }
                ?: emptyList()
        fun text(o: JSONObject, key: String): String? =
            if (o.isNull(key)) null else o.optString(key).takeIf { it.isNotEmpty() }
        val actions = mutableMapOf<String, String>()
        current?.optJSONObject("actionBindings")?.let { bindings ->
            bindings.keys().forEach { key ->
                if (key.startsWith("MESSAGE_") || key.startsWith("CALL_"))
                    actions[key] = bindings.getJSONObject(key).toString()
            }
        }
        socialUi().actions["CANCEL_PENDING_COMMAND"]?.let { actions["CANCEL_PENDING_COMMAND"] = it }
        val run = current?.optString("runId") ?: ""
        return com.waymate.app.model.ContentUiState(
            visible = contentVisible,
            blocked =
                ContentAccessPolicy.blocked(
                    foreground,
                    restricted,
                    current?.optJSONObject("vehicle")?.optBoolean("fresh") == true,
                    current?.optJSONObject("vehicle")?.optBoolean("restrictionKnown") == true,
                    current?.optJSONObject("vehicle")?.optBoolean("restricted") != false,
                    current?.optJSONObject("vehicle")?.optBoolean("foreground") == true,
                    current?.optJSONObject("social")?.optBoolean("testRestricted") == true,
                ),
            scope = run + ":" + (c?.optString("connectionId") ?: "my_trip"),
            peerAlias = c?.optString("peerAlias"),
            questions =
                list("questions").map {
                    com.waymate.app.model.ContentQuestion(
                        it.getString("id"),
                        it.getString("text"),
                        it.getString("answer"),
                        it.getBoolean("known"),
                    )
                },
            messages =
                list("messages").map {
                    com.waymate.app.model.ContentPreset(it.getString("id"), it.getString("text"))
                },
            replies =
                list("replies").map {
                    com.waymate.app.model.ContentPreset(it.getString("id"), it.getString("text"))
                },
            threads =
                list("threads").map { t ->
                    val response = text(t, "response")
                    com.waymate.app.model.ContentThread(
                        t.getString("id"),
                        t.getString("status"),
                        t.getString("text"),
                        response,
                        text(t, "followup"),
                        text(t, "reply"),
                        response != null && !contentReads.isRead(run, t.getString("id")),
                    )
                },
            actions = actions,
            canInteract =
                foreground &&
                    restricted == false &&
                    networkReady &&
                    !loading &&
                    ResetNavigationPolicy.mayQueueBehindObservation(pending?.optString("type")) &&
                    loaded != null &&
                    (c?.optBoolean("canInteract") ?: true) &&
                    state?.optJSONObject("reset") == null &&
                    state?.optJSONObject("recovery") == null,
            notice = socialNotice,
            pendingType = pending?.optString("type"),
            canRetry = foreground && restricted == false && !loading,
            replyDone = c?.optString("replyDone") ?: "",
            call =
                current?.optJSONObject("call")?.let { call ->
                    val lines = call.getJSONArray("lines")
                    com.waymate.app.model.CallUiState(
                        call.getString("id"),
                        call.getString("status"),
                        call.getBoolean("canPlay"),
                        (0 until lines.length()).map { index ->
                            val line = lines.getJSONObject(index)
                            com.waymate.app.model.CallSampleLine(
                                line.getString("id"),
                                line.getString("speaker"),
                                line.getString("text"),
                            )
                        },
                    )
                },
        )
    }

    private fun resetUi(): com.waymate.app.model.ResetUiState {
        val r = state?.optJSONObject("reset")
        val recovery = state?.optJSONObject("recovery")
        val n = navigationUi()
        val reasons = r?.optJSONArray("blockedReasons")
        val message =
            recovery?.optString("message")
                ?: reasons?.let {
                    (0 until it.length()).joinToString(" · ") { i -> it.getString(i) }
                }
                ?: "초기화 완료를 확인하고 있어요."
        val reviewed =
            n.reviewed?.let {
                if (r != null) JSONObject(it).put("_resetId", r.getString("id")).toString()
                else null
            }
        return com.waymate.app.model.ResetUiState(
            visible = r != null || recovery != null,
            status = message + (navigationNotice?.let { "\n" + it } ?: ""),
            destination = n.destination,
            canRemove = r != null && n.canRemove,
            canCancel = r != null && n.canCancel,
            canRetry = foreground && !loading,
            reviewed = reviewed,
            mockNavigation = n.takeIf { it.source == "mock" },
        )
    }

    @Volatile private var notice = "서버와 차량 상태를 확인하고 있어요."

    private fun errorText(e: Exception): String =
        if (pending != null) "전송 결과를 확인 중이에요. 연결 후 같은 요청을 다시 확인해 주세요."
        else if (e is ApiException) e.message ?: "서버 오류" else "서버 연결을 확인해 주세요. 웹과 서버를 먼저 실행해 주세요."

    private fun show(message: String? = null) {
        if (message != null) notice = message
        val current = state
        val actions = current?.optJSONArray("allowedActions")
        val serverAllowed =
            actions != null &&
                (0 until actions.length()).any { actions.getString(it) == "CAR_LOADED" }
        val enabled =
            foreground && restricted == false && (pending != null || networkReady && serverAllowed)
        val ui =
            HandoffConnectionState(
                loadEnabled = enabled,
                isLoading = loading,
                notice = notice,
                journey = loaded,
                retryPending = pending != null,
                startEnabled =
                    foreground &&
                        restricted == false &&
                        networkReady &&
                        pending == null &&
                        actions != null &&
                        (0 until actions.length()).any {
                            actions.getString(it) == "CAR_START_TRIP"
                        },
                ending = endingUi(),
                content = contentUi(),
                social = socialUi(),
                navigation = navigationUi(),
                reset = resetUi(),
                preparation =
                    current?.optJSONObject("preparationPreview")?.let {
                        JourneyParser.preparation(it)
                    },
            )
        main.post {
            if (!closed)
                display(
                    ui.copy(
                        loadEnabled = ui.loadEnabled && foreground && restricted == false,
                        startEnabled = ui.startEnabled && foreground && restricted == false,
                    )
                )
        }
    }
}
