package com.waymate.app.data.repository

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.waymate.app.data.api.ApiException
import com.waymate.app.data.api.DemoApi
import com.waymate.app.data.api.JourneyParser
import com.waymate.app.model.Journey
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

/**
 * One in-flight HTTP operation. Durable pending user commands recover by receipt, never by a new
 * ID.
 */
class HandoffRepository(context: Context, private val display: (HandoffConnectionState) -> Unit) {
    private val api = DemoApi()
    private val preferences = context.getSharedPreferences("handoff-v2", Context.MODE_PRIVATE)
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
    private val polling = AtomicBoolean(false)
    private val tick =
        object : Runnable {
            override fun run() {
                if (!foreground || closed) return
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
        restricted = null
        main.removeCallbacks(tick)
        main.post(tick)
    }

    fun restriction(value: Boolean?) {
        restricted = value
        if (value != false) show("정차 상태와 차량 제한을 확인한 뒤 불러올 수 있어요.")
    }

    fun pause() {
        foreground = false
        restricted = null
        main.removeCallbacks(tick)
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
    }

    private fun read(): JSONObject =
        api.request("/api/state?view=car").also {
            require(it.getInt("schemaVersion") == 2)
            state = it
        }

    private fun envelope(type: String, payload: JSONObject): JSONObject {
        val current = read()
        return JSONObject()
            .put("schemaVersion", 2)
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
                .put("uiContext", "handoff")
        // Status is a fresh fact with a new sequence, never a replay of an old restriction
        // observation.
        state = api.request("/api/commands", command.put("payload", payload)).getJSONObject("state")
    }

    private fun sync() {
        if (!foreground) return
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
                        .put("pendingAttempts", JSONArray()),
                )
            )
            sendPending()
        }
        if (!foreground) return
        report()
        networkReady = true
        val meta = state?.optJSONObject("handoff")
        if (
            loaded != null &&
                (meta?.optString("handoffId") != loaded?.handoffId ||
                    meta?.optBoolean("acknowledged") != true)
        )
            loaded = null
        show(
            when {
                restricted == null -> "차량의 제한 상태를 확인하고 있어요."
                restricted == true -> "정차 후 여행을 불러올 수 있어요."
                loaded != null -> "웹에서 저장한 여행을 불러왔고, 서버에 수신 확인을 저장했어요."
                meta == null -> "웹에서 프로필·여행을 저장하고 차량 전달을 준비해 주세요."
                else -> "여행이 준비됐어요. 내 여행 불러오기를 눌러 주세요."
            }
        )
    }

    fun load() {
        if (loading || !foreground || restricted != false) return
        loading = true
        show("여행 정보를 불러오고 있어요.")
        worker.execute {
            try {
                if (pending != null) {
                    if (!recover()) {
                        if (pending?.getString("type") == "CAR_LOADED") report()
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
            )
        main.post {
            if (!closed)
                display(ui.copy(loadEnabled = ui.loadEnabled && foreground && restricted == false))
        }
    }
}
