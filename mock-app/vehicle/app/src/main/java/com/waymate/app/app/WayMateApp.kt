package com.waymate.app.app

import androidx.compose.runtime.Composable
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.handoff.ContentScreen
import com.waymate.app.ui.screens.handoff.EndingScreen
import com.waymate.app.ui.screens.handoff.HandoffScreen
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.screens.handoff.MeetingScreen
import com.waymate.app.ui.screens.handoff.NavigationScreen
import com.waymate.app.ui.screens.handoff.ResetScreen

@Composable
fun WayMateApp(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
    onOpenNavigation: () -> Unit,
    onCloseNavigation: () -> Unit,
    onApproveNavigation: (String, String) -> Unit,
    onCancelNavigation: () -> Unit,
    onOpenMeeting: () -> Unit,
    onCloseMeeting: () -> Unit,
    onSocialAction: (String, String) -> Unit,
    onRetry: () -> Unit,
    onOpenContent: () -> Unit,
    onCloseContent: () -> Unit,
    onMessageRead: (String) -> Unit,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStopSpeech: () -> Unit,
    onOpenEnding: () -> Unit,
    onCloseEnding: () -> Unit,
    onProfileCue: (String) -> Unit,
) {
    if (state.reset.visible)
        ResetScreen(state.reset, onApproveNavigation, onCancelNavigation, onRetry, onSocialAction)
    else if (state.ending.visible)
        EndingScreen(
            state.ending,
            state.journey,
            speech,
            onSpeak,
            onStopSpeech,
            onSocialAction,
            onCloseEnding,
            onOpenNavigation,
            onRetry,
        )
    else if (state.content.visible)
        ContentScreen(
            state.content,
            state.journey,
            speech,
            onSpeak,
            onStopSpeech,
            onSocialAction,
            onMessageRead,
            onProfileCue,
            onCloseContent,
            onOpenMeeting,
            onRetry,
        )
    else if (state.navigation.visible)
        NavigationScreen(
            state.navigation,
            onCloseNavigation,
            onApproveNavigation,
            onCancelNavigation,
            state.social,
            onSocialAction,
            onRetry,
            state.journey,
        )
    else if (state.social.visible)
        MeetingScreen(
            state.social,
            onCloseMeeting,
            onSocialAction,
            onOpenNavigation,
            onRetry,
            state.journey,
        )
    else
        HandoffScreen(
            state = state,
            onLoadJourney = onLoadJourney,
            onStartTrip = onStartTrip,
            onOpenNavigation = onOpenNavigation,
            onOpenMeeting = onOpenMeeting,
            onSocialAction = onSocialAction,
            onOpenContent = onOpenContent,
            onOpenEnding = onOpenEnding,
        )
}
