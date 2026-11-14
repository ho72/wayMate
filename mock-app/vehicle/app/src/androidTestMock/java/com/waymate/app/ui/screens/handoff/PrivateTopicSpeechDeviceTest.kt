package com.waymate.app.ui.screens.handoff

import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.Assert.*
import org.junit.Test

/** Verify the partial-publication fallback can be read on Pleos without platform TTS. */
class PrivateTopicSpeechDeviceTest {
    @Test fun neutralTopicPlaysTheBundledClipAndCompletes() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val events = CopyOnWriteArrayList<SpeechState>()
        val text = "같은 날 강릉을 여행한다는 이야기로 시작해보면 어때요? 오늘 어떤 여행을 하고 싶은지 직접 물어볼 수도 있어요."
        lateinit var speech: AgentSpeech
        fun await(condition: () -> Boolean) {
            val until = System.currentTimeMillis() + 20000
            while (!condition() && System.currentTimeMillis() < until) Thread.sleep(50)
            assertTrue("Neutral Q2 prepared playback did not reach the expected state", condition())
        }
        instrumentation.runOnMainSync { speech = AgentSpeech(instrumentation.targetContext) { events.add(it) } }
        try {
            instrumentation.runOnMainSync { speech.speak(text) }
            await { events.any { it.phase == "speaking" && it.source == "prepared_sample" } }
            await { events.last().phase == "finished" }
            assertEquals(text, events.last().text)
            assertEquals("prepared_sample", events.last().source)
        } finally { instrumentation.runOnMainSync { speech.close() } }
    }
}
