package com.waymate.app.ui.screens.handoff

import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.speech.WindowPlaybackLifecycle
import com.waymate.app.ui.testing.WindowReviewActivity
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.Assert.*
import org.junit.Test

/** Uses the production window/lifecycle binding and real audio, without any server or SDK driver. */
class WindowPlaybackLifecycleDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val sentence = "안녕하세요. 캐릭터한테 바다 먼저 보고 커피 마시는 걸 좋아한다고 들었어요."

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use {
            ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
        }
    }

    private fun await(message: String, check: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 15000
        while (!check() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50)
        assertTrue(message, check())
    }

    private fun portraitRight(scenario: ActivityScenario<WindowReviewActivity>) {
        instrumentation.waitForIdleSync()
        SystemClock.sleep(600)
        var width = 0
        var x = 0
        fun read() {
            scenario.onActivity {
                width = it.window.decorView.width
                val location = IntArray(2)
                it.window.decorView.getLocationOnScreen(location)
                x = location[0]
            }
        }
        read()
        if (width == 1682) {
            shell("input tap 2546 720")
            shell("input swipe 2540 720 1700 720 600")
        }
        await("Actual Pleos portrait window") { read(); width == 841 }
        SystemClock.sleep(600)
        if (x < 1000) movePortraitWindowRight()
        await("wayMate in right slot") { read(); x > 1700 && width == 841 }
        SystemClock.sleep(600)
        shell("input tap 2250 180")
        await("wayMate window focused") {
            var focused = false
            scenario.onActivity { focused = it.hasWindowFocus() }
            focused
        }
    }

    @Test
    fun nativePaneTouchStopsVisibleResumedPlaybackAndRefocusDoesNotResume() {
        ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
            portraitRight(scenario)
            val events = CopyOnWriteArrayList<SpeechState>()
            lateinit var speech: AgentSpeech
            scenario.onActivity {
                speech = AgentSpeech(it) { value -> events.add(value) }
                WindowPlaybackLifecycle(it, speech::allowPlayback)
                speech.speak(sentence)
            }
            try {
                await("Prepared clip started") { events.lastOrNull()?.phase == "speaking" }
                shell("input tap 1200 110") // Stock navigation pane, not wayMate's lifecycle.
                await("Native pane takes window focus") {
                    var lost = false
                    scenario.onActivity {
                        lost = !it.hasWindowFocus()
                        assertEquals(Lifecycle.State.RESUMED, it.lifecycle.currentState)
                        assertTrue(it.window.decorView.isShown)
                    }
                    lost
                }
                await("Visible but unfocused playback interrupted") {
                    events.lastOrNull()?.phase == "interrupted"
                }
                val starts = events.count { it.phase == "speaking" }
                shell("input tap 2250 180")
                await("Window focus returned") {
                    var focused = false
                    scenario.onActivity { focused = it.hasWindowFocus() }
                    focused
                }
                SystemClock.sleep(1200)
                assertEquals(starts, events.count { it.phase == "speaking" })
                assertEquals("interrupted", events.last().phase)
                scenario.onActivity { speech.speak(sentence) }
                await("Explicit new start works after refocus") {
                    events.count { it.phase == "speaking" } == starts + 1
                }
            } finally {
                scenario.onActivity { speech.close() }
            }
        }
    }

    @Test
    fun pausedActivityBlocksNewPlaybackAndResumeRequiresExplicitStart() {
        ActivityScenario.launch(WindowReviewActivity::class.java).use { scenario ->
            portraitRight(scenario)
            val events = CopyOnWriteArrayList<SpeechState>()
            lateinit var speech: AgentSpeech
            scenario.onActivity {
                speech = AgentSpeech(it) { value -> events.add(value) }
                WindowPlaybackLifecycle(it, speech::allowPlayback)
                speech.speak(sentence)
            }
            try {
                await("Prepared clip started") { events.lastOrNull()?.phase == "speaking" }
                scenario.moveToState(Lifecycle.State.CREATED)
                await("Pause stopped playback") { events.lastOrNull()?.phase == "interrupted" }
                val starts = events.count { it.phase == "speaking" }
                scenario.onActivity { speech.speak(sentence) }
                SystemClock.sleep(300)
                assertEquals(starts, events.count { it.phase == "speaking" })
                assertEquals("interrupted", events.last().phase)
                scenario.moveToState(Lifecycle.State.RESUMED)
                portraitRight(scenario)
                SystemClock.sleep(1200)
                assertEquals(starts, events.count { it.phase == "speaking" })
                assertEquals("interrupted", events.last().phase)
                scenario.onActivity { speech.speak(sentence) }
                await("Explicit start works after resume") {
                    events.count { it.phase == "speaking" } == starts + 1
                }
            } finally {
                scenario.onActivity { speech.close() }
            }
        }
    }
}
