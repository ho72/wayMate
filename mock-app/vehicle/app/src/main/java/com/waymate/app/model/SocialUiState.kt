package com.waymate.app.model

data class MeetingPlan(val name: String, val date: String, val start: String, val end: String) {
    val minutes: Long? get() = runCatching {
        java.time.Duration.between(java.time.LocalTime.parse(start), java.time.LocalTime.parse(end)).toMinutes().takeIf { it > 0 }
    }.getOrNull()
}

/** Current live relationship; receipt/ACK history never grants peer authority. */
data class SocialUiState(
    val visible: Boolean = false,
    val peerAlias: String? = null,
    val connectionStatus: String = "none",
    val meetingStatus: String = "none",
    val notice: String = "",
    val actions: Map<String, String> = emptyMap(),
    val canInteract: Boolean = false,
    val cleanupRequired: Boolean = false,
    val retryPending: Boolean = false,
    val canRetry: Boolean = false,
    val meeting: MeetingPlan? = null,
)
