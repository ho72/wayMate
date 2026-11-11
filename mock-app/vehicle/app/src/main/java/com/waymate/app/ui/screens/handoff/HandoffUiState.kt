package com.waymate.app.ui.screens.handoff

import com.waymate.app.model.Journey

data class HandoffUiState(
    val loadEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val notice: String? = null,
    val journey: Journey? = null,
    val retryPending: Boolean = false,
    val startEnabled: Boolean = false,
    val preparation: Journey? = null,
    val navigation: com.waymate.app.model.NavigationUiState =
        com.waymate.app.model.NavigationUiState(),
)
