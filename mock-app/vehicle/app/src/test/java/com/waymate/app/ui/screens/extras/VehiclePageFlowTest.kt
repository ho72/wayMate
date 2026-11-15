package com.waymate.app.ui.screens.extras

import org.junit.Assert.*
import org.junit.Test

class VehiclePageFlowTest {
    private fun detail(lunch: Boolean = false) = VehiclePageFlow().chooseQuery(lunch)
        .select(if (lunch) "lunch-2" else "rest-1")

    @Test fun cancellingApprovalReturnsToTheActualEntryWithoutSendingAnything() {
        for (lunch in listOf(false, true)) for (destination in listOf(null, "기존 개인 방문지")) {
            val detail = detail(lunch).copy(destination = destination)
            val review = detail.reviewRoute()
            assertEquals(if (destination == null) VehiclePage.DESTINATION_REVIEW else VehiclePage.WAYPOINT_REVIEW, review.page)
            val back = review.back()
            assertEquals(detail.page, back.page)
            assertEquals(detail.placeId, back.placeId)
            assertEquals(detail.query, back.query)
            assertNull(back.request)
            assertEquals(0, back.sequence)
        }
        val schedule = VehiclePageFlow(destination = null).reviewSchedule()
        assertEquals(VehiclePage.ITINERARY, schedule.reviewRoute().back().page)
    }

    @Test fun approvalsKeepTheirOwnPlaceAndDistinguishWaypointFromDestination() {
        val add = detail(true).reviewRoute().approve()
        assertEquals("lunch", add.request?.query)
        assertEquals("lunch-2", add.request?.placeId)
        assertEquals(PreviewOperation.ADD_WAYPOINT, add.request?.operation)
        val added = add.complete(1, PreviewOutcome.SUCCESS)
        assertEquals(VehiclePage.WAYPOINT_DONE, added.page)
        assertEquals("기존 개인 방문지", added.destination)
        assertEquals("lunch-2", added.waypoint)
        val set = detail().copy(destination = null).reviewRoute().approve().complete(1, PreviewOutcome.SUCCESS)
        assertEquals(VehiclePage.DESTINATION_DONE, set.page)
        assertEquals("rest-1", set.destination)
        assertNull(set.waypoint)
    }

    @Test fun pendingUnknownAndHomeNeverCreateDuplicatesAndIgnoreOldResults() {
        val pending = detail().reviewRoute().approve()
        assertEquals(pending, pending.approve())
        assertEquals(pending, pending.back())
        assertEquals(pending, pending.complete(99, PreviewOutcome.SUCCESS))
        val unknown = pending.complete(1, PreviewOutcome.UNKNOWN)
        val reopened = unknown.home().open(VehiclePage.REQUEST)
        assertEquals(VehiclePage.NAV_UNKNOWN, reopened.page)
        assertEquals(1, reopened.sequence)
        assertEquals(reopened, reopened.chooseQuery(true))
        assertEquals(reopened, reopened.approve())
        assertEquals(VehiclePage.ITINERARY, reopened.reviewSchedule().page)
        assertEquals("rest-1", reopened.reviewSchedule().placeId)
        assertEquals(PreviewStatus.SUCCESS, reopened.complete(1, PreviewOutcome.SUCCESS).status)
    }

    @Test fun failureReturnsToSamePlaceAndRetryRequiresNewApproval() {
        val failed = detail(true).reviewRoute().approve().complete(1, PreviewOutcome.FAILED)
        val detail = failed.retryReview()
        assertEquals(VehiclePage.LUNCH_DETAIL, detail.page)
        assertEquals("lunch-2", detail.placeId)
        assertEquals(1, detail.sequence)
        val retry = detail.reviewRoute().approve()
        assertEquals(2, retry.request?.id)
        assertEquals(retry, retry.complete(1, PreviewOutcome.SUCCESS))
        assertEquals(VehiclePage.WAYPOINT_DONE, retry.complete(2, PreviewOutcome.SUCCESS).page)
    }

    @Test fun routeChangeDuringReviewRequiresReviewAgainAndCannotOverwriteDestination() {
        val review = detail().copy(destination = null).reviewRoute()
        val changed = review.copy(destination = "새로 생긴 목적지").approve()
        assertEquals(VehiclePage.WAYPOINT_REVIEW, changed.page)
        assertNull(changed.request)
        val pending = changed.approve()
        val mismatched = pending.copy(destination = "다른 경로").complete(1, PreviewOutcome.SUCCESS)
        assertEquals(VehiclePage.NAV_UNKNOWN, mismatched.page)
        assertNull(mismatched.waypoint)
    }

    @Test fun interruptionAndRestoreDiscardApprovalsAndNeverRestartPendingWorkOrVoice() {
        val detail = detail().reviewRoute()
        assertEquals(VehiclePage.REST_DETAIL, detail.unavailable().page)
        assertNull(detail.unavailable().request)
        val pending = detail.approve()
        val restored = VehiclePageFlow.restore(pending.save())
        assertEquals(VehiclePage.NAV_UNKNOWN, restored.page)
        assertTrue(restored.locked)
        assertEquals(pending.request, restored.request)
        val paused = VehiclePageFlow(page = VehiclePage.VOICE, voicePhase = "talking", voiceLine = 2)
        assertEquals("paused", paused.unavailable().voicePhase)
        assertEquals("paused", VehiclePageFlow.restore(paused.save()).voicePhase)
        val interrupted = pending.unavailable().home().open(VehiclePage.REQUEST)
        assertEquals(VehiclePage.NAV_UNKNOWN, interrupted.page)
    }

    @Test fun reviewIsExplicitAndAppliedOnlyOnceForEachAvatar() {
        val initial = VehiclePageFlow(page = VehiclePage.REVIEW)
        assertEquals(initial, initial.applyDecoration("a-01"))
        val applied = initial.copy(reviewFinished = true).applyDecoration("a-01")
        assertEquals(applied, applied.applyDecoration("a-01"))
        val other = applied.applyDecoration("a-02")
        assertEquals("a-01|a-02", other.decoratedAvatars)
        assertEquals(other, VehiclePageFlow.restore(other.save()))
    }
}
