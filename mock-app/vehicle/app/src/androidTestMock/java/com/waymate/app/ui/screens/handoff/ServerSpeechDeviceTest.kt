package com.waymate.app.ui.screens.handoff

import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechApi
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import java.net.ServerSocket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Real HTTP, MP3 decoding and playback; no paid provider and no vehicle SDK commands. */
class ServerSpeechDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun await(check: () -> Boolean) {
        val end = SystemClock.uptimeMillis() + 12000
        while (!check() && SystemClock.uptimeMillis() < end) SystemClock.sleep(40)
        assertTrue(check())
    }
    private inner class Server(private val release: CountDownLatch = CountDownLatch(0),
        private val audioAsset: String = "speech-test.mp3", private val paymentBlocked: Boolean = false) : AutoCloseable {
        val socket = ServerSocket(0)
        val entered = CountDownLatch(1)
        val bodies = CopyOnWriteArrayList<JSONObject>()
        val headers = CopyOnWriteArrayList<String>()
        val api = SpeechApi("http://localhost:${socket.localPort}/api/vehicle/tts",
            mapOf("X-Waymate-Device-Id" to "test-device", "Authorization" to "Bearer test-device-token"))
        private val worker = thread(isDaemon = true) {
            while (!socket.isClosed) try {
                socket.accept().use { client ->
                    val input = client.getInputStream().buffered()
                    fun line(): String {
                        val output = java.io.ByteArrayOutputStream()
                        while (true) { val b = input.read(); if (b < 0 || b == 10) break; if (b != 13) output.write(b) }
                        return output.toString("UTF-8")
                    }
                    val first = line()
                    val lines = mutableListOf<String>()
                    while (true) { val header = line(); if (header.isEmpty()) break; lines.add(header) }
                    headers.addAll(lines)
                    val length = lines.firstOrNull { it.startsWith("Content-Length:", true) }?.substringAfter(':')?.trim()?.toInt() ?: 0
                    if (length > 0) {
                        val bytes = ByteArray(length); var read = 0
                        while (read < length) { val n = input.read(bytes, read, length - read); if (n < 0) break; read += n }
                        bodies.add(JSONObject(String(bytes, 0, read, Charsets.UTF_8)))
                    }
                    val config = first.contains("/config")
                    if (!config) { entered.countDown(); release.await(10, TimeUnit.SECONDS) }
                    val bytes = if (config) "{\"available\":true}".toByteArray()
                        else if (paymentBlocked) "{\"error\":{\"code\":\"TTS_PAYMENT_REQUIRED\"}}".toByteArray()
                        else instrumentation.context.assets.open(audioAsset).use { it.readBytes() }
                    val type = if (config || paymentBlocked) "application/json" else "audio/mpeg"
                    val status = if (!config && paymentBlocked) "503 Service Unavailable" else "200 OK"
                    client.getOutputStream().apply {
                        write("HTTP/1.1 $status\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        write(bytes); flush()
                    }
                }
            } catch (_: Exception) { /* Expected disconnect after interruption. */ }
        }
        override fun close() { release.countDown(); api.cancel(); socket.close(); worker.join(2000) }
    }

    @Test fun authenticatedServerAudioStartsStopsAndDeletesTemporaryAudio() {
        Server().use { server ->
            assertTrue(server.api.available())
            ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
                val events = CopyOnWriteArrayList<SpeechState>()
                lateinit var speech: AgentSpeech
                scenario.onActivity {
                    speech = AgentSpeech(it) { value -> events.add(value) }
                    speech.speakFromServer("함께 여행해요", server.api, "bear") { true }
                }
                try {
                    await { events.lastOrNull()?.phase == "speaking" }
                    assertEquals("elevenlabs", events.last().source)
                    assertTrue(server.headers.any { it.equals("Authorization: Bearer test-device-token", true) })
                    assertEquals("bear", server.bodies.single().getString("voice"))
                    assertTrue(server.bodies.single().getBoolean("consent"))
                    scenario.onActivity { speech.interrupt() }
                    await { events.lastOrNull()?.phase == "interrupted" }
                    assertTrue(instrumentation.targetContext.cacheDir.listFiles()?.none { it.name.startsWith("waymate-voice-") } != false)
                } finally { scenario.onActivity { speech.close() } }
            }
        }
    }

    @Test fun stoppedOrInvalidatedRequestCannotStartLateServerAudio() {
        val release = CountDownLatch(1)
        Server(release).use { server ->
            ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
                val events = CopyOnWriteArrayList<SpeechState>()
                lateinit var speech: AgentSpeech
                var permitted = true
                scenario.onActivity {
                    speech = AgentSpeech(it) { value -> events.add(value) }
                    speech.speakFromServer("늦은 음성", server.api, "dragon") { permitted }
                }
                assertTrue(server.entered.await(5, TimeUnit.SECONDS))
                scenario.onActivity { permitted = false; speech.interrupt() }
                release.countDown()
                SystemClock.sleep(1000)
                assertFalse(events.any { it.phase == "speaking" })
                scenario.onActivity { speech.close() }
            }
        }
    }

    @Test fun selectedDuruAndLumitRecordingsPlayWithoutAnyProviderCalls() {
        for ((voice, asset) in listOf("dragon" to "duru-harry-kim.mp3", "bear" to "lumit-han.mp3")) {
            Server(audioAsset = asset).use { server ->
                ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
                    val events = CopyOnWriteArrayList<SpeechState>()
                    lateinit var speech: AgentSpeech
                    scenario.onActivity {
                        speech = AgentSpeech(it) { value -> events.add(value) }
                        speech.speakFromServer("기존 샘플 MP3 재생 검수", server.api, voice) { true }
                    }
                    try {
                        await { events.lastOrNull()?.phase == "speaking" }
                        assertEquals("elevenlabs", events.last().source)
                        assertEquals(voice, server.bodies.single().getString("voice"))
                        scenario.onActivity { speech.interrupt() }
                        await { events.lastOrNull()?.phase == "interrupted" }
                    } finally { scenario.onActivity { speech.close() } }
                }
            }
        }
    }

    @Test fun paymentBlockedServerCannotBecomeSuccessfulSpeechOrLocalFallback() {
        Server(paymentBlocked = true).use { server ->
            ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
                val events = CopyOnWriteArrayList<SpeechState>()
                lateinit var speech: AgentSpeech
                scenario.onActivity {
                    speech = AgentSpeech(it) { value -> events.add(value) }
                    speech.speakFromServer("결제 제한 오류 검수", server.api, "dragon") { true }
                }
                try {
                    await { events.any { it.phase == "unavailable" && it.source == "elevenlabs" } }
                    assertFalse(events.any { it.phase == "speaking" })
                    assertFalse(events.any { it.source in listOf("android_tts", "prepared_sample") })
                } finally { scenario.onActivity { speech.close() } }
            }
        }
    }
}
