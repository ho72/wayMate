package com.waymate.app.platform.dialogue

import com.waymate.app.platform.speech.AgentNarrationPolicy
import org.junit.Assert.*
import org.junit.Test

class ScenarioDialoguePolicyTest {
    @Test fun preparedFallbackInsideGeneratedPacketIsNeverLabelledAsGenerated() {
        val packet = ScenarioDialogue("openai", mapOf("peer.Q1" to "준비 답변", "peer.Q2" to "생성 답변"), fallbackSlots = setOf("peer.Q1"))
        assertFalse(packet.isGenerated("peer.Q1"))
        assertFalse(packet.isGenerated("peer.Q3"))
        assertTrue(packet.isGenerated("peer.Q2"))
    }
    @Test fun narrationVoicesFollowCharacterIdentityRatherThanText() {
        assertEquals("dragon", AgentNarrationPolicy.voice("a-01"))
        assertEquals("bear", AgentNarrationPolicy.voice("a-02"))
        assertEquals("bear", AgentNarrationPolicy.voice("b-01"))
        assertEquals("bear", AgentNarrationPolicy.voice("a-03"))
    }
}
