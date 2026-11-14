package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.unit.dp
import com.waymate.app.model.NavigationUiState
import org.json.JSONObject

@Composable
internal fun MockNavigationPanel(state: NavigationUiState, onAction: (String, String) -> Unit) {
    var reviewed by remember { mutableStateOf<Pair<String, String>?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("모의 내비 · 실제 SDK 호출 없음", style = MaterialTheme.typography.headlineSmall)
        Text("현재 목적지: ${state.destination}")
        Text("시연 장소: 바다쉼표 카페 · 가상 경로\n모의 경유지: ${if(state.mockWaypointPresent) "있음" else "없음"}")
        Text(state.status, style = MaterialTheme.typography.titleLarge)
        for ((key, label) in
            listOf(
                "NAV_APPROVE" to "모의 경유지 추가 승인",
                "NAV_RETRY_ADD" to "실패한 추가 다시 승인",
                "NAV_REMOVE_APPROVE" to "모의 경유지 제거 승인",
                "NAV_RETRY_REMOVE" to "실패한 제거 다시 승인",
                "NAV_CANCEL" to "실행 전 모의 승인 취소",
            )) {
            state.mockActions[key]?.let { binding ->
                VehicleOutlineButton(onClick = { reviewed = key to binding }) { Text(label) }
            }
        }
        Text("승인만으로 성공 처리하지 않아요. O01에서 같은 요청의 성공·실패·미확인을 지정해야 해요. 미확인은 재시도를 잠그고 원래 목적지를 유지해요.")
    }
    reviewed?.let { (_, binding) ->
        val b = JSONObject(binding)
        val cancel = b.getString("commandType") == "NAV_CANCEL"
        val add = b.getJSONObject("payload").optString("operation") == "add"
        AlertDialog(
            onDismissRequest = { reviewed = null },
            title = {
                Text(
                    if (cancel) "모의 승인을 취소할까요?" else if (add) "모의 경유지를 추가할까요?" else "모의 경유지를 제거할까요?"
                )
            },
            text = {
                Text("바다쉼표 카페 · 모의 경로\n원래 목적지 ${state.destination}는 유지해요. 실제 순정 내비에는 요청하지 않아요.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        reviewed = null
                        onAction(b.getString("commandType"), binding)
                    },
                    enabled = state.mockActions.values.contains(binding),
                ) {
                    Text("확인하고 진행")
                }
            },
            dismissButton = { TextButton(onClick = { reviewed = null }) { Text("돌아가기") } },
        )
    }
}
