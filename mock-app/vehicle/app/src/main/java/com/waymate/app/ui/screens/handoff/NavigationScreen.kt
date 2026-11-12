package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.NavigationUiState
import org.json.JSONObject

@Composable
fun NavigationScreen(
    state: NavigationUiState,
    onBack: () -> Unit,
    onApprove: (String, String) -> Unit,
    onCancel: () -> Unit,
    social: com.waymate.app.model.SocialUiState,
    onSocialAction: (String, String) -> Unit,
    onRetry: () -> Unit,
) {
    var review by remember { mutableStateOf<Pair<String, String>?>(null) }
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("wayMate · 내비 경유지", style = MaterialTheme.typography.headlineMedium)
            Text("현재 목적지: ${state.destination}", style = MaterialTheme.typography.titleLarge)
            Text(
                if (social.meetingStatus != "none")
                    "만남 시연 장소: 바다쉼표 카페\n실제 내비 연동 장소: 소프트웨어드림센터\n경기도 성남시 수정구 창업로40번길 6"
                else "추가할 장소: 소프트웨어드림센터\n경기도 성남시 수정구 창업로40번길 6"
            )
            Text("연동 시연용 경유지예요. 승인하면 실제 순정 내비 경로에 반영돼요. 기존 목적지는 유지해요.")
            if (social.meetingStatus == "cancelled")
                Text(
                    if (social.cleanupRequired) "만남은 취소됐어요. 추가한 경유지는 별도 제거 승인이 필요해요."
                    else "만남은 취소됐어요. 내비 처리 상태를 확인해 주세요."
                )
            Card {
                Text(
                    state.status,
                    Modifier.padding(20.dp),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(
                    onClick = { state.reviewed?.let { review = "add" to it } },
                    enabled = state.canAdd,
                ) {
                    Text("경유지 추가 승인")
                }
                Button(
                    onClick = { state.reviewed?.let { review = "remove" to it } },
                    enabled = state.canRemove,
                ) {
                    Text("wayMate 경유지 제거 승인")
                }
            }
            if (state.canCancel) OutlinedButton(onClick = onCancel) { Text("실행 전 승인 취소") }
            social.actions["MEETING_CANCEL"]?.let { binding ->
                OutlinedButton(onClick = { review = "meeting_cancel" to binding }) { Text("만남 취소") }
            }
            social.actions["CANCEL_PENDING_COMMAND"]?.let { binding ->
                OutlinedButton(onClick = { onSocialAction("CANCEL_PENDING_COMMAND", binding) }) {
                    Text("미확인 요청 취소")
                }
            }
            if (social.retryPending)
                OutlinedButton(onClick = onRetry, enabled = social.canRetry) {
                    Text("이전 요청 결과 확인·재전송")
                }
            if (state.busy) Text("반영을 확인 중이에요. 같은 요청은 자동으로 반복하지 않아요.")
            OutlinedButton(onClick = onBack) { Text(if (social.visible) "만남으로 돌아가기" else "차량 홈으로") }
        }
    }
    review?.let { r ->
        val add = r.first == "add"
        val reviewedDestination =
            if (r.first == "meeting_cancel") state.destination
            else
                JSONObject(r.second)
                    .getJSONObject("second")
                    .getJSONObject("destination")
                    .getString("name")
        AlertDialog(
            onDismissRequest = { review = null },
            title = {
                Text(
                    if (r.first == "meeting_cancel") "만남을 취소할까요?"
                    else if (add) "이 경유지를 추가할까요?" else "wayMate 경유지를 제거할까요?"
                )
            },
            text = {
                Text(
                    "소프트웨어드림센터\n${if(r.first=="meeting_cancel")"만남을 취소해요. 내비 경유지는 별도 제거 승인으로 정리해요." else if(add)"현재 목적지로 가는 길에 추가해요." else "wayMate가 추가한 첫 번째 경유지만 제거해요."}\n목적지: ${reviewedDestination}\n${if(r.first=="meeting_cancel") "만남 취소와 내비 경유지 제거는 별도 동작이에요." else "정차 상태에서 승인 후 실제 내비에 요청해요."}"
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        review = null
                        if (r.first == "meeting_cancel") onSocialAction("MEETING_CANCEL", r.second)
                        else onApprove(r.first, r.second)
                    },
                    enabled = r.first == "meeting_cancel" || social.canInteract && !state.busy,
                ) {
                    Text(
                        if (r.first == "meeting_cancel") "만남 취소 확인"
                        else if (add) "승인하고 추가" else "승인하고 제거"
                    )
                }
            },
            dismissButton = { TextButton(onClick = { review = null }) { Text("취소") } },
        )
    }
}
