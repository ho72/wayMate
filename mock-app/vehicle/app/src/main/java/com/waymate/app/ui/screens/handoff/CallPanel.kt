package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ContentUiState
import com.waymate.app.platform.speech.SpeechState

@Composable
internal fun CallPanel(
    state: ContentUiState,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onAction: (String, String) -> Unit,
    onBack: () -> Unit,
) {
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
                onSpeak(call.lines[index].text)
            } else {
                running = false
                finished = true
            }
        }
    }
    DisposableEffect(call?.id) { onDispose { onStop() } }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("둘이 직접 통화하기", style = MaterialTheme.typography.headlineSmall)
        Text("시연 통화 · 준비된 음성과 자막\n마이크·전화번호 교환·실시간 상대 통신은 사용하지 않아요.")
        when (call?.status) {
            "requested" -> Text("나는 통화에 동의했어요. 솔바람의 통화 동의를 기다리고 있어요.")
            "active" -> {
                Text("양쪽 통화 동의 확인", style = MaterialTheme.typography.titleLarge)
                line?.let {
                    Text("${it.speaker} · 준비된 샘플", style = MaterialTheme.typography.labelLarge)
                    Text(it.text, style = MaterialTheme.typography.titleLarge)
                }
                Text(
                    when {
                        finished -> "샘플을 마쳤어요. 통화 종료를 누르면 콘텐츠 목록으로 돌아갈 수 있어요."
                        running && speech.phase == "speaking" -> "샘플 음성 재생 중"
                        running -> "샘플 음성 준비 중"
                        speech.phase == "interrupted" -> "샘플 일시중단 · 자동으로 다시 시작하지 않아요."
                        speech.phase == "unavailable" -> "음성 재생을 시작하지 못했어요. 자막을 확인하거나 통화를 종료해 주세요."
                        else -> "샘플을 들으려면 직접 시작해 주세요."
                    }
                )
                VehicleButton(
                    onClick = {
                        if (finished) {
                            index = 0
                            finished = false
                        }
                        running = true
                        call.lines.getOrNull(index)?.let { onSpeak(it.text) }
                    },
                    enabled =
                        state.canInteract &&
                            call.canPlay &&
                            speech.available &&
                            !running &&
                            line != null,
                ) {
                    Text(if (finished) "샘플 다시 듣기" else "현재 문장부터 샘플 듣기")
                }
                VehicleOutlineButton(
                    onClick = {
                        running = false
                        onStop()
                    },
                    enabled = running,
                ) {
                    Text("샘플 일시중단")
                }
                VehicleOutlineButton(
                    onClick = {
                        running = false
                        onStop()
                        finished = false
                        if (index < call.lines.lastIndex) index++ else finished = true
                    },
                    enabled = !running && line != null,
                ) {
                    Text("음성 없이 다음 자막")
                }
            }
            "declined" -> Text("이번 통화는 건너뛰었어요. 연결은 유지되고 다른 대화나 만남을 고를 수 있어요.")
            "cancelled",
            "ended" -> Text("통화를 마쳤어요. 이전 동의로 새 샘플을 자동 시작하지 않아요.")
            else -> Text("직접 목소리로 인사해볼래? 둘 다 원할 때만 샘플을 시작할게.")
        }
        state.actions["CALL_PROPOSE"]?.let { b ->
            VehicleButton(
                onClick = {
                    onStop()
                    onAction("CALL_PROPOSE", b)
                },
                enabled = state.canInteract,
            ) {
                Text("동의하고 통화 제안하기")
            }
        }
        for (type in listOf("CALL_CANCEL", "CALL_END")) state.actions[type]?.let { b ->
            VehicleOutlineButton(
                onClick = {
                    running = false
                    onStop()
                    onAction(type, b)
                }
            ) {
                Text(if (type == "CALL_CANCEL") "통화 제안 취소" else "통화 종료")
            }
        }
        if (call?.status !in listOf("requested", "active"))
            VehicleOutlineButton(
                onClick = {
                    onStop()
                    onBack()
                }
            ) {
                Text(if (call == null) "통화 건너뛰기" else "콘텐츠 목록으로")
            }
    }
}
