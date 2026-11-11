package com.waymate.app.data.repository

import com.waymate.app.model.Journey

/** Connection result; app layer maps it to screen state. */
data class HandoffConnectionState(
    val loadEnabled: Boolean = false,
    val isLoading: Boolean = false,
    val notice: String? = null,
    val journey: Journey? = null,
    val retryPending: Boolean = false,
    val startEnabled: Boolean = false,
    val preparation: Journey? = null,
)
