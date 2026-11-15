package com.waymate.app.ui.testing

import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindowProvider
import com.waymate.app.ui.components.*
import kotlinx.coroutines.delay

/** A read-only shelf of existing production controls; does not override their styles or dimensions. */
@Composable
internal fun CurrentButtonsPreview() {
    VehicleBackground(pageTag = "버튼 미리보기", onBack = {}) {
        Row(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("홈 주요 버튼", style = MaterialTheme.typography.headlineSmall)
                VehicleAction("내 친구와 이야기하기", {}, Modifier.fillMaxWidth())
                VehicleAction("내 여행 경유지", {}, Modifier.fillMaxWidth(), secondary = true)
                Spacer(Modifier.height(12.dp))
                Text("일반 선택 · 보조 버튼", style = MaterialTheme.typography.headlineSmall)
                VehicleButton(onClick = {}) { Text("30분 쉴 곳 물어보기") }
                VehicleButton(onClick = {}) { Text("점심 장소 물어보기") }
                VehicleOutlineButton(onClick = {}) { Text("내 친구 홈으로") }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("활성 · 비활성 상태", style = MaterialTheme.typography.headlineSmall)
                VehicleButton(onClick = {}) { Text("경유지 추가 승인") }
                VehicleButton(onClick = {}, enabled = false) { Text("경유지 추가 승인") }
                VehicleOutlineButton(onClick = {}) { Text("음성 멈추기") }
                VehicleOutlineButton(onClick = {}, enabled = false) { Text("음성 멈추기") }
                Spacer(Modifier.height(12.dp))
                Text("텍스트 버튼", style = MaterialTheme.typography.headlineSmall)
                TextButton(onClick = {}) { Text("시연 조건 선택") }
                TextButton(onClick = {}) { Text("내 일정 자세히 보기") }
                Spacer(Modifier.height(12.dp))
                Text("현재 공통 규격", style = MaterialTheme.typography.headlineSmall)
                Text("홈 주요 버튼: 최대 폭 440dp · 최소 높이 128dp\n일반/보조 버튼: 최대 폭 440dp · 최소 높이 104dp\n이전 버튼: 196×96dp · 글자 34sp",
                    style = MaterialTheme.typography.bodyLarge)
                Text("버튼 구성요소를 그대로 표시한 비교용 화면입니다. 실제 기능은 실행하지 않습니다.",
                    style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** Same vehicle confirmation panel and action components used by current confirmation dialogs. */
@Composable
internal fun CurrentButtonDialogPreview() {
    val activity = LocalActivity.current as? ComponentActivity
    var open by remember { mutableStateOf(true) }
    CurrentButtonsPreview()
    if (open) VehicleConfirmationDialog(
        onDismissRequest = { open = false },
        title = { Text("이 경유지를 추가할까요?") },
        text = { VehicleRouteChangeSummary("소프트웨어드림센터", "기존 개인 방문지") },
        confirmButton = {
            val popupView = LocalView.current
            LaunchedEffect(popupView) {
                delay(1500)
                val popup = (popupView.parent as? DialogWindowProvider)?.window
                if (activity != null && popup != null) capturePreviewWindow(activity, popup, "button-dialog")
            }
            VehicleDialogButton(onClick = {}) { Text("경유지 추가") }
        },
        dismissButton = { VehicleDialogButton(secondary = true, onClick = { open = false }) { Text("취소") } },
    )
}
