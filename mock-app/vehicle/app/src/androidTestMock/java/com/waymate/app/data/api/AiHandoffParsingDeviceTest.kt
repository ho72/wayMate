package com.waymate.app.data.api

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Uses Android's real JSON parser and the shared confirmed-AI wire example; no HTTP/SDK calls. */
class AiHandoffParsingDeviceTest {
    private fun handoff() = JSONObject(
        InstrumentationRegistry.getInstrumentation().context.assets.open("handoff-confirmed-ai.json")
            .bufferedReader().use { it.readText() }
    )

    @Test fun userConfirmedAiSummaryLoadsLikeTheExistingVehicleJourney() {
        val wire = handoff()
        val journey = JourneyParser.parse(wire)
        assertEquals(wire.getJSONObject("owner").getString("alias"), journey.alias)
        assertEquals(listOf("cafe"), journey.interests)
        assertEquals("light_humor", journey.style)
        assertEquals(1, journey.profileVersion)
        assertFalse(wire.toString().contains("introduction"))
    }

    @Test fun generatedButUnconfirmedAiSummaryCannotBeLoaded() {
        val wire = handoff()
        wire.getJSONObject("owner").getJSONObject("summary").put("summarySource", "ai_generated")
        try {
            JourneyParser.parse(wire)
            fail("Unconfirmed AI input must not become a vehicle journey")
        } catch (_: IllegalArgumentException) { /* Remains blocked. */ }
    }
}
