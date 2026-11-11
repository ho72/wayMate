package com.waymate.app.app

import androidx.compose.runtime.Composable
import com.waymate.app.ui.screens.handoff.HandoffScreen
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.screens.handoff.NavigationScreen

@Composable
fun WayMateApp(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
    onOpenNavigation: () -> Unit,
    onCloseNavigation: () -> Unit,
    onApproveNavigation: (String, String) -> Unit,
    onCancelNavigation: () -> Unit,
) {
    if (state.navigation.visible)
        NavigationScreen(
            state.navigation,
            onCloseNavigation,
            onApproveNavigation,
            onCancelNavigation,
        )
    else
        HandoffScreen(
            state = state,
            onLoadJourney = onLoadJourney,
            onStartTrip = onStartTrip,
            onOpenNavigation = onOpenNavigation,
        )
}
