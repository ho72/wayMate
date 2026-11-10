package com.waymate.app.ui.screens.handoff

import com.waymate.app.model.Journey

data class HandoffUiState(
    val loadEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val notice: String? = null,
    val journey: Journey? = null,
    val retryPending: Boolean = false,
)
