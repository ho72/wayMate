package com.waymate.app.personal

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AtomicFile
import android.util.Base64
import com.waymate.app.BuildConfig
import com.waymate.app.platform.restrictions.DrivingModePolicy
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.restrictions.UxObservation
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Own transport/cache; no demo role headers, HandoffRepository or navigation driver. */
// Inspect commit() success before enrollment; the KTX edit wrapper discards its result.
@android.annotation.SuppressLint("UseKtx")
class PersonalTripRepository(
    context: Context,
    private val changed: (PersonalVehicleState) -> Unit,
    private val base: String = BuildConfig.PERSONAL_API_BASE_URL,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val endpointKey = MessageDigest.getInstance("SHA-256").digest(base.toByteArray())
        .take(8).joinToString("") { "%02x".format(it.toInt() and 255) }
    private val preferences = context.getSharedPreferences("personal-device-$endpointKey", Context.MODE_PRIVATE)
    private val cache = AtomicFile(File(context.filesDir, "personal-trip-$endpointKey.json"))
    private val deviceId: String
    private val deviceToken: String
    @Volatile private var active = false
    @Volatile private var generation = 0
    @Volatile private var operation = false
    @Volatile private var ux: UxObservation? = null
    private var poll: ScheduledFuture<*>? = null
    private var frame: JSONObject? = null
    private var state = PersonalVehicleState()
    private var lastReceived = 0L
    private var cachePairingId: String? = null
    init {
        val savedId = preferences.getString("id", null)
        val savedToken = preferences.getString("token", null)
        if (savedId == null && savedToken == null) {
            deviceId = UUID.randomUUID().toString()
            val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            deviceToken = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            check(preferences.edit().putString("id", deviceId).putString("token", deviceToken).commit())
        } else {
            deviceId = checkNotNull(savedId); deviceToken = checkNotNull(savedToken)
            UUID.fromString(deviceId)
            check(deviceToken.matches(Regex("[A-Za-z0-9_-]{43}")))
        }
        try { cachePairingId = cache.openRead().use { JSONObject(String(it.readBytes(), Charsets.UTF_8)) }
            .optJSONObject("pairing")?.optString("id") }
        catch (_: java.io.FileNotFoundException) { /* No accepted trip yet. */ }
        catch (_: Exception) { cache.delete() }
    }
    private fun locallyAllowed() = active && DrivingModePolicy.select(ux) == InteractionMode.PARKED
    private fun emit(next: PersonalVehicleState) {
        state = next
        changed(if (locallyAllowed()) next.copy(localParked = true, busy = operation) else PersonalVehicleState(phase = "blocked", notice = "정차 후 내 여행을 확인해 주세요."))
    }
    private fun uxBody(): JSONObject = JSONObject().put("ux", JSONObject()
        .put("known", ux != null).put("requiresDo", ux?.requiresDo ?: true)
        .put("activeRestrictions", ux?.activeRestrictions ?: 511).put("foreground", active))
    private class ApiFailure(val code: String, val status: Int) : Exception()
    private fun request(path: String, body: JSONObject): JSONObject {
        val connection = URL(base + "/api/vehicle/" + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"; connection.connectTimeout = 4500; connection.readTimeout = 4500
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-Waymate-Device-Id", deviceId)
            connection.setRequestProperty("Authorization", "Bearer $deviceToken")
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { input ->
                val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val n = input.read(buffer); if (n < 0) break
                    require(output.size() + n <= 1048576); output.write(buffer, 0, n) }
                output.toByteArray()
            } ?: byteArrayOf()
            val json = JSONObject(String(bytes, Charsets.UTF_8))
            if (status !in 200..299) throw ApiFailure(json.optJSONObject("error")?.optString("code") ?: "FAILED", status)
            return json
        } finally { connection.disconnect() }
    }
    private fun save(json: JSONObject) {
        val expected = json.toString().toByteArray(Charsets.UTF_8)
        val out = cache.startWrite()
        try { out.write(expected); cache.finishWrite(out) }
        catch (e: Exception) { cache.failWrite(out); throw e }
        // A receipt is sent only after the exact delivery is readable from durable storage.
        val stored = cache.openRead().use { it.readBytes() }
        require(stored.contentEquals(expected))
    }
    private fun receive(json: JSONObject, token: Int) {
        val parsed = decodePersonalState(json, deviceId)
        handler.post {
            if (!active || token != generation) return@post
            try {
                if (parsed.phase == "revoked" || cachePairingId != null && cachePairingId != parsed.pairingId) {
                    cache.delete(); cachePairingId = null
                }
                if (parsed.delivery?.acknowledgedAt != null) { save(json); cachePairingId = parsed.pairingId }
                frame = json; lastReceived = SystemClock.elapsedRealtime()
                emit(parsed)
                val received = lastReceived
                handler.postDelayed({
                    if (active && token == generation && received == lastReceived) {
                        emit(PersonalVehicleState(phase = "offline", notice = "연결을 확인한 뒤 여행을 보여드릴게요."))
                    }
                }, 9000)
            } catch (_: Exception) { emit(PersonalVehicleState(phase = "error", notice = "여행 저장 상태를 확인해 주세요.")) }
        }
    }
    private fun failure(e: Exception, token: Int) {
        handler.post {
            if (!active || token != generation) return@post
            if (e is ApiFailure && e.status == 401) {
                cache.delete(); frame = null
                emit(PersonalVehicleState(phase = "unlinked", notice = "내 계정과 차량을 연결해 주세요."))
            } else emit(PersonalVehicleState(phase = "offline", notice = "연결을 확인해 주세요. 저장한 여행은 연결 확인 전까지 숨겨요."))
        }
    }
    private fun sync() {
        val token = generation
        if (!active) return
        try { receive(request("sync", uxBody()), token) } catch (e: Exception) { failure(e, token) }
    }
    fun resume() {
        active = true; generation++
        emit(PersonalVehicleState())
        poll?.cancel(false)
        poll = executor.scheduleWithFixedDelay(::sync, 0, 3, TimeUnit.SECONDS)
    }
    fun restriction(value: UxObservation?) {
        ux = value
        if (!locallyAllowed()) changed(PersonalVehicleState(phase = "blocked", notice = "정차 후 내 여행을 확인해 주세요."))
        if (active) executor.execute(::sync)
    }
    fun refresh() { if (active) executor.execute(::sync) }
    fun speechApi() = com.waymate.app.platform.speech.SpeechApi(base + "/api/vehicle/tts", mapOf(
        "X-Waymate-Device-Id" to deviceId, "Authorization" to "Bearer $deviceToken"))
    private fun action(path: String, body: JSONObject, before: (() -> Unit)? = null) {
        if (!locallyAllowed() || operation) return
        if (path != "enroll" && (!state.allowed || SystemClock.elapsedRealtime() - lastReceived >= 9000)) return
        operation = true
        val token = generation
        emit(state.copy(busy = true))
        executor.execute {
            try {
                if (!active || token != generation || !locallyAllowed()) return@execute
                before?.invoke()
                if (!active || token != generation || !locallyAllowed()) return@execute
                receive(request(path, body), token)
            } catch (e: Exception) { failure(e, token) }
            finally { operation = false; handler.post { if (active && token == generation) emit(state.copy(busy = false)) } }
        }
    }
    fun enroll() = action("enroll", JSONObject().put("deviceId", deviceId).put("deviceToken", deviceToken).put("name", "내 차 · ${deviceId.takeLast(6).uppercase()}"))
    fun confirm(accept: Boolean) {
        val pairing = state.pairingId ?: return
        action("confirm", JSONObject().put("pairingId", pairing).put("decision", if (accept) "accept" else "decline"))
    }
    fun acceptTrip() {
        val delivery = state.delivery ?: return
        val reviewed = frame?.let { JSONObject(it.toString()) } ?: return
        action("ack", JSONObject().put("pairingId", delivery.pairingId).put("deliveryId", delivery.id)
            .put("revision", delivery.revision), before = { save(reviewed); cachePairingId = delivery.pairingId })
    }
    fun unpair() {
        val pairing = state.pairingId ?: return
        action("unpair", JSONObject().put("pairingId", pairing))
    }
    fun pause() {
        active = false; generation++; poll?.cancel(false)
        changed(PersonalVehicleState(phase = "blocked"))
        executor.execute { try { request("sync", uxBody()) } catch (_: Exception) {} }
    }
    fun close() { pause(); executor.shutdown(); handler.removeCallbacksAndMessages(null) }
}
