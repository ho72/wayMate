package com.waymate.app.app

import androidx.compose.runtime.*
import androidx.activity.compose.BackHandler
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.LocalAgentNarrator
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.activity.compose.LocalActivity
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
import com.waymate.app.ui.components.LocalAgentSpeech
import com.waymate.app.ui.screens.handoff.DrivingScreen
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.model.DrivingContext
import com.waymate.app.model.DrivingContexts
import com.waymate.app.ui.screens.driving.ContextDrivingScreen
import com.waymate.app.platform.dialogue.ScenarioDialogue
import com.waymate.app.platform.dialogue.LocalScenarioDialogue

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
    onOpenPagePreview: (() -> Unit)? = null,
    dialogue: ScenarioDialogue = ScenarioDialogue(),
    onNarrate: ((AgentNarration) -> Unit)? = null,
    onSpeakDriving: ((String) -> Unit)? = null,
    contentInitialPage: String? = null,
    initialExtra: VehiclePageFlow? = null,
) {
    CompositionLocalProvider(LocalAgentSpeech provides speech, LocalScenarioDialogue provides dialogue, LocalAgentNarrator provides onNarrate) {
    val scope = "${state.journey?.handoffId}:${state.journey?.handoffVersion}:${state.journey?.tripVersion}"
    var extra by rememberSaveable(scope, stateSaver = listSaver<VehiclePageFlow, String>(
        save = { it.save() }, restore = { VehiclePageFlow.restore(it) },
    )) { mutableStateOf(initialExtra ?: VehiclePageFlow()) }
    var context by rememberSaveable(scope, stateSaver = listSaver<DrivingContext, String>(
        save = { it.save() }, restore = { DrivingContext.restore(it) ?: DrivingContexts.home(state.journey) },
    )) { mutableStateOf(DrivingContexts.home(state.journey)) }
    var contentContext by remember(scope) { mutableStateOf(DrivingContexts.content(contentInitialPage ?: "intro", state.content, state.journey)) }
    var drivingVisit by rememberSaveable(scope) { mutableStateOf(0) }
    var previousParked by rememberSaveable(scope) { mutableStateOf(false) }
    var handledDriving by rememberSaveable(scope) { mutableStateOf("") }
    val pages = rememberSaveableStateHolder()
    val activity = LocalActivity.current as? ComponentActivity
    var foreground by remember { mutableStateOf(true) }
    DisposableEffect(activity) {
        val focus = android.view.ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            foreground = hasFocus
            if (!hasFocus) { extra = extra.suspended(); onStopSpeech() }
        }
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) { foreground = false; extra = extra.suspended(); onStopSpeech() }
            override fun onResume(owner: LifecycleOwner) { foreground = true }
        }
        activity?.lifecycle?.addObserver(observer)
        activity?.window?.decorView?.viewTreeObserver?.addOnWindowFocusChangeListener(focus)
        onDispose {
            activity?.lifecycle?.removeObserver(observer)
            activity?.window?.decorView?.viewTreeObserver?.removeOnWindowFocusChangeListener(focus)
        }
    }
    val parked = state.driving.mode == InteractionMode.PARKED
    val parkedContext = when {
        state.reset.visible -> DrivingContext("reset", "여행 상태 확인", "여행 상태를 확인하고 있어요", "정차 후 확인을 이어가요", DrivingContexts.RESET)
        extra.page != VehiclePage.HOME -> DrivingContexts.extra(extra, state.journey)
        state.ending.visible -> DrivingContext("ending:${state.ending.phase}", "여행 이어가기",
            when (state.ending.phase) { "travel" -> "승인한 만남 장소로 이동해요"; "meeting" -> "친구와 첫 인사를 나누고 있어요"; "pending" -> "남은 여행의 선택을 기다려요"; "together" -> "함께 여행을 이어가요"; else -> "나만의 여행을 이어가요" },
            "여행 선택과 기록은 정차 후 이어가요", DrivingContexts.ENDING, state.journey?.avatarId ?: "a-01")
        state.content.visible -> contentContext
        state.navigation.visible -> DrivingContext("navigation", "내비 안내", state.navigation.status.take(80),
            "목적지 · ${state.navigation.destination}", DrivingContexts.ROUTE)
        state.social.visible -> DrivingContext("meeting", "만남 계획", state.social.meeting?.let { "${it.name} · ${it.start}–${it.end}" } ?: "친구와의 만남 계획",
            "상태 · ${state.social.meetingStatus.let { when(it) { "proposed" -> "상대 동의 대기"; "agreed", "confirmed" -> "서로 동의했어요"; else -> "장소와 시간 확인" } }}", DrivingContexts.MEETING)
        else -> DrivingContexts.home(state.journey)
    }
    LaunchedEffect(parked, parkedContext, state.content.call, state.content.threads) {
        if (state.reset.visible) { context = parkedContext; extra = extra.unavailable(); onStopSpeech() }
        else if (!parked && context.avatarId == "b-01" && state.content.peerAlias == null && state.social.peerAlias == null) {
            context = DrivingContexts.home(state.journey); onStopSpeech()
        }
        else if (parked) {
            if (!previousParked) drivingVisit++
            context = parkedContext; previousParked = true
        }
        else if (previousParked) { previousParked = false; extra = extra.suspended(); onStopSpeech() }
        else if (context.id == "content:call") context = DrivingContexts.content("call", state.content, state.journey)
        else if (context.id.startsWith("content:messages:")) {
            val thread = state.content.threads.find { it.id == context.id.removePrefix("content:messages:") }
            if (thread != null) context = DrivingContexts.content("messages", state.content, state.journey, thread = thread)
        }
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
    BackHandler(enabled = parked && !state.reset.visible && extra.page == VehiclePage.HOME &&
        (state.content.visible || state.navigation.visible || state.social.visible || state.ending.visible)) {
        onStopSpeech()
        when {
            state.ending.visible -> onCloseEnding()
            state.content.visible -> onCloseContent()
            state.navigation.visible -> onCloseNavigation()
            else -> onCloseMeeting()
        }
    }
    val drivingRequest = "$scope:${context.id}:${context.narration.hashCode()}:$drivingVisit"
    if (state.driving.mode == InteractionMode.DRIVING_LIMITED)
        ContextDrivingScreen(context, state.driving, speech, drivingRequest, handledDriving == drivingRequest,
            { handledDriving = drivingRequest }, onSpeakDriving ?: onSpeak, onStopSpeech,
            onEndCall = if (context.callActive) state.content.actions["CALL_END"]?.let { binding ->
                { onStopSpeech(); onSocialAction("CALL_END", binding) }
            } else null)
    else if (state.driving.mode == InteractionMode.BLOCKED)
        DrivingScreen(state.driving, state.journey, speech, onSpeak, onStopSpeech)
    else Box(Modifier.testTag("parked-mode")) {
        if (state.reset.visible)
            ResetScreen(state.reset, onApproveNavigation, onCancelNavigation, onRetry, onSocialAction)
        else if (extra.page != VehiclePage.HOME) key(scope) {
            VehicleExtraScreen(extra, state.journey, foreground,
                { onStopSpeech(); extra = it }, ::extraHome,
                { onStopSpeech(); extra = extra.home() },
                {
                    extra = extra.home()
                    state.content.actions["CALL_END"]?.let { onSocialAction("CALL_END", it) }
                },
                { onStopSpeech(); extra = extra.home() },
                onSpeak = onSpeak,
            )
        }
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
                peerAlias = state.social.peerAlias,
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
                initialPage = contentInitialPage,
                onDrivingContext = { contentContext = it },
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
                onOpenPagePreview = onOpenPagePreview,
            )
    }
    }
}
