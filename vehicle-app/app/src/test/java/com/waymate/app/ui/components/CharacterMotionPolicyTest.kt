package com.waymate.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class CharacterMotionPolicyTest {
    @Test
    fun onlyPlaybackStartedMayUseSpeakingMotion() {
        assertEquals(CharacterMotion.SPEAKING, CharacterMotionPolicy.select("speaking", true, true))
        for (phase in
            listOf(
                "preparing",
                "initializing",
                "unavailable",
                "interrupted",
                "resting",
            )) assertEquals(CharacterMotion.STILL, CharacterMotionPolicy.select(phase, true, true))
        assertEquals(CharacterMotion.BREATHING, CharacterMotionPolicy.select("idle", true, true))
    }

    @Test
    fun windowLossAndRestrictionFreezeEveryState() {
        for (phase in listOf("idle", "speaking", "finished")) {
            assertEquals(CharacterMotion.STILL, CharacterMotionPolicy.select(phase, false, true))
            assertEquals(CharacterMotion.STILL, CharacterMotionPolicy.select(phase, true, false))
        }
    }
}
