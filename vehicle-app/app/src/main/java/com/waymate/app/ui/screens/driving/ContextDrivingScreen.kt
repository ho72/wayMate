package com.waymate.app.ui.screens.driving

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import android.os.SystemClock
import android.view.ViewTreeObserver
import com.waymate.app.model.*
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.*
import com.waymate.app.ui.screens.handoff.*
import com.waymate.app.ui.theme.*
import kotlinx.coroutines.delay

/** Production driving surface: no scroll, list selection, microphone simulation or approval. */
@Composable
fun ContextDrivingScreen(context: DrivingContext, state: DrivingUiState, speech: SpeechState,
    requestId: String, handled: Boolean, onHandled: () -> Unit,
    onSpeak: (String) -> Unit, onStop: () -> Unit, onEndCall: (() -> Unit)? = null) {
    val activity = LocalActivity.current
    var focused by remember(activity) { mutableStateOf(activity?.hasWindowFocus() != false) }
    val markHandled by rememberUpdatedState(onHandled)
    val stop by rememberUpdatedState(onStop)
    DisposableEffect(activity, requestId) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { value ->
            focused = value
            if (!value) { markHandled(); stop() }
        }
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) { focused = false; markHandled(); stop() }
            override fun onResume(owner: LifecycleOwner) { focused = activity?.hasWindowFocus() != false }
        }
        activity?.window?.decorView?.viewTreeObserver?.addOnWindowFocusChangeListener(listener)
        (activity as? LifecycleOwner)?.lifecycle?.addObserver(observer)
        onDispose {
            activity?.window?.decorView?.viewTreeObserver?.removeOnWindowFocusChangeListener(listener)
            (activity as? LifecycleOwner)?.lifecycle?.removeObserver(observer)
            stop()
        }
    }
    var leaseValid by remember(state.audioValidUntil) { mutableStateOf(SystemClock.elapsedRealtime() < state.audioValidUntil) }
    LaunchedEffect(state.audioValidUntil) {
        leaseValid = SystemClock.elapsedRealtime() < state.audioValidUntil
        if (leaseValid) { delay((state.audioValidUntil - SystemClock.elapsedRealtime()).coerceAtLeast(0)); leaseValid = false; markHandled(); onStop() }
    }
    LaunchedEffect(requestId, handled, focused, state.canPlayPreparedAudio, leaseValid, speech.available) {
        if (!handled && focused && state.canPlayPreparedAudio && leaseValid && speech.available) {
            onHandled() // Consume before playback; focus return/recomposition cannot replay it.
            onSpeak(context.narration)
        }
    }
    LaunchedEffect(state.canPlayPreparedAudio) { if (!state.canPlayPreparedAudio) onStop() }
    VehicleBackground(pageTag = context.title, mode = state.mode) {
        BoxWithConstraints(Modifier.fillMaxSize().testTag("driving-mode")) {
            val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
            val voice = currentAgentVoice(speech)
            val character: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier, horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    AgentVoiceBadge(voice, agentName(context.avatarId))
                    AgentVoicePortrait(context.avatarId, voice,
                        Modifier.fillMaxWidth().height(if (wide) 400.dp else 270.dp), animate = false)
                }
            }
            val information: @Composable (Modifier) -> Unit = { modifier ->
                Column(modifier, horizontalAlignment = if (wide) Alignment.Start else Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    Text(context.title, color = Ink, fontSize = 36.sp, lineHeight = 46.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.testTag("driving-context-title"))
                    CompanionInfoCard {
                        Text(context.headline, fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 3, overflow = TextOverflow.Ellipsis, color = Ink)
                        Text(context.detail, fontSize = 26.sp, lineHeight = 36.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Muted)
                    }
                    Text("정차하면 보던 화면에서 이어가요", fontSize = 24.sp, lineHeight = 32.sp, color = Forest)
                    if (speech.phase in listOf("speaking", "preparing") || (context.callActive && onEndCall != null))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                            if (context.callActive && onEndCall != null)
                                VehicleOutlineButton(onClick = onEndCall, modifier = Modifier.widthIn(max = 300.dp)) { Text("통화 종료") }
                            else TextButton(onClick = { onHandled(); onStop() }, modifier = Modifier.heightIn(min = 80.dp)) {
                                Text("안내 멈추기", fontSize = 26.sp)
                            }
                        }
                }
            }
            if (wide) Row(Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 60.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                character(Modifier.weight(1f)); information(Modifier.weight(1f))
            } else Column(Modifier.fillMaxSize().padding(horizontal = 32.dp, vertical = 36.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
                character(Modifier.fillMaxWidth()); information(Modifier.fillMaxWidth())
            }
        }
    }
}
