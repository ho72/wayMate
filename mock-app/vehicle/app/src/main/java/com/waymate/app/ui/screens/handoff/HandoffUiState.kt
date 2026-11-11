package com.waymate.app.ui.screens.handoff

import com.waymate.app.model.Journey

data class HandoffUiState(
    val content: com.waymate.app.model.ContentUiState = com.waymate.app.model.ContentUiState(),
    val loadEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val notice: String? = null,
    val journey: Journey? = null,
    val retryPending: Boolean = false,
    val startEnabled: Boolean = false,
    val preparation: Journey? = null,
    val social: com.waymate.app.model.SocialUiState = com.waymate.app.model.SocialUiState(),
    val navigation: com.waymate.app.model.NavigationUiState =
        com.waymate.app.model.NavigationUiState(),
    val reset: com.waymate.app.model.ResetUiState = com.waymate.app.model.ResetUiState(),
)
