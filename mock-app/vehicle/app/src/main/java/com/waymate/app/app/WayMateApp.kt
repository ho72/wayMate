package com.waymate.app.app

import androidx.compose.runtime.Composable
import com.waymate.app.ui.screens.handoff.HandoffScreen
import com.waymate.app.ui.screens.handoff.HandoffUiState

/** App composition root. Repository, navigation and platform wiring belong here. */
@Composable
fun WayMateApp() {
    // Preview only: keep loading disabled until handoff and restriction checks exist.
    HandoffScreen(
        state = HandoffUiState(),
        onLoadJourney = {},
    )
}
