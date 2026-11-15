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
import com.waymate.app.ui.screens.handoff.*

@Composable
fun PersonalTripScreen(
    state: PersonalVehicleState, onEnroll: () -> Unit, onConfirm: (Boolean) -> Unit,
    onAccept: () -> Unit, onUnpair: () -> Unit, onRefresh: () -> Unit, onBack: () -> Unit,
    mode: com.waymate.app.platform.restrictions.InteractionMode =
        if (state.localParked) com.waymate.app.platform.restrictions.InteractionMode.PARKED
        else com.waymate.app.platform.restrictions.InteractionMode.BLOCKED,
    speech: com.waymate.app.platform.speech.SpeechState = com.waymate.app.platform.speech.SpeechState(),
    onSpeak: () -> Unit = {},
) {
    var review by remember(state.pairingId, state.delivery?.id) { mutableStateOf<String?>(null) }
    var dayIndex by rememberSaveable(state.delivery?.id) { mutableIntStateOf(0) }
    LaunchedEffect(state.allowed, state.localParked) { if (!state.allowed || !state.localParked) review = null }
    val trip = state.delivery
    val title = when (state.phase) {
        "unlinked" -> "내 친구와 차에서도 이어가요"
        "revoked" -> "차량 연결이 해제됐어요"
        "pending" -> "모바일에서 연결해 주세요"
        "requested" -> "이 계정과 연결할까요?"
        "active" -> if (trip == null) "차에서 만나는 내 여행" else trip.title
        "blocked" -> "정차 후 내 여행을 확인해 주세요"
        else -> "차량 연결을 확인하고 있어요"
    }
    VehicleBackground(pageTag = if (state.phase in listOf("pending", "requested", "unlinked", "revoked")) "계정 연결" else "내 계정 여행", mode = mode) {
        Box(Modifier.fillMaxSize().testTag("personal-trip-root")) {
            CompanionScene(
                pinActions = true,
                avatarId = when (trip?.avatar ?: state.accountAvatar) {
                    "bear" -> "a-02"
                    "mocha" -> "a-03"
                    else -> "a-01"
                },
                bubble = if (state.phase == "active") "네 여행을 함께 준비해요" else "내 계정으로 여행을 이어가요",
                title = title, motionEnabled = state.allowed && state.localParked, speechPhase = speech.phase,
                onBack = onBack,
                card = {
                    CompanionInfoCard {
                        when (state.phase) {
                            "blocked" -> Text("지금은 연결 확인과 새 여행 수신을 쉬고 있어요.")
                            "unlinked", "revoked" -> Text("연결 코드를 모바일 마이 화면에 입력한 뒤, 이 차량에서 계정을 확인해 주세요.", style = MaterialTheme.typography.titleLarge)
                            "pending" -> {
                                Text(state.deviceName, style = MaterialTheme.typography.titleLarge)
                                Text(state.code?.let { it.take(4) + " " + it.drop(4) } ?: "코드를 확인하고 있어요",
                                    style = MaterialTheme.typography.headlineLarge, modifier = Modifier.testTag("personal-pair-code"))
                                Text("모바일의 마이 → 내 차와 연결에 입력해 주세요. 코드는 5분 동안 사용할 수 있어요.")
                            }
                            "requested" -> {
                                Text(state.accountName ?: "계정을 확인해 주세요", style = MaterialTheme.typography.titleLarge)
                                Text("내 모바일 계정이 맞는지 확인해 주세요. 여행은 연결 뒤 따로 선택해서 받아요.")
                            }
                            "active" -> {
                                Text("${trip?.displayName ?: state.accountName ?: "내 계정"} · 연결됨")
                                if (trip == null) Text("모바일 내 여행에서 이 차량으로 보낼 계획을 골라 주세요.")
                                else {
                                    Text(if (trip.acknowledgedAt == null) "새 여행 도착 · 받기 전 미리보기" else "내가 받은 여행")
                                    Text(trip.destination, style = MaterialTheme.typography.titleLarge)
                                    Text(trip.summary)
                                    trip.days.getOrNull(dayIndex.coerceIn(0, (trip.days.size - 1).coerceAtLeast(0)))?.let { day ->
                                        HorizontalDivider()
                                        Text("${day.number}일차${day.date?.let { " · $it" } ?: " · 날짜 미정"}", style = MaterialTheme.typography.titleLarge)
                                        day.stops.forEach { stop ->
                                            Text("${stop.time ?: "시간 미정"} · ${stop.title}", style = MaterialTheme.typography.titleLarge)
                                            Text(stop.description)
                                        }
                                    }
                                    trip.notes.forEach { Text("• $it") }
                                    Text("장소·영업 정보는 출발 전에 확인해 주세요. 내비 경로는 바뀌지 않아요.")
                                }
                            }
                            "loading" -> LinearProgressIndicator(Modifier.fillMaxWidth())
                            else -> Text("연결을 확인한 뒤 여행을 보여드릴게요.")
                        }
                        state.notice?.let { Text(it) }
                    }
                },
                actions = {
                    CompanionActionGrid(buildList {
                        when (state.phase) {
                            "unlinked", "revoked" -> add(CompanionActionItem("내 계정 연결 시작", onEnroll, state.localParked && !state.busy))
                            "pending" -> add(CompanionActionItem("연결 코드 다시 확인", onEnroll, state.localParked && !state.busy))
                            "requested" -> {
                                add(CompanionActionItem("이 계정과 연결", { review = "connect" }, state.allowed && !state.busy))
                                add(CompanionActionItem("다른 계정이에요", { onConfirm(false) }, state.allowed && !state.busy, true))
                            }
                            "active" -> {
                                if (trip != null && trip.acknowledgedAt == null) add(CompanionActionItem("이 여행 받기", { review = "receive" }, state.allowed && !state.busy))
                                if (trip?.acknowledgedAt != null) add(CompanionActionItem(
                                    if (speech.phase in listOf("preparing", "speaking")) "음성 멈추기" else "여행 요약 듣기",
                                    onSpeak, state.allowed && state.localParked && !state.busy))
                            }
                        }
                    })
                },
                supporting = {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        if (state.phase == "active" && trip != null && trip.days.size > 1) CompanionActionGrid(listOf(
                            CompanionActionItem("이전 날", { dayIndex = (dayIndex - 1).coerceAtLeast(0) }, dayIndex > 0, true),
                            CompanionActionItem("다음 날", { dayIndex = (dayIndex + 1).coerceAtMost(trip.days.lastIndex) }, dayIndex < trip.days.lastIndex, true),
                        ))
                        CompanionActionGrid(buildList {
                            if (state.phase == "active") add(CompanionActionItem("계정 연결 해제", { review = "unpair" }, state.allowed && !state.busy, true, quiet = true))
                            if (state.phase != "blocked") add(CompanionActionItem("연결 상태 새로 확인", onRefresh, state.localParked && !state.busy, true, quiet = true))
                        })
                    }
                },
            )
        }
    }
    review?.let { action ->
        VehicleConfirmationDialog(onDismissRequest = { review = null },
            title = { Text(when(action) { "connect" -> "이 계정과 연결할까요?"; "receive" -> "이 여행을 받을까요?"; else -> "계정 연결을 해제할까요?" }) },
            text = { Text(when(action) { "connect" -> "${state.accountName} 계정이 맞는지 확인해 주세요."; "receive" -> "${state.delivery?.title} 일정을 이 차량에 저장해요. 내비 경로는 바뀌지 않아요."; else -> "이 차량에서 내 계정과 여행 표시를 정리해요." }) },
            confirmButton = { VehicleDialogButton(onClick = {
                review = null
                when(action) { "connect" -> onConfirm(true); "receive" -> onAccept(); else -> onUnpair() }
            }, enabled = state.allowed && !state.busy) { Text("확인") } },
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { review = null }) { Text("돌아가기") } })
    }
}
