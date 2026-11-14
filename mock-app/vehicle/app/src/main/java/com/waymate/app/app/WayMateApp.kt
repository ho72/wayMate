package com.waymate.app.app

import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.platform.LocalContext
import androidx.activity.ComponentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.waymate.app.ui.screens.extras.*
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.handoff.ContentScreen
import com.waymate.app.ui.screens.handoff.EndingScreen
import com.waymate.app.ui.screens.handoff.HandoffScreen
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.screens.handoff.MeetingScreen
import com.waymate.app.ui.screens.handoff.NavigationScreen
import com.waymate.app.ui.screens.handoff.ResetScreen
import com.waymate.app.ui.screens.handoff.DrivingScreen
import com.waymate.app.platform.restrictions.InteractionMode

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
    onOpenPersonalTrip: (() -> Unit)? = null,
) {
    val scope = "${state.journey?.handoffId}:${state.journey?.handoffVersion}:${state.journey?.tripVersion}"
    var extra by rememberSaveable(scope, stateSaver = listSaver<VehiclePageFlow, String>(
        save = { it.save() }, restore = { VehiclePageFlow.restore(it) },
    )) { mutableStateOf(VehiclePageFlow()) }
    val pages = rememberSaveableStateHolder()
    val activity = LocalContext.current as? ComponentActivity
    var foreground by remember { mutableStateOf(true) }
    DisposableEffect(activity) {
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) { foreground = false; extra = extra.unavailable(); onStopSpeech() }
            override fun onResume(owner: LifecycleOwner) { foreground = true }
        }
        activity?.lifecycle?.addObserver(observer)
        onDispose { activity?.lifecycle?.removeObserver(observer) }
    }
    val parked = state.driving.mode == InteractionMode.PARKED
    LaunchedEffect(parked, state.reset.visible) {
        if (!parked || state.reset.visible) extra = extra.unavailable()
    }
    LaunchedEffect(state.content.peerAlias, state.content.call?.status, state.ending.phase) {
        if ((extra.page == VehiclePage.VOICE && state.content.peerAlias == null) ||
            (extra.page == VehiclePage.MC && state.content.call?.status != "active") ||
            (extra.page == VehiclePage.REVIEW && state.ending.phase != "together")) extra = extra.home()
    }
    fun openExtra(page: VehiclePage) {
        onStopSpeech()
        extra = if (page == VehiclePage.ITINERARY) extra.reviewSchedule() else extra.open(page)
    }
    fun extraHome() { extra = extra.home(); onStopSpeech(); onCloseContent(); onCloseEnding() }
    if (state.driving.mode != InteractionMode.PARKED)
        DrivingScreen(state.driving, state.journey, speech, onSpeak, onStopSpeech)
    else Box(Modifier.testTag("parked-mode")) {
        if (state.reset.visible)
            ResetScreen(state.reset, onApproveNavigation, onCancelNavigation, onRetry, onSocialAction)
        else if (extra.page != VehiclePage.HOME)
            VehicleExtraScreen(extra, state.journey, foreground,
                { extra = it }, ::extraHome,
                { extra = extra.home() },
                {
                    extra = extra.home()
                    state.content.actions["CALL_END"]?.let { onSocialAction("CALL_END", it) }
                },
                { extra = extra.home() },
            )
        else if (state.ending.visible)
            pages.SaveableStateProvider("ending:${state.ending.scope}") { EndingScreen(
                state.ending,
                state.journey,
                speech,
                onSpeak,
                onStopSpeech,
                onSocialAction,
                onCloseEnding,
                onOpenNavigation,
                onRetry,
                onOpenItinerary = { openExtra(VehiclePage.ITINERARY) },
                onOpenReview = { openExtra(VehiclePage.REVIEW) },
            ) }
        else if (state.content.visible)
            pages.SaveableStateProvider("content:${state.content.scope}") { ContentScreen(
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
                onOpenPlaces = { openExtra(VehiclePage.REQUEST) },
                onOpenVoice = { openExtra(VehiclePage.VOICE) },
                onOpenMc = { openExtra(VehiclePage.MC) },
                onOpenItinerary = { openExtra(VehiclePage.ITINERARY) },
            ) }
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
                onOpenPersonalTrip = onOpenPersonalTrip,
                onOpenPlaces = { openExtra(VehiclePage.REQUEST) },
                onOpenItinerary = { openExtra(VehiclePage.ITINERARY) },
                onOpenVoice = { openExtra(VehiclePage.VOICE) },
                personalNavigationPending = extra.locked,
            )
    }
}
