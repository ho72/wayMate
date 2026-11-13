package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import com.waymate.app.model.DrivingUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.AgentCharacter
import com.waymate.app.ui.theme.*
import android.os.SystemClock
import kotlinx.coroutines.delay

/** Static DO surface. No business callbacks, scrolling, peer data, or microphone controls. */
@Composable
fun DrivingScreen(
    state: DrivingUiState,
    journey: Journey?,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
) {
    val driving = state.mode == InteractionMode.DRIVING_LIMITED
    var leaseValid by remember(state.audioValidUntil) {
        mutableStateOf(SystemClock.elapsedRealtime() < state.audioValidUntil)
    }
    LaunchedEffect(state.audioValidUntil, state.canPlayPreparedAudio) {
        leaseValid = SystemClock.elapsedRealtime() < state.audioValidUntil
        if (state.canPlayPreparedAudio && leaseValid) {
            delay((state.audioValidUntil - SystemClock.elapsedRealtime()).coerceAtLeast(0))
            leaseValid = false
            onStop()
        }
    }
    LaunchedEffect(state.mode, state.canPlayPreparedAudio) {
        if (!driving || !state.canPlayPreparedAudio) onStop()
    }
    DisposableEffect(Unit) { onDispose { onStop() } }
    Surface(Modifier.fillMaxSize().testTag(if (driving) "driving-mode" else "blocked-mode"), color = Canvas) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("wayMate", color = Forest, style = MaterialTheme.typography.headlineMedium)
            Text(
                if (driving) "주행 · 간편 모드" else "차량 상태 확인 · 기능 제한",
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            AgentCharacter(
                journey?.avatarId ?: "a-01",
                Modifier.weight(1f).fillMaxWidth(),
                speechPhase = speech.phase,
                motionEnabled = false,
            )
            Text(
                if (driving) state.status else "상태를 확인한 뒤 여행을 이어갈게요",
                style = MaterialTheme.typography.headlineSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                when (speech.phase) {
                    "speaking" -> "짧은 음성 안내 재생 중"
                    "preparing" -> "음성 안내 준비 중"
                    "interrupted" -> "음성 중단 · 자동 재개하지 않아요"
                    else -> "음성 안내 · 준비된 샘플"
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = Muted,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                if (driving) Button(
                    onClick = { onSpeak(DrivingUiState.NARRATION) },
                    enabled = state.canPlayPreparedAudio && leaseValid && speech.available &&
                        speech.phase !in listOf("speaking", "preparing"),
                    modifier = Modifier.weight(1f).heightIn(min = 64.dp),
                ) { Text("친구 한마디 듣기", style = MaterialTheme.typography.titleLarge) }
                OutlinedButton(onClick = onStop, modifier = Modifier.weight(1f).heightIn(min = 64.dp)) {
                    Text("음성 멈추기", style = MaterialTheme.typography.titleLarge)
                }
            }
            Text("상세 선택은 정차 후에 이어가요", color = Muted, maxLines = 1)
        }
    }
}
