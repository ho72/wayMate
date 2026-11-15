package com.waymate.app.data.repository

import org.junit.Assert.*
import org.junit.Test

class FinalSubmissionPolicyTest {
    @Test
    fun currentUnsubmittedSlotNeedsNoPeerChoiceOrSubmission() {
        assertTrue(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                null,
                false,
                "id",
                1,
                "request",
                "id",
                1,
                "request",
            )
        )
    }

    @Test
    fun aSubmittedOrClosedSlotCannotBeChanged() {
        for (choice in listOf("together", "my_agent")) assertFalse(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                choice,
                false,
                "id",
                1,
                "request",
                "id",
                1,
                "request",
            )
        )
        for (status in listOf("together", "my_agent", "cancelled")) assertFalse(
            FinalSubmissionPolicy.maySubmit(
                status,
                null,
                false,
                "id",
                1,
                "request",
                "id",
                1,
                "request",
            )
        )
    }

    @Test
    fun staleDialogCannotAuthorizeANewIdRoundOrRequest() {
        assertFalse(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                null,
                false,
                "new",
                1,
                "request",
                "old",
                1,
                "request",
            )
        )
        assertFalse(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                null,
                false,
                "id",
                2,
                "request",
                "id",
                1,
                "request",
            )
        )
        assertFalse(
            FinalSubmissionPolicy.maySubmit("pending", null, false, "id", 1, "new", "id", 1, "old")
        )
        assertFalse(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                null,
                false,
                "id",
                1,
                null,
                "id",
                1,
                "request",
            )
        )
    }

    @Test
    fun unconfirmedTransportIsRecoveredBeforeAnotherSubmission() {
        assertFalse(
            FinalSubmissionPolicy.maySubmit(
                "pending",
                null,
                true,
                "id",
                1,
                "request",
                "id",
                1,
                "request",
            )
        )
    }
}
