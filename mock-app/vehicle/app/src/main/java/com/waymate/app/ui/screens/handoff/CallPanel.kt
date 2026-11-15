package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.painterResource
import com.waymate.app.R
import com.waymate.app.ui.components.AgentVoicePresentation
import com.waymate.app.ui.components.AgentVoicePhase
import com.waymate.app.ui.components.AgentVoicePortrait
import com.waymate.app.ui.components.agentName
import com.waymate.app.ui.components.AgentVoiceBadge
import com.waymate.app.ui.components.currentAgentVoice
import androidx.compose.foundation.background
import com.waymate.app.ui.components.AgentCharacter
import com.waymate.app.ui.components.VehicleBackButton
import com.waymate.app.ui.theme.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ContentUiState
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.LocalAgentNarrator

@Composable
internal fun CallPanel(
    state: ContentUiState,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onAction: (String, String) -> Unit,
    onBack: () -> Unit,
    myAvatar: String = "a-01",
    onOpenMc: (() -> Unit)? = null,
) {
    val narrator = LocalAgentNarrator.current
    fun speakLine(line: com.waymate.app.model.CallSampleLine) {
        narrator?.invoke(AgentNarration(line.text, if (line.speaker == state.peerAlias) "b-01" else myAvatar)) ?: onSpeak(line.text)
    }
    val call = state.call
    var index by remember(call?.id) { mutableIntStateOf(0) }
    var running by remember(call?.id) { mutableStateOf(false) }
    var finished by remember(call?.id) { mutableStateOf(false) }
    val line = call?.lines?.getOrNull(index)
    LaunchedEffect(call?.id, call?.canPlay, state.canInteract) {
        if (call?.canPlay != true || !state.canInteract) {
            running = false
            onStop()
        }
    }
    LaunchedEffect(speech.phase, speech.text, call?.id) {
        if (running && speech.phase in listOf("interrupted", "unavailable")) running = false
        if (
            running &&
                call?.canPlay == true &&
                state.canInteract &&
                speech.phase == "finished" &&
                speech.text == line?.text
        ) {
            if (index < call.lines.lastIndex) {
                index++
                speakLine(call.lines[index])
            } else {
                running = false
                finished = true
            }
        }
    }
    DisposableEffect(call?.id) { onDispose { onStop() } }
    val active = call?.status == "active"
    val waiting = call?.status == "requested"
    val callVoice = if (active) currentAgentVoice(speech) else AgentVoicePresentation(AgentVoicePhase.IDLE)
    val currentSpeaker = line?.speaker.takeIf { active && (speech.text == line?.text || callVoice.simulated) }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
        Column(Modifier.fillMaxSize().padding(start = 32.dp, end = 32.dp, top = 112.dp, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), contentAlignment = Alignment.Center) {
                val participants: @Composable () -> Unit = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        Text("${state.peerAlias ?: "친구"}님과 통화", fontSize = 38.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold, color = Ink)
                        Surface(color = Mint, shape = androidx.compose.foundation.shape.RoundedCornerShape(24.dp)) {
                            Text(when (call?.status) {
                                "active" -> "통화 중 · 시연"
                                "requested" -> "상대의 동의를 기다리는 중"
                                "ended", "cancelled" -> "통화를 마쳤어요"
                                "declined" -> "이번 통화는 건너뛰어요"
                                else -> "서로 동의하면 시작해요"
                            }, Modifier.padding(horizontal = 24.dp, vertical = 12.dp), style = MaterialTheme.typography.titleMedium, color = Forest)
                        }
                        AgentVoiceBadge(callVoice, if (currentSpeaker == state.peerAlias && currentSpeaker != null) agentName("b-01") else if (currentSpeaker != null) agentName(myAvatar) else null)
                        Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
                            CallParticipant(myAvatar, "나", if (currentSpeaker != null && currentSpeaker != state.peerAlias) callVoice else AgentVoicePresentation(AgentVoicePhase.IDLE))
                            Text(if (active) "···" else "↔", color = Forest, fontSize = 32.sp)
                            CallParticipant("b-01", state.peerAlias ?: "친구", if (currentSpeaker == state.peerAlias) callVoice else AgentVoicePresentation(AgentVoicePhase.IDLE))
                        }
                    }
                }
                val caption: @Composable () -> Unit = {
                    CompanionInfoCard {
                        state.notice?.let { Text(it) }
                        if (active) {
                            Text("준비된 통화 자막", style = MaterialTheme.typography.bodySmall, color = Muted)
                            line?.let { Text(it.speaker, style = MaterialTheme.typography.titleMedium, color = Forest)
                                Text(it.text, fontSize = 30.sp, lineHeight = 42.sp, fontWeight = FontWeight.SemiBold) }
                            Text(when {
                                finished -> "샘플을 모두 들었어요."
                                running && speech.phase == "speaking" -> "샘플 음성을 듣고 있어요"
                                running -> "샘플 음성을 준비하고 있어요"
                                speech.phase == "interrupted" -> "재생을 멈췄어요. 직접 다시 시작해 주세요."
                                speech.phase == "unavailable" || !speech.available -> "지금은 자막으로 확인해 주세요."
                                else -> "재생을 누르면 준비된 샘플을 들어요."
                            }, style = MaterialTheme.typography.bodyMedium)
                        } else Text(when (call?.status) {
                            "requested" -> "나는 통화에 동의했어요. 상대가 동의하면 통화 시연을 시작할 수 있어요."
                            "declined" -> "연결은 유지돼요. 다른 대화나 만남을 골라도 좋아요."
                            "ended", "cancelled" -> "이전 동의로 새 통화를 자동 시작하지 않아요."
                            else -> "목소리로 인사해볼까요? 두 분이 원할 때만 시작해요."
                        }, style = MaterialTheme.typography.titleLarge)
                        Text("준비된 음성·자막 시연이에요. 마이크와 실시간 상대 통신은 연결하지 않아요.", style = MaterialTheme.typography.bodySmall, color = Muted)
                    }
                }
                if (wide) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(36.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { participants() }
                    Box(Modifier.weight(1f)) { caption() }
                } else Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    participants(); caption()
                }
            }
            if (active || waiting) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.Top) {
                if (active) {
                    CallControl(if (running) "재생 멈추기" else if (finished) "다시 듣기" else "샘플 듣기", if (running) R.drawable.ic_pause else R.drawable.ic_play,
                        enabled = running || (state.canInteract && call!!.canPlay && speech.available && line != null)) {
                        if (running) { running = false; onStop() }
                        else { if (finished) { index = 0; finished = false }; running = true; call!!.lines.getOrNull(index)?.let { speakLine(it) } }
                    }
                    CallControl("다음 자막", R.drawable.ic_next, enabled = state.canInteract && !running && line != null) {
                        onStop(); finished = false
                        if (index < call!!.lines.lastIndex) index++ else finished = true
                    }
                }
                val type = if (active) "CALL_END" else "CALL_CANCEL"
                state.actions[type]?.let { binding ->
                    CallControl(if (active) "통화 종료" else "제안 취소", R.drawable.ic_call_end, end = true) {
                        running = false; onStop(); onAction(type, binding)
                    }
                }
            }
            if (active && state.canInteract) onOpenMc?.let { open ->
                TextButton(onClick = { onStop(); open() }, modifier = Modifier.heightIn(min = 80.dp).widthIn(min = 260.dp)) {
                    Text("MC 참여 제안", style = MaterialTheme.typography.titleMedium)
                }
            }
            if (!active && !waiting) CompanionActionGrid(buildList {
                state.actions["CALL_PROPOSE"]?.let { b -> add(CompanionActionItem("동의하고 통화 제안", { onStop(); onAction("CALL_PROPOSE", b) }, state.canInteract)) }
                add(CompanionActionItem(if (call == null) "통화 건너뛰기" else "대화 목록으로", { onStop(); onBack() }, secondary = true, quiet = call == null))
            })
        }
        VehicleBackButton({ onStop(); onBack() }, Modifier.align(Alignment.TopStart).padding(start = 28.dp, top = 8.dp))
    }
}

@Composable
private fun CallParticipant(avatar: String, name: String, voice: AgentVoicePresentation) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(176.dp).background(Color.White.copy(alpha = .55f), CircleShape)) {
            AgentVoicePortrait(avatar, voice, Modifier.fillMaxSize().padding(12.dp), animate = true)
        }
        Text(name, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun CallControl(label: String, icon: Int, enabled: Boolean = true, end: Boolean = false, onClick: () -> Unit) {
    Column(Modifier.width(184.dp).heightIn(min = 156.dp).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
        .padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(Modifier.size(96.dp), color = if (end) Color(0xFFAE3B41) else if (enabled) Forest else Color(0xFFD7E3E8), shape = CircleShape) {
            Box(contentAlignment = Alignment.Center) {
                Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(40.dp),
                    tint = if (enabled || end) Color.White else Muted)
            }
        }
        Text(label, style = MaterialTheme.typography.bodyMedium, color = if (end) Color(0xFF942E35) else Ink, textAlign = TextAlign.Center)
    }
}
