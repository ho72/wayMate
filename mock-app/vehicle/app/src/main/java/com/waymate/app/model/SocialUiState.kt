package com.waymate.app.model

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
)
