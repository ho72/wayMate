package com.waymate.app.data.repository

/** A review authorizes this one open final request, never a later replay round. */
internal object FinalSubmissionPolicy {
    fun maySubmit(
        status: String?,
        myChoice: String?,
        pending: Boolean,
        currentId: String?,
        currentRound: Int,
        currentRequest: String?,
        reviewedId: String,
        reviewedRound: Int,
        reviewedRequest: String,
    ): Boolean =
        status == "pending" &&
            myChoice == null &&
            !pending &&
            currentId == reviewedId &&
            currentRound == reviewedRound &&
            currentRequest != null &&
            currentRequest == reviewedRequest
}
