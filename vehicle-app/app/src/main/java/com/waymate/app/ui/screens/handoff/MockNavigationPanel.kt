package com.waymate.app.ui.screens.handoff

import com.waymate.app.ui.components.VehicleConfirmationDialog
import com.waymate.app.ui.components.VehicleDialogButton
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.unit.dp
import com.waymate.app.model.NavigationUiState
import org.json.JSONObject

@Composable
internal fun MockNavigationPanel(
    state: NavigationUiState, onAction: (String, String) -> Unit,
    content: @Composable (card: @Composable () -> Unit, controls: @Composable () -> Unit) -> Unit = { card, controls ->
        Column(verticalArrangement = Arrangement.spacedBy(22.dp)) { card(); controls() }
    },
) {
    var reviewed by remember { mutableStateOf<Pair<String, String>?>(null) }
    content({
        CompanionInfoCard {
            Text("모의 내비 시연", style = MaterialTheme.typography.titleLarge)
            Text("현재 목적지 · ${state.destination}")
            Text("바다쉼표 카페 · 가상 경로\n모의 경유지 · ${if (state.mockWaypointPresent) "있음" else "없음"}")
            Text(state.status, style = MaterialTheme.typography.titleLarge)
            Text("승인만으로 성공 처리하지 않아요. 같은 요청의 결과 확인이 필요해요. 미확인은 재시도를 잠그고 원래 목적지를 유지해요.")
        }
    }, {
        CompanionActionGrid(buildList {
            for ((key, label) in listOf(
                "NAV_APPROVE" to "모의 경유지 추가 승인",
                "NAV_RETRY_ADD" to "실패한 추가 다시 승인",
                "NAV_REMOVE_APPROVE" to "모의 경유지 제거 승인",
                "NAV_RETRY_REMOVE" to "실패한 제거 다시 승인",
                "NAV_CANCEL" to "실행 전 모의 승인 취소",
            )) state.mockActions[key]?.let { binding ->
                add(CompanionActionItem(label, { reviewed = key to binding }, secondary = key == "NAV_CANCEL"))
            }
        })
    })
    reviewed?.let { (_, binding) ->
        val b = JSONObject(binding)
        val cancel = b.getString("commandType") == "NAV_CANCEL"
        val add = b.getJSONObject("payload").optString("operation") == "add"
        VehicleConfirmationDialog(
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
                VehicleDialogButton(
                    onClick = {
                        reviewed = null
                        onAction(b.getString("commandType"), binding)
                    },
                    enabled = state.mockActions.values.contains(binding),
                ) {
                    Text("확인하고 진행")
                }
            },
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { reviewed = null }) { Text("돌아가기") } },
        )
    }
}
