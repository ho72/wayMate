package com.waymate.app.platform.restrictions

import org.junit.Assert.*
import org.junit.Test

class DrivingModePolicyTest {
    @Test fun generatedNativeProfilesMatchTheSharedPolicyConsumedByTheServer() {
        val raw = checkNotNull(javaClass.classLoader!!.getResourceAsStream("driving-policy.json"))
            .bufferedReader().use { it.readText() }
        val values = checkNotNull(Regex("\"allowedMasks\"\\s*:\\s*\\[([^]]+)\\]").find(raw))
            .groupValues[1].split(',').map { it.trim().toInt() }.toSet()
        assertEquals(values, DrivingProfiles.allowedMasks)
        for (value in values)
            assertEquals(InteractionMode.DRIVING_LIMITED, DrivingModePolicy.select(UxObservation(true, value)))
    }
    @Test fun unknownOrUnverifiedProfileNeverExposesParkedControls() {
        for (value in listOf(null, UxObservation(true, 511), UxObservation(false, 80), UxObservation(true, 1024)))
            assertEquals(InteractionMode.BLOCKED, DrivingModePolicy.select(value))
    }
    @Test fun realObservedParkDriveParkSequenceHasDistinctModes() {
        val values = listOf(UxObservation(false, 0), UxObservation(true, 80), UxObservation(false, 0))
        assertEquals(listOf(InteractionMode.PARKED, InteractionMode.DRIVING_LIMITED, InteractionMode.PARKED), values.map(DrivingModePolicy::select))
        assertEquals(listOf(false, true, false), values.map { it.restricted })
    }
}
