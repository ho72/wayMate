package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.NavigationUiState

@Composable
fun NavigationScreen(
    state: NavigationUiState,
    onBack: () -> Unit,
    onApprove: (String, String) -> Unit,
    onCancel: () -> Unit,
) {
    var review by remember { mutableStateOf<Pair<String, String>?>(null) }
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text("wayMate · 내비 경유지", style = MaterialTheme.typography.headlineMedium)
            Text("현재 목적지: ${state.destination}", style = MaterialTheme.typography.titleLarge)
            Text("추가할 장소: 소프트웨어드림센터\n경기도 성남시 수정구 창업로40번길 6")
            Text("연동 시연용 경유지예요. 승인하면 실제 순정 내비 경로에 반영돼요. 기존 목적지는 유지해요.")
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
            if (state.busy) Text("반영을 확인 중이에요. 같은 요청은 자동으로 반복하지 않아요.")
            OutlinedButton(onClick = onBack) { Text("차량 홈으로") }
        }
    }
    review?.let { r ->
        val add = r.first == "add"
        AlertDialog(
            onDismissRequest = { review = null },
            title = { Text(if (add) "이 경유지를 추가할까요?" else "wayMate 경유지를 제거할까요?") },
            text = {
                Text(
                    "소프트웨어드림센터\n${if(add)"현재 목적지로 가는 길에 추가해요." else "wayMate가 추가한 첫 번째 경유지만 제거해요."}\n목적지: ${state.destination}\n정차 상태에서 승인 후 실제 내비에 요청해요."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        review = null
                        onApprove(r.first, r.second)
                    },
                    enabled = if (add) state.canAdd else state.canRemove,
                ) {
                    Text(if (add) "승인하고 추가" else "승인하고 제거")
                }
            },
            dismissButton = { TextButton(onClick = { review = null }) { Text("취소") } },
        )
    }
}
