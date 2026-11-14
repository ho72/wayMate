package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.SocialUiState
import org.json.JSONObject

@Composable
fun MeetingScreen(
    state: SocialUiState,
    onBack: () -> Unit,
    onAction: (String, String) -> Unit,
    onNavigation: () -> Unit,
    onRetry: () -> Unit,
    journey: com.waymate.app.model.Journey? = null,
) {
    var review by remember { mutableStateOf<Pair<String, String>?>(null) }
    var details by remember { mutableStateOf(false) }
    VehicleBackground {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
            horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(22.dp)) {
            VehicleHeader("만남 동의")
            SpeechBubble(when(state.meetingStatus) {
                "confirmed" -> "서로 만나기로 했어요!"
                "cancelled" -> "각자의 여행도 소중하니까요"
                "proposed" -> "대답을 천천히 기다려요"
                else -> "가볍게 만나볼까요?"
            })
            AgentCharacter(if (state.peerAlias != null) "b-01" else journey?.avatarId ?: "a-01",
                Modifier.fillMaxWidth().height(320.dp), motionEnabled = state.canInteract)
            Text("바다쉼표 카페", style = MaterialTheme.typography.headlineLarge)
            Text("11월 14일 · 14:15–14:35 · 20분", color = com.waymate.app.ui.theme.Muted)
            VehicleInfoCard(Modifier.fillMaxWidth()) {
                Text(state.notice, style = MaterialTheme.typography.titleLarge)
                Text(if (state.meetingStatus == "confirmed") "만남 동의 완료 · 내비는 다음 화면에서 따로 승인해요."
                     else "상대도 같은 제안에 동의해야 만남이 확정돼요.")
                Text("가상 공개 장소 · 준비된 시연 일정", style = MaterialTheme.typography.bodySmall,
                    color = com.waymate.app.ui.theme.Muted)
            }
            state.actions["MEETING_PROPOSE"]?.let { b ->
                VehicleAction("이 장소·시간 제안하기", { review = "MEETING_PROPOSE" to b }, Modifier.fillMaxWidth(), state.canInteract)
            }
            if (state.meetingStatus == "confirmed" || state.cleanupRequired)
                VehicleAction(if (state.cleanupRequired) "내비 경유지 정리 확인" else "만남 카페를 경유지로 추가",
                    onNavigation, Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                state.actions["MEETING_CANCEL"]?.let { b ->
                    VehicleOutlineButton(onClick = { review = "MEETING_CANCEL" to b }) { Text("만남 취소") }
                }
                state.actions["MEETING_DECLINE"]?.let { b ->
                    VehicleOutlineButton(onClick = { review = "MEETING_DECLINE" to b }, enabled = state.canInteract) { Text("이번에는 만나지 않기") }
                }
            }
            state.actions["CANCEL_PENDING_COMMAND"]?.let { b ->
                VehicleOutlineButton(onClick = { review = "CANCEL_PENDING_COMMAND" to b }) { Text("미확인 요청 취소") }
            }
            if (state.retryPending) VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) { Text("이전 요청 결과 확인·재전송") }
            TextButton(onClick = { details = !details }) { Text(if (details) "이동 정보 접기" else "이동·내 일정 자세히 보기") }
            if (details) VehicleInfoCard(Modifier.fillMaxWidth()) {
                JourneySchedule(journey)
                Text("내 도착 예정 14:02 · 상대 도착 예정 14:10")
                Text("추가 주행 7분 · 도착 후 대기 약 13분")
                Text("이동 시간은 준비된 시연 계획이에요. 만남 후 산책 20분은 별도로 선택해요.")
            }
            TextButton(onClick = onBack) { Text("내 친구 홈으로") }
        }
    }
    review?.let { (type, binding) ->
        AlertDialog(
            onDismissRequest = { review = null },
            title = {
                Text(
                    when (type) {
                        "MEETING_PROPOSE" -> "이 장소와 시간을 제안할까요?"
                        "MEETING_CANCEL" -> "만남을 취소할까요?"
                        "CANCEL_PENDING_COMMAND" -> "미확인 요청을 취소할까요?"
                        else -> "이번에는 만나지 않을까요?"
                    }
                )
            },
            text = {
                Text(
                    when (type) {
                        "MEETING_PROPOSE" ->
                            "바다쉼표 카페 · 11월 14일 14:15~14:35\n상대도 같은 제안을 수락해야 만남이 확정돼요. 내비는 다음 단계에서 따로 승인해요."
                        "CANCEL_PENDING_COMMAND" ->
                            if (
                                JSONObject(binding)
                                    .getJSONObject("payload")
                                    .getString("originalType") == "NAV_APPROVE"
                            )
                                "내비 승인 요청만 취소해요. 만남 동의는 유지해요. 이미 실행된 경유지는 자동으로 제거되지 않으며, 만남 취소 후 별도 제거 승인이 필요해요."
                            else
                                "이 만남 제안 요청을 취소해요. 아직 도착하지 않은 요청은 실행되지 않도록 막고, 이미 접수된 같은 제안은 취소해요. 경유지 제거는 별도 승인이 필요해요."
                        else -> "만남을 진행하지 않아요. 이미 추가한 경유지는 별도 제거 승인이 필요해요."
                    }
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
