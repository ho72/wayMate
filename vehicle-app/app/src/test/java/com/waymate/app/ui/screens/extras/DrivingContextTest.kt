package com.waymate.app.ui.screens.extras
import com.waymate.app.model.*
import org.junit.Assert.*
import org.junit.Test
class DrivingContextTest {
    @Test fun everyExtraPageHasAReadOnlyProjection() {
        VehiclePage.entries.forEach { page ->
            val context = DrivingContexts.extra(VehiclePageFlow(page = page), null)
            assertTrue(page.name, context.title.isNotBlank() && context.headline.isNotBlank() && context.narration.isNotBlank())
        }
    }
    @Test fun selectedPlaceSurvivesInsteadOfShowingFirstRecommendation() {
        val flow = VehiclePageFlow().chooseQuery(true).select("lunch-2")
        assertEquals("솔숲식당", DrivingContexts.extra(flow, null).headline)
        assertEquals(flow.page, flow.suspended().page)
    }
    @Test fun movingDropsApprovalButRetainsPlaceAndRequestIdentity() {
        val flow = VehiclePageFlow().chooseQuery(false).select("rest-2").reviewRoute()
        val paused = flow.suspended()
        assertEquals(VehiclePage.REST_DETAIL, paused.page)
        assertEquals("rest-2", paused.placeId)
        assertNull(paused.request)
        assertEquals(0, paused.sequence)
        val pending = flow.approve()
        assertEquals(pending.request, pending.suspended().request)
    }
    @Test fun waitingAndPreCallDoNotClaimArrivalOrCallCompletion() {
        val waiting = ContentThread("waiting", "waiting", "질문", null, null, null, false)
        val state = ContentUiState(threads = listOf(waiting))
        assertEquals("친구의 답장을 기다리고 있어요", DrivingContexts.content("messages", state, null).headline)
        assertEquals(DrivingContexts.FRIEND, DrivingContexts.content("messages", state, null).narration)
        assertEquals("정차 후 통화를 제안해요", DrivingContexts.content("call", state, null).headline)
    }
    @Test fun selectedReplyAndAnswerArePreserved() {
        val chosen = ContentThread("selected", "received", "질문", "선택한 친구의 답장", "후속 질문", null, true)
        val state = ContentUiState(threads = listOf(chosen, chosen.copy(id = "other", response = "다른 답장")))
        val context = DrivingContexts.content("messages", state, null, thread = chosen)
        assertEquals("선택한 친구의 답장", context.headline)
        assertEquals(context.headline, context.narration)
        assertEquals("content:messages:selected", context.id)
        assertEquals(context, DrivingContext.restore(context.save()))
    }
}
