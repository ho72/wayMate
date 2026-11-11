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
    private val preferences = context.getSharedPreferences("handoff-v3", Context.MODE_PRIVATE)
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val deviceId =
        preferences.getString("deviceId", null)
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
    private var candidate = preferences.getString("candidate", null)?.let(::JSONObject)
    @Volatile private var loaded: Journey? = null
    @Volatile private var networkReady = false
    @Volatile private var navigationVisible = false
    @Volatile private var navigationNotice: String? = null
    @Volatile private var lifecycleGeneration = 0L
    @Volatile private var navIntent: NavIntent? = null

    private data class NavIntent(
        val operation: String,
        val reviewed: JSONObject,
        val at: Long,
        val generation: Long,
    )

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
            require(it.getInt("schemaVersion") == 3)
            state = it
        }

    private fun envelope(type: String, payload: JSONObject): JSONObject {
        val current = read()
        return JSONObject()
            .put("schemaVersion", 3)
            .put("runSeq", current.getInt("runSeq"))
            .put("runId", current.getString("runId"))
            .put("commandId", UUID.randomUUID().toString())
            .put("expectedVersion", current.getInt("version"))
            .put("actor", "car")
            .put("type", type)
            .put("target", JSONObject())
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
        state = current
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
        state = result.getJSONObject("state")
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
                    else if (loaded != null) "home" else "handoff",
                )
        // Status is a fresh fact with a new sequence, never a replay of an old restriction
        // observation.
        state = api.request("/api/commands", command.put("payload", payload)).getJSONObject("state")
    }

    private fun sync() {
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

    fun openNavigation() {
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
                pending != null ||
                navIntent != null
        )
            return
        navIntent =
            NavIntent(
                operation,
                JSONObject(reviewed),
                SystemClock.elapsedRealtime(),
                lifecycleGeneration,
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

    private fun navCommand(type: String, payload: JSONObject): JSONObject {
        val command = envelope(type, payload)
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
        if (rec != null && rec.getString("scope") != navScope()) {
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
            navCommand("NAV_OBSERVE", navPayload().put("source", "real").put("evidence", evidence))
            observedSeq = q
        }
        val intent = navIntent ?: return
        if (
            !foreground ||
                restricted != false ||
                !navigationVisible ||
                intent.generation != lifecycleGeneration ||
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
            val result =
                navCommand(
                    "NAV_APPROVE",
                    navPayload()
                        .put("operation", intent.operation)
                        .put("reviewed", evidence)
                        .put(
                            "ownedAttemptId",
                            if (intent.operation == "remove")
                                owned?.getString("attemptId") ?: JSONObject.NULL
                            else JSONObject.NULL,
                        ),
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
        val n = state?.optJSONObject("navigation")
        val list = attempts()
        val unresolved = list.any { it.getString("outcome") in listOf("pending", "unknown") }
        val owned = n?.optJSONObject("owned")
        val e = navigation.evidence()
        val rec = navigation.record()
        val localMatches =
            if (owned != null)
                state != null && navigation.owns(navScope(), owned.getString("attemptId"))
            else rec == null || rec.optString("scope") == state?.let { navScope() }
        val enabled =
            foreground &&
                restricted == false &&
                networkReady &&
                loaded != null &&
                navigation.source == "real" &&
                e != null &&
                pending == null &&
                !loading &&
                !unresolved &&
                !navigation.hasWork() &&
                localMatches &&
                navIntent == null
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
            canAdd = enabled && guiding && owned == null && points?.length() == 0,
            canRemove = enabled && guiding && ownRoute,
            canCancel =
                foreground &&
                    restricted == false &&
                    latest?.getString("dispatch") == "not_started" &&
                    outcome == "pending",
            reviewed = e?.toString(),
            busy = navIntent != null || navigation.hasWork(),
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
                navigation = navigationUi(),
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
