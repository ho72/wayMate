package com.waymate.app.ui.screens.handoff

import com.waymate.app.ui.components.VehicleConfirmationDialog
import com.waymate.app.ui.components.VehicleDialogButton
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.VehicleBackground
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ResetUiState
import org.json.JSONObject

@Composable
fun ResetScreen(
    state: ResetUiState,
    onApprove: (String, String) -> Unit,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onAction: (String, String) -> Unit = { _, _ -> },
) {
    var reviewed by remember { mutableStateOf<String?>(null) }
    VehicleBackground(pageTag = "초기화·복구") {
        val show: @Composable ((@Composable () -> Unit)?, (@Composable () -> Unit)?) -> Unit = { mockCard, mockControls ->
        CompanionScene(
            pinActions = true,
            avatarId = "a-01", bubble = "새 여행 전에 함께 확인해요", title = "처음부터 준비하기",
            motionEnabled = false,
            card = {
                if (mockCard != null) mockCard()
                else CompanionInfoCard {
                    Text(state.status, style = MaterialTheme.typography.titleLarge)
                    Text("현재 목적지 · ${state.destination}")
                    Text("두루밋이 추가한 경유지만 운전자의 별도 승인으로 정리해요. 원래 목적지는 유지해요.")
                    Text("미확정 작업이 남으면 결과와 차량 ACK를 기다려요. 같은 요청을 자동 실행하지 않아요.")
                }
            },
            actions = {
                mockControls?.invoke()
                CompanionActionGrid(buildList {
                    if (state.mockNavigation == null) {
                        add(CompanionActionItem("초기화 경유지 제거 승인", { reviewed = state.reviewed }, state.canRemove))
                        if (state.canCancel) add(CompanionActionItem("실행 전 제거 승인 취소", onCancel, secondary = true))
                    }
                    add(CompanionActionItem("정리 상태 다시 확인", onRetry, state.canRetry, true))
                })
            },
            footer = { Text("정리 결과와 차량 ACK를 확인한 뒤 새 여행 준비로 이동해요.") },
        )
        }
        if (state.mockNavigation != null) MockNavigationPanel(state.mockNavigation, onAction) { card, controls -> show(card, controls) }
        else show(null, null)
    }
    reviewed?.let { route ->
        val reviewedDestination =
            JSONObject(route).getJSONObject("second").getJSONObject("destination").getString("name")
        VehicleConfirmationDialog(
            onDismissRequest = { reviewed = null },
            title = { Text("초기화를 위해 경유지를 제거할까요?") },
            text = {
                Text(
                    "소프트웨어드림센터\n두루밋이 추가한 경유지만 제거하고 현재 목적지 ${reviewedDestination}는 유지해요. 만남을 취소 상태로 바꾸지 않고 초기화 정리로 처리해요."
                )
            },
            confirmButton = {
                VehicleDialogButton(
                    onClick = {
                        reviewed = null
                        onApprove("remove", route)
                    },
                    enabled = state.canRemove,
                ) {
                    Text("승인하고 제거")
                }
            },
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { reviewed = null }) { Text("돌아가기") } },
        )
    }
}
