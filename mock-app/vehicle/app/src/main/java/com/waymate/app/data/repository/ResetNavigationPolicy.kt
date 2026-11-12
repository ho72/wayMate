package com.waymate.app.data.repository

/** Cleanup ACK is a fact, never an instruction to replay a physical operation. */
internal object ResetNavigationPolicy {
    fun mayQueueBehindObservation(pendingType: String?): Boolean =
        pendingType == null || pendingType == "NAV_OBSERVE"

    fun reviewMatches(
        activeResetId: String?,
        reviewedResetId: String?,
        operation: String,
    ): Boolean =
        activeResetId == reviewedResetId && (activeResetId == null || operation == "remove")

    fun mayAcknowledge(
        foreground: Boolean,
        hasPendingCommand: Boolean,
        hasSdkWork: Boolean,
        hasUnresolvedAttempt: Boolean,
        ownsWaypoint: Boolean,
        localRecordSettled: Boolean,
        freshRouteAfterReset: Boolean,
    ): Boolean =
        foreground &&
            !hasPendingCommand &&
            !hasSdkWork &&
            !hasUnresolvedAttempt &&
            !ownsWaypoint &&
            localRecordSettled &&
            freshRouteAfterReset

    fun mayLeaveRecordedScope(
        currentScope: String?,
        recordedScope: String,
        acknowledged: Boolean,
        outcome: String?,
        serverCompletedAttempt: Boolean,
    ): Boolean =
        currentScope != null &&
            (currentScope == recordedScope ||
                acknowledged &&
                    (outcome == "removed" || outcome == "not_dispatched" && serverCompletedAttempt))
}
