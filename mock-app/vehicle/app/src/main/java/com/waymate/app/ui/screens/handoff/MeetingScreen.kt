package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.SocialUiState

@Composable
fun MeetingScreen(
    state: SocialUiState,
    onBack: () -> Unit,
    onAction: (String, String) -> Unit,
    onNavigation: () -> Unit,
    onRetry: () -> Unit,
) {
    var review by remember { mutableStateOf<Pair<String, String>?>(null) }
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "${state.peerAlias ?: "내 친구"} · 만남",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text("바다쉼표 카페", style = MaterialTheme.typography.headlineSmall)
            Text("11월 14일 · 첫 만남 14:15~14:35 · 20분")
            Text("가상 공개 장소 · 준비된 시연 일정", style = MaterialTheme.typography.labelLarge)
            Card {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("내 도착 예정 14:02 · 상대 도착 예정 14:10")
                    Text("추가 주행 7분 / 도착 후 대기 약 13분 / 첫 만남 20분")
                    Text("양쪽의 기존 일정이 가능한 시연 계획이에요. 이후 산책 20분은 만남 후 별도 선택이에요.")
                }
            }
            Text(state.notice, style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                state.actions["MEETING_PROPOSE"]?.let { b ->
                    Button(
                        onClick = { review = "MEETING_PROPOSE" to b },
                        enabled = state.canInteract,
                    ) {
                        Text("이 장소·시간 제안하기")
                    }
                }
                if (state.meetingStatus == "confirmed" || state.cleanupRequired)
                    Button(onClick = onNavigation) {
                        Text(if (state.cleanupRequired) "내비 경유지 정리 확인" else "만남 카페를 경유지로 추가")
                    }
                state.actions["MEETING_CANCEL"]?.let { b ->
                    OutlinedButton(onClick = { review = "MEETING_CANCEL" to b }) { Text("만남 취소") }
                }
            }
            state.actions["CANCEL_PENDING_COMMAND"]?.let { b ->
                OutlinedButton(onClick = { review = "CANCEL_PENDING_COMMAND" to b }) {
                    Text("미확인 요청 취소")
                }
            }
            if (state.retryPending)
                OutlinedButton(onClick = onRetry, enabled = state.canRetry) {
                    Text("이전 요청 결과 확인·재전송")
                }
            state.actions["MEETING_DECLINE"]?.let { b ->
                OutlinedButton(
                    onClick = { review = "MEETING_DECLINE" to b },
                    enabled = state.canInteract,
                ) {
                    Text("이번에는 만나지 않기")
                }
            }
            OutlinedButton(onClick = onBack) { Text("내 친구 홈으로") }
        }
    }
    review?.let { (type, binding) ->
        AlertDialog(
            onDismissRequest = { review = null },
            title = {
                Text(
                    if (type == "MEETING_PROPOSE") "이 장소와 시간을 제안할까요?"
                    else if (type == "MEETING_CANCEL") "만남을 취소할까요?" else "이번에는 만나지 않을까요?"
                )
            },
            text = {
                Text(
                    if (type == "MEETING_PROPOSE")
                        "바다쉼표 카페 · 11월 14일 14:15~14:35\n상대도 같은 제안을 수락해야 만남이 확정돼요. 내비는 다음 단계에서 따로 승인해요."
                    else "만남을 진행하지 않아요. 이미 추가한 경유지는 별도 제거 승인이 필요해요."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        review = null
                        onAction(type, binding)
                    },
                    enabled =
                        type in listOf("MEETING_CANCEL", "CANCEL_PENDING_COMMAND") ||
                            state.canInteract,
                ) {
                    Text("확인")
                }
            },
            dismissButton = { TextButton(onClick = { review = null }) { Text("돌아가기") } },
        )
    }
}
