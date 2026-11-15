package com.waymate.app.ui.screens.handoff

import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.BuildConfig
import com.waymate.app.platform.speech.SpeechApi
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import java.util.concurrent.CopyOnWriteArrayList

/** Opt-in live configuration check and playback check against explicitly captured audio. */
class LiveSpeechConfigurationDeviceTest {
    @Test fun installedEndpointReadsLiveServerConfiguration() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("verifyLiveServer") == "true")
        val api = SpeechApi(BuildConfig.API_BASE_URL + "/api/tts", mapOf("X-Demo-Actor" to "car"))
        try { assertTrue("Installed app reaches the configured live speech server", api.available()) }
        finally { api.cancel() }
    }

    /** Run only with the explicit bounded recording cache; never in ordinary CI. */
    @Test fun bothSelectedVoicesPlayThroughLiveServerUsingCapturedAudio() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("verifyCapturedVoices") == "true")
        val api = SpeechApi(BuildConfig.API_BASE_URL + "/api/tts", mapOf("X-Demo-Actor" to "car"))
        assertTrue(api.available())
        ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
            val events = CopyOnWriteArrayList<SpeechState>()
            lateinit var speech: AgentSpeech
            scenario.onActivity { speech = AgentSpeech(it) { value -> events.add(value) } }
            try {
                for (voice in listOf("dragon", "bear")) {
                    val start = events.size
                    scenario.onActivity { speech.speakFromServer("안녕. 반가워.", api, voice) { true } }
                    val deadline = SystemClock.uptimeMillis() + 15000
                    while (SystemClock.uptimeMillis() < deadline &&
                        events.drop(start).none { it.phase in listOf("finished", "unavailable") }) SystemClock.sleep(40)
                    val current = events.drop(start)
                    assertTrue("$voice starts actual downloaded MP3", current.any { it.source == "elevenlabs" && it.phase == "speaking" })
                    assertTrue("$voice finishes playback", current.any { it.source == "elevenlabs" && it.phase == "finished" })
                }
            } finally { scenario.onActivity { speech.close() }; api.cancel() }
        }
    }
}
