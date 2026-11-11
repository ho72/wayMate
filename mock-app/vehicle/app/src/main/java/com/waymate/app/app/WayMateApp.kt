package com.waymate.app.app

import androidx.compose.runtime.Composable
import com.waymate.app.ui.screens.handoff.HandoffScreen
import com.waymate.app.ui.screens.handoff.HandoffUiState

@Composable
fun WayMateApp(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
) {
    HandoffScreen(state = state, onLoadJourney = onLoadJourney, onStartTrip = onStartTrip)
}
