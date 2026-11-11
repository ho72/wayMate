package com.waymate.app.data.repository

import org.junit.Assert.*
import org.junit.Test

class ResetNavigationPolicyTest {
    @Test
    fun cleanupApprovalMayQueueBehindReadOnlyObservationButNotAnUnconfirmedAction() {
        assertTrue(ResetNavigationPolicy.mayQueueBehindObservation("NAV_OBSERVE"))
        assertTrue(ResetNavigationPolicy.mayQueueBehindObservation(null))
        for (type in
            listOf(
                "NAV_APPROVE",
                "NAV_DISPATCH_BEGIN",
                "NAV_REPORT",
                "MEETING_PROPOSE",
                "RESET_ACK",
            )) assertFalse(ResetNavigationPolicy.mayQueueBehindObservation(type))
    }

    @Test
    fun noServerStateOnResumeDoesNotInspectOrDiscardPersistedJournal() {
        assertFalse(ResetNavigationPolicy.mayLeaveRecordedScope(null, "old", true, "removed", true))
        assertFalse(
            ResetNavigationPolicy.mayLeaveRecordedScope(null, "old", true, "not_dispatched", true)
        )
    }

    @Test
    fun everyUnfinishedCleanupConditionPreventsAcknowledgement() {
        assertTrue(
            ResetNavigationPolicy.mayAcknowledge(true, false, false, false, false, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(false, false, false, false, false, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, true, false, false, false, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, false, true, false, false, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, false, false, true, false, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, false, false, false, true, true, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, false, false, false, false, false, true)
        )
        assertFalse(
            ResetNavigationPolicy.mayAcknowledge(true, false, false, false, false, true, false)
        )
    }

    @Test
    fun oldUnexecutedJournalRequiresServerCompletedAttemptAndAcknowledgedReport() {
        assertFalse(
            ResetNavigationPolicy.mayLeaveRecordedScope(
                "current",
                "old",
                true,
                "not_dispatched",
                false,
            )
        )
        assertFalse(
            ResetNavigationPolicy.mayLeaveRecordedScope(
                "current",
                "old",
                false,
                "not_dispatched",
                true,
            )
        )
        assertTrue(
            ResetNavigationPolicy.mayLeaveRecordedScope(
                "current",
                "old",
                true,
                "not_dispatched",
                true,
            )
        )
    }

    @Test
    fun completedResetNeverMakesUnknownOrAppliedOwnedRecordSafeToDiscard() {
        for (outcome in listOf("unknown", "pending", "applied", null)) assertFalse(
            ResetNavigationPolicy.mayLeaveRecordedScope("current", "old", true, outcome, true)
        )
        assertTrue(
            ResetNavigationPolicy.mayLeaveRecordedScope("current", "old", true, "removed", false)
        )
    }

    @Test
    fun staleOrdinaryOrPreviousResetDialogCannotApproveCurrentCleanup() {
        assertFalse(ResetNavigationPolicy.reviewMatches("reset-2", "reset-1", "remove"))
        assertFalse(ResetNavigationPolicy.reviewMatches("reset-2", null, "remove"))
        assertFalse(ResetNavigationPolicy.reviewMatches("reset-2", "reset-2", "add"))
        assertFalse(ResetNavigationPolicy.reviewMatches(null, "reset-1", "remove"))
        assertTrue(ResetNavigationPolicy.reviewMatches("reset-2", "reset-2", "remove"))
        assertTrue(ResetNavigationPolicy.reviewMatches(null, null, "add"))
    }
}
