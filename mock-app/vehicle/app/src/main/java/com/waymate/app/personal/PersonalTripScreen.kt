package com.waymate.app.personal

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.waymate.app.ui.components.*

@Composable
fun PersonalTripScreen(
    state: PersonalVehicleState, onEnroll: () -> Unit, onConfirm: (Boolean) -> Unit,
    onAccept: () -> Unit, onUnpair: () -> Unit, onRefresh: () -> Unit, onBack: () -> Unit,
) {
    var review by remember(state.pairingId, state.delivery?.id) { mutableStateOf<String?>(null) }
    var dayIndex by rememberSaveable(state.delivery?.id) { mutableIntStateOf(0) }
    LaunchedEffect(state.allowed, state.localParked) { if (!state.allowed || !state.localParked) review = null }
    VehicleBackground {
        Column(Modifier.fillMaxSize().testTag("personal-trip-root").verticalScroll(rememberScrollState())
            .padding(28.dp), verticalArrangement = Arrangement.spacedBy(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("말이통행 · 내 계정 여행", style = MaterialTheme.typography.headlineMedium)
            if (state.phase == "blocked") {
                AgentCharacter("a-01", Modifier.fillMaxWidth().height(280.dp), motionEnabled = false)
                Text("정차 후 내 여행을 확인해 주세요.", style = MaterialTheme.typography.headlineSmall)
                Text("지금은 연결 확인과 새 여행 수신을 쉬고 있어요.")
            } else {
                val trip = state.delivery
                AgentCharacter(if ((trip?.avatar ?: state.accountAvatar) == "bear") "a-02" else "a-01",
                    Modifier.fillMaxWidth().height(260.dp), motionEnabled = state.allowed)
                when (state.phase) {
                    "unlinked", "revoked" -> {
                        Text(if (state.phase == "revoked") "차량 연결이 해제됐어요" else "내 친구와 차에서도 이어가요", style = MaterialTheme.typography.headlineSmall)
                        Text("연결 코드를 모바일 마이 화면에 입력한 뒤, 이 차량에서 계정을 확인해 주세요.")
                        VehicleButton(onClick = onEnroll, enabled = state.localParked && !state.busy) { Text("내 계정 연결 시작") }
                    }
                    "pending" -> {
                        Text("모바일에서 연결해 주세요", style = MaterialTheme.typography.headlineSmall)
                        Text(state.deviceName, style = MaterialTheme.typography.titleLarge)
                        Text(state.code?.let { it.take(4) + " " + it.drop(4) } ?: "코드를 확인하고 있어요", style = MaterialTheme.typography.headlineLarge,
                            modifier = Modifier.testTag("personal-pair-code"))
                        Text("모바일의 마이 → 내 차와 연결에 코드를 입력해 주세요. 코드는 5분 동안 사용할 수 있어요.")
                        VehicleOutlineButton(onClick = onEnroll, enabled = state.localParked && !state.busy) { Text("연결 코드 다시 확인") }
                    }
                    "requested" -> {
                        Text("이 계정과 연결할까요?", style = MaterialTheme.typography.headlineSmall)
                        Text(state.accountName ?: "계정을 확인해 주세요", style = MaterialTheme.typography.headlineMedium)
                        Text("내 모바일 계정이 맞는지 확인해 주세요. 여행은 연결 뒤 따로 선택해서 받아요.")
                        VehicleButton(onClick = { review = "connect" }, enabled = state.allowed && !state.busy) { Text("이 계정과 연결") }
                        VehicleOutlineButton(onClick = { onConfirm(false) }, enabled = state.allowed && !state.busy) { Text("다른 계정이에요") }
                    }
                    "active" -> {
                        Text("${trip?.displayName ?: state.accountName ?: "내 계정"} · 연결됨", style = MaterialTheme.typography.titleLarge)
                        if (trip == null) Text("모바일 내 여행에서 이 차량으로 보낼 계획을 골라 주세요.")
                        else {
                            VehicleInfoCard(Modifier.fillMaxWidth()) {
                                Text(if (trip.acknowledgedAt == null) "새 여행이 도착했어요 · 받기 전 미리보기" else "내가 받은 여행", style = MaterialTheme.typography.labelLarge)
                                Text(trip.title, style = MaterialTheme.typography.headlineSmall)
                                Text(trip.destination, style = MaterialTheme.typography.titleLarge)
                                Text(trip.summary)
                            }
                            if (trip.acknowledgedAt == null) VehicleButton(onClick = { review = "receive" }, enabled = state.allowed && !state.busy) { Text("이 여행 받기") }
                            val index = dayIndex.coerceIn(0, trip.days.lastIndex)
                            val day = trip.days[index]
                            Text("${day.number}일차${day.date?.let { " · $it" } ?: " · 날짜 미정"}", style = MaterialTheme.typography.titleLarge)
                            day.stops.forEach { stop -> VehicleInfoCard(Modifier.fillMaxWidth()) {
                                Text(stop.time ?: "시간 미정", style = MaterialTheme.typography.labelLarge)
                                Text(stop.title, style = MaterialTheme.typography.titleLarge)
                                Text(stop.description)
                            } }
                            if (trip.days.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                OutlinedButton(onClick = { dayIndex = (index - 1).coerceAtLeast(0) }, enabled = index > 0) { Text("이전 날") }
                                OutlinedButton(onClick = { dayIndex = (index + 1).coerceAtMost(trip.days.lastIndex) }, enabled = index < trip.days.lastIndex) { Text("다음 날") }
                            }
                            trip.notes.forEach { note -> Text("• $note") }
                            Text("여행 아이디어예요. 장소와 영업 정보는 출발 전에 확인해 주세요. 내비 경로는 바뀌지 않아요.")
                        }
                        VehicleOutlineButton(onClick = { review = "unpair" }, enabled = state.allowed && !state.busy) { Text("계정 연결 해제") }
                    }
                    "loading" -> Text("차량 연결을 확인하고 있어요.")
                    else -> Text("연결을 확인한 뒤 여행을 보여드릴게요.")
                }
                state.notice?.let { Text(it) }
                VehicleOutlineButton(onClick = onRefresh, enabled = state.localParked && !state.busy) { Text("연결 상태 새로 확인") }
            }
            VehicleOutlineButton(onClick = onBack) { Text("여행 홈으로 돌아가기") }
        }
    }
    review?.let { action ->
        AlertDialog(onDismissRequest = { review = null },
            title = { Text(when(action) { "connect" -> "이 계정과 연결할까요?"; "receive" -> "이 여행을 받을까요?"; else -> "계정 연결을 해제할까요?" }) },
            text = { Text(when(action) { "connect" -> "${state.accountName} 계정이 맞는지 확인해 주세요."; "receive" -> "${state.delivery?.title} 일정을 이 차량에 저장해요. 내비 경로는 바뀌지 않아요."; else -> "이 차량에서 내 계정과 여행 표시를 정리해요." }) },
            confirmButton = { TextButton(onClick = {
                review = null
                when(action) { "connect" -> onConfirm(true); "receive" -> onAccept(); else -> onUnpair() }
            }, enabled = state.allowed && !state.busy) { Text("확인") } },
            dismissButton = { TextButton(onClick = { review = null }) { Text("돌아가기") } })
    }
}
