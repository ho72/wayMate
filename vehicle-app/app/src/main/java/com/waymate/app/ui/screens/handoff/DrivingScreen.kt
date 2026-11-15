package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.testTag
import com.waymate.app.model.DrivingUiState
import com.waymate.app.model.DrivingRecommendation
import com.waymate.app.platform.dialogue.LocalScenarioDialogue
import com.waymate.app.model.Journey
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.*
import com.waymate.app.ui.theme.*
import android.os.SystemClock
import android.view.ViewTreeObserver
import androidx.activity.compose.LocalActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.delay

/** Static driving surface with optional local recommendation. No route commands or microphone controls. */
@Composable
fun DrivingScreen(
    state: DrivingUiState,
    journey: Journey?,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    recommendation: DrivingRecommendation? = null,
    narrationRequestId: String? = null,
    onNarrationHandled: (String) -> Unit = {},
) {
    val driving = state.mode == InteractionMode.DRIVING_LIMITED
    val script = LocalScenarioDialogue.current
    val suggestion = recommendation.takeIf { driving }?.let { item ->
        item.copy(narration = script.line(if (item.query == "lunch") "drive.lunch" else "drive.rest", item.narration),
            reason = script.line("place.${item.id}", item.reason))
    }
    val activity = LocalActivity.current
    val latestRequest by rememberUpdatedState(narrationRequestId)
    val markHandled by rememberUpdatedState(onNarrationHandled)
    val stopPlayback by rememberUpdatedState(onStop)
    var audioForeground by remember(activity) { mutableStateOf(activity == null || activity.hasWindowFocus()) }
    DisposableEffect(activity) {
        var hadFocus = activity?.hasWindowFocus() == true
        fun cancelPending() {
            latestRequest?.let(markHandled)
            stopPlayback()
        }
        fun updateFocus(hasFocus: Boolean) {
            audioForeground = hasFocus &&
                ((activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) != false)
            if (!hasFocus && hadFocus) cancelPending()
            if (hasFocus) hadFocus = true
        }
        val focus = ViewTreeObserver.OnWindowFocusChangeListener { updateFocus(it) }
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) { audioForeground = false; cancelPending() }
            override fun onResume(owner: LifecycleOwner) { updateFocus(activity?.hasWindowFocus() == true) }
        }
        activity?.window?.decorView?.viewTreeObserver?.addOnWindowFocusChangeListener(focus)
        (activity as? LifecycleOwner)?.lifecycle?.addObserver(observer)
        if (activity != null) updateFocus(activity.hasWindowFocus())
        onDispose {
            activity?.window?.decorView?.viewTreeObserver?.removeOnWindowFocusChangeListener(focus)
            (activity as? LifecycleOwner)?.lifecycle?.removeObserver(observer)
            cancelPending()
        }
    }
    var leaseValid by remember(state.audioValidUntil) {
        mutableStateOf(SystemClock.elapsedRealtime() < state.audioValidUntil)
    }
    LaunchedEffect(state.audioValidUntil, state.canPlayPreparedAudio) {
        leaseValid = SystemClock.elapsedRealtime() < state.audioValidUntil
        if (state.canPlayPreparedAudio && leaseValid) {
            delay((state.audioValidUntil - SystemClock.elapsedRealtime()).coerceAtLeast(0))
            leaseValid = false
            latestRequest?.let(markHandled)
            onStop()
        }
    }
    LaunchedEffect(state.mode, state.canPlayPreparedAudio) {
        if (!driving) latestRequest?.let(markHandled)
        if (!driving || !state.canPlayPreparedAudio) onStop()
    }
    LaunchedEffect(narrationRequestId, suggestion?.id, driving, audioForeground,
        state.canPlayPreparedAudio, state.audioValidUntil, leaseValid, speech.available, speech.phase) {
        val request = narrationRequestId ?: return@LaunchedEffect
        val expired = state.audioValidUntil > 0 && SystemClock.elapsedRealtime() >= state.audioValidUntil
        if (!driving || expired) {
            onNarrationHandled(request)
        } else if (suggestion != null && audioForeground && state.canPlayPreparedAudio && leaseValid &&
            speech.available && speech.phase !in listOf("speaking", "preparing")) {
            // Claim before invoking playback: failures, focus restoration and fresh leases never retry this result.
            onNarrationHandled(request)
            onSpeak(suggestion.narration)
        }
    }
    val stopNarration: () -> Unit = {
        narrationRequestId?.let(onNarrationHandled)
        onStop()
    }
    VehicleBackground(Modifier.testTag(if (driving) "driving-mode" else "blocked-mode"),
        pageTag = if (!driving) "기능 제한" else if (suggestion != null) "장소 추천" else "나만의 여행", mode = state.mode) {
        val voice = currentAgentVoice(speech)
        BoxWithConstraints {
            val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
            if (wide) Row(
                Modifier.fillMaxSize().padding(start = 32.dp, end = 32.dp, top = 120.dp, bottom = 40.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(36.dp),
            ) {
                DrivingCharacter(journey?.avatarId ?: "a-01", voice, Modifier.weight(1f), 460.dp)
                DrivingDetails(state, suggestion, speech, leaseValid, onSpeak, stopNarration, Modifier.weight(1f))
            } else Column(Modifier.fillMaxSize().verticalScroll(androidx.compose.foundation.rememberScrollState()).heightIn(min = maxHeight).padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterVertically)) {
                DrivingCharacter(journey?.avatarId ?: "a-01", voice, Modifier.fillMaxWidth(), 300.dp)
                DrivingDetails(state, suggestion, speech, leaseValid, onSpeak, stopNarration, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun DrivingCharacter(avatarId: String, voice: AgentVoicePresentation, modifier: Modifier, portraitHeight: androidx.compose.ui.unit.Dp) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp)) {
        AgentVoiceBadge(voice, agentName(avatarId))
        AgentVoicePortrait(avatarId, voice, Modifier.fillMaxWidth().height(portraitHeight), animate = false)
    }
}

@Composable
private fun DrivingDetails(state: DrivingUiState, suggestion: DrivingRecommendation?, speech: SpeechState,
    leaseValid: Boolean, onSpeak: (String) -> Unit, onStop: () -> Unit, modifier: Modifier) {
    val driving = state.mode == InteractionMode.DRIVING_LIMITED
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (suggestion != null) DrivingRecommendationCard(suggestion)
        else Text(
            if (driving) state.status else "상태를 확인한 뒤 여행을 이어갈게요",
            style = MaterialTheme.typography.headlineSmall,
            maxLines = 2,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        if (suggestion != null && speech.phase in listOf("speaking", "preparing")) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onStop, modifier = Modifier.width(220.dp).heightIn(min = 80.dp)) {
                Text("안내 멈추기", fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold)
            }
        } else if (suggestion == null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            if (driving) VehicleButton(
                onClick = { onSpeak(suggestion?.narration ?: DrivingUiState.NARRATION) },
                enabled = state.canPlayPreparedAudio && leaseValid && speech.available &&
                    speech.phase !in listOf("speaking", "preparing"),
                modifier = Modifier.weight(1f).heightIn(min = 80.dp),
            ) { Text("친구 한마디 듣기", style = MaterialTheme.typography.titleLarge) }
            VehicleOutlineButton(onClick = onStop, modifier = Modifier.weight(1f).heightIn(min = 80.dp)) {
                Text("음성 멈추기", style = MaterialTheme.typography.titleLarge)
            }
        }
        Text(if (suggestion != null) "상세 비교는 정차 후 목록에서 이어가요" else "상세 선택은 정차 후에 이어가요",
            color = Muted, maxLines = 1)
    }
}

@Composable
private fun DrivingRecommendationCard(suggestion: DrivingRecommendation) {
    CompanionInfoCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Text(if (suggestion.query == "lunch") "점심 추천 · 가상" else "30분 휴식 추천 · 가상",
                color = Muted, fontSize = 26.sp, lineHeight = 36.sp)
            Text(suggestion.total, color = Forest, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }
        Text(suggestion.placeName, fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold, color = Ink)
        Text(suggestion.summary, fontSize = 24.sp, lineHeight = 32.sp, color = Ink)
        Text(suggestion.reason, fontSize = 26.sp, lineHeight = 36.sp, color = Muted)
    }
}
