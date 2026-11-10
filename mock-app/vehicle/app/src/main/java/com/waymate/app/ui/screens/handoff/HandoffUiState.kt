package com.waymate.app.ui.screens.handoff

/** Display state supplied by the app layer; never a substitute for server consent. */
data class HandoffUiState(
    val loadEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val notice: String? = null,
)
