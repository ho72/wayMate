package com.waymate.app.platform.speech

import com.waymate.app.model.DrivingRecommendations
import com.waymate.app.model.DrivingUiState
import org.junit.Assert.*
import org.junit.Test

class DrivingNarrationPolicyTest {
    @Test fun onlyTheFixedLocalNarrationsAreAccepted() {
        assertTrue(DrivingUiState.allowsPreparedNarration(DrivingUiState.NARRATION))
        for (sample in DrivingRecommendations.entries) {
            assertTrue(sample.narration.codePointCount(0, sample.narration.length) <= 70)
            assertTrue(sample.narration.count { it == '.' } <= 1)
            assertTrue(DrivingUiState.allowsPreparedNarration(sample.narration))
            assertFalse(DrivingUiState.allowsPreparedNarration(sample.narration + " 안내를 시작했어요."))
        }
        assertFalse(DrivingUiState.allowsPreparedNarration("솔바람님의 사적인 메시지"))
        assertFalse(DrivingUiState.allowsPreparedNarration(""))
    }

    @Test fun missingQueriesNeverProduceAnUnrelatedRecommendation() {
        assertNull(DrivingRecommendations.forQuery(null))
        assertNull(DrivingRecommendations.forQuery("unknown"))
        assertEquals("rest-1", DrivingRecommendations.forQuery("nearby30")?.id)
        assertEquals("lunch-1", DrivingRecommendations.forQuery("lunch")?.id)
    }
}
