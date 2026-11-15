package com.waymate.app.platform.speech

import com.waymate.app.platform.dialogue.ScenarioDialogue
import org.junit.Assert.*
import org.junit.Test

class ScenarioDialoguePolicyTest {
    @Test fun onlyExactPreparedDrivingSlotsCanPlayWhileMoving() {
        val short = "가상 바다쉼터에서 잠깐 바다를 보는 28분 예시예요."
        val script = ScenarioDialogue("openai", mapOf("drive.rest" to short, "peer.Q1" to "상대의 공개 소개예요."))
        assertTrue(script.permitsDriving(short))
        assertFalse(script.permitsDriving(short + " 버튼을 눌러 주세요."))
        assertFalse(script.permitsDriving("상대의 공개 소개예요."))
        assertFalse(script.copy(source = "fallback").permitsDriving(short))
        assertFalse(ScenarioDialogue("openai", mapOf("drive.rest" to "가".repeat(71))).permitsDriving("가".repeat(71)))
    }
}
