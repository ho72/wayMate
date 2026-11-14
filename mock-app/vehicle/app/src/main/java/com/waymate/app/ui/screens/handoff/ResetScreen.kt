package com.waymate.app.ui.screens.handoff

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
    VehicleBackground {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("말이통행 · 처음부터 준비하기", style = MaterialTheme.typography.headlineMedium)
            Text("새 회차를 열기 전에 현재 여행과 내비 정리를 확인해요.")
            Text(state.status, style = MaterialTheme.typography.titleLarge)
            if (state.mockNavigation != null) {
                MockNavigationPanel(state.mockNavigation, onAction)
                VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) { Text("정리 상태 다시 확인") }
                Text("모의 정리 결과와 실제 차량 ACK를 확인한 뒤에만 새 회차를 열어요.")
                return@Column
            }
            Text("현재 목적지: ${state.destination}")
            Text(
                "이미 추가한 wayMate 경유지는 운전자의 별도 제거 승인이 필요해요. 원래 목적지는 유지해요. 미확정 작업이 남으면 ACK와 새 회차를 기다려요."
            )
            VehicleButton(onClick = { reviewed = state.reviewed }, enabled = state.canRemove) {
                Text("초기화를 위한 경유지 제거 승인")
            }
            if (state.canCancel) VehicleOutlineButton(onClick = onCancel) { Text("실행 전 제거 승인 취소") }
            VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) { Text("정리 상태 다시 확인") }
            Text("정리가 끝나면 차량이 ACK를 보내고 새 여행 준비 화면으로 이동해요. 내비 기록을 지우거나 같은 요청을 자동 실행하지 않아요.")
        }
    }
    reviewed?.let { route ->
        val reviewedDestination =
            JSONObject(route).getJSONObject("second").getJSONObject("destination").getString("name")
        AlertDialog(
            onDismissRequest = { reviewed = null },
            title = { Text("초기화를 위해 경유지를 제거할까요?") },
            text = {
                Text(
                    "소프트웨어드림센터\nwayMate가 추가한 경유지만 제거하고 현재 목적지 ${reviewedDestination}는 유지해요. 만남을 취소 상태로 바꾸지 않고 초기화 정리로 처리해요."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        reviewed = null
                        onApprove("remove", route)
                    },
                    enabled = state.canRemove,
                ) {
                    Text("승인하고 제거")
                }
            },
            dismissButton = { TextButton(onClick = { reviewed = null }) { Text("돌아가기") } },
        )
    }
}
