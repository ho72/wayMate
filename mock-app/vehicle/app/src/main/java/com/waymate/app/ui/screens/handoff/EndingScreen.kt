package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.VehicleBackground
import com.waymate.app.ui.components.SpeechBubble
import com.waymate.app.ui.components.VehicleInfoCard
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import com.waymate.app.model.EndingUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.AgentCharacter

@Composable
fun EndingScreen(
    state: EndingUiState,
    journey: Journey?,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onAction: (String, String) -> Unit,
    onHome: () -> Unit,
    onNavigation: () -> Unit,
    onRetry: () -> Unit,
) {
    var selected by rememberSaveable(state.scope) { mutableStateOf("") }
    var friendAnswer by rememberSaveable(state.scope) { mutableStateOf("") }
    var schedule by rememberSaveable(state.scope) { mutableStateOf(false) }
    var lineIndex by rememberSaveable(state.scope, state.phase, state.lines) { mutableIntStateOf(0) }
    var showAllLines by rememberSaveable(state.scope, state.phase, state.lines) { mutableStateOf(false) }
    var review by remember(state.scope) { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(state.canInteract, state.myChoice, state.blocked) {
        if (!state.canInteract || state.myChoice != null || state.blocked) {
            review = null
            onStop()
        }
    }
    DisposableEffect(state.scope, state.phase, state.lines) { onDispose { onStop() } }
    if (state.blocked) {
        VehicleBackground {
            Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("정차 상태에서 여행 선택을 이어갈 수 있어요.", style = MaterialTheme.typography.headlineSmall)
                Text("현재 차량·화면 상태를 확인하고 있어요.")
                VehicleOutlineButton(onClick = onStop) { Text("낭독 중단") }
                VehicleOutlineButton(
                    onClick = {
                        onStop()
                        onHome()
                    }
                ) {
                    Text("내 친구 홈으로")
                }
            }
        }
        return
    }
    VehicleBackground {
        CharacterScene(
            resetKey = "${state.phase}:$schedule",
            character = { characterModifier, wide ->
                Column(characterModifier, horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("말이통행", style = MaterialTheme.typography.headlineMedium, color = com.waymate.app.ui.theme.Forest)
                    SpeechBubble(when(state.phase) {
                        "pending" -> "지금은 어떤 마음이에요?"
                        "together" -> "우리의 길이 이어졌어요"
                        "my_agent" -> "새로운 풍경이 기다려요"
                        "meeting" -> "안전하게 도착했어요"
                        else -> "여행의 다음 장면으로"
                    })
                    AgentCharacter(
                        if (state.phase in listOf("travel", "meeting", "pending")) "b-01" else journey?.avatarId ?: "a-01",
                        Modifier.fillMaxWidth().height(if (wide) 300.dp else 420.dp),
                        speechPhase = speech.phase,
                        motionEnabled = state.canInteract,
                    )
                    if (state.replay) Text("최종 선택 재시연 · ${state.round}회", style = MaterialTheme.typography.labelMedium)
                    if (speech.phase in listOf("speaking", "preparing", "interrupted")) {
                        Text(if (speech.phase == "interrupted") "낭독 중단 · 자동 재개 없음" else "말하는 중", style = MaterialTheme.typography.bodySmall)
                        VehicleOutlineButton(onClick = onStop) { Text("낭독 중단") }
                    }
                }
            },
            content = { contentModifier ->
                Column(contentModifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        when (state.phase) {
                            "travel" -> "승인한 장소로 이동 · 개념 시연"
                            "meeting" -> "14:15 · 바다쉼표 카페에서 인사해요"
                            "pending" -> "14:35 · 남은 여행을 어떻게 이어갈까?"
                            "together" -> "함께 여행 이어가기"
                            "my_agent" -> "각자의 여행 이어가기"
                            "cancelled" -> "여행 선택을 중단했어요"
                            else -> "내 친구와 여행을 이어가요"
                        },
                        style = MaterialTheme.typography.headlineLarge,
                        color = com.waymate.app.ui.theme.Ink,
                    )
                    state.notice?.let { Text(it) }
                    if (schedule) {
                        Schedule(journey)
                        VehicleOutlineButton(onClick = { schedule = false }) { Text("대화로 돌아가기") }
                    } else
                        when (state.phase) {
                            "travel" -> {
                                Text(
                                    if (state.mockNavigation) "만남 합의·운전자 승인과 모의 경유지 추가를 확인했어요."
                                    else "만남 합의·운전자 승인과 실제 경유지 추가를 확인했어요.",
                                    style = MaterialTheme.typography.titleLarge,
                                )
                                Text(
                                    if (state.mockNavigation)
                                        "가상 바다쉼표 카페 14:15~14:35 · 20분\n모의 경로로 진행하는 재연이에요. 실제 내비·도착 감지와 구분해요."
                                    else
                                        "가상 바다쉼표 카페 14:15~14:35 · 20분\n실제 SDK 시험 장소는 소프트웨어드림센터예요. 가상 강릉 경로·도착 감지와 구분해요."
                                )
                                Text("시연자가 O01에서 ‘만남 시작으로 이동’을 실행하면 재연을 시작해요.")
                            }
                            "meeting",
                            "together" -> {
                                Text(
                                    if (state.phase == "meeting")
                                        "준비된 첫 만남 재연 · 실제 접속·GPS 도착이 아니에요."
                                    else "두 분 모두 함께를 선택했어요. 14:35~14:55 해변 산책 뒤 각자의 다음 일정으로 이어가요."
                                )
                                if (state.lines.isNotEmpty()) {
                                    val currentIndex = lineIndex.coerceIn(0, state.lines.lastIndex)
                                    val currentLine = state.lines[currentIndex]
                                    Card(
                                        modifier = Modifier.fillMaxWidth().testTag("ending-current-line")
                                            .semantics(mergeDescendants = true) { this.selected = true },
                                        colors = CardDefaults.cardColors(
                                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                                        ),
                                        border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary),
                                    ) {
                                        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                            Text("현재 대사 ${currentIndex + 1}/${state.lines.size}", style = MaterialTheme.typography.labelLarge)
                                            Text("발화자: ${currentLine.speaker} · 재연", style = MaterialTheme.typography.titleMedium)
                                            Text(currentLine.text, style = MaterialTheme.typography.titleLarge)
                                        }
                                    }
                                    VehicleOutlineButton(
                                        onClick = { onSpeak(currentLine.text) },
                                        enabled = state.canInteract && speech.available,
                                    ) {
                                        Text("현재 대사 읽어주기")
                                    }
                                    VehicleOutlineButton(
                                        onClick = {
                                            onStop()
                                            lineIndex = (currentIndex + 1) % state.lines.size
                                        },
                                        enabled = state.canInteract,
                                    ) {
                                        Text("다음 대사 고르기")
                                    }
                                    VehicleOutlineButton(
                                        onClick = { showAllLines = !showAllLines },
                                        enabled = state.canInteract,
                                    ) { Text(if (showAllLines) "전체 대사 접기" else "전체 대사 보기") }
                                    if (showAllLines) state.lines.forEachIndexed { i, line ->
                                        Card(
                                            modifier = Modifier.fillMaxWidth().testTag("ending-script-line-$i")
                                                .semantics { this.selected = i == currentIndex },
                                            border = if (i == currentIndex) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                                        ) {
                                            Column(Modifier.padding(14.dp)) {
                                                Text("${if (i == currentIndex) "현재 선택 · " else ""}${line.speaker} · 재연", style = MaterialTheme.typography.labelLarge)
                                                Text(line.text, style = MaterialTheme.typography.titleLarge)
                                            }
                                        }
                                    }
                                }
                                Text(
                                    if (state.phase == "meeting")
                                        "시연자가 O01에서 ‘만남 종료’를 실행하면 양쪽 최종 선택이 함께 열려요."
                                    else "새 통화·위치 공유·경로 변경을 자동으로 만들지 않아요."
                                )
                            }
                            "pending" -> {
                                Text("14:35–14:55 · 함께할 활동은 해변 산책이에요.")
                                if (state.myChoice != null) {
                                    Text(
                                        "선택을 제출했어요. 두 사람의 선택이 모이면 결과를 알려드릴게요.",
                                        style = MaterialTheme.typography.titleLarge,
                                    )
                                    Text(
                                        "내가 제출한 선택: " +
                                            if (state.myChoice == "together") "함께 여행 이어가기"
                                            else "내 캐릭터와 여행 이어가기"
                                    )
                                } else {
                                    Text("두 사람 모두 선택해요. 상대 선택은 공개되지 않아요.", style = MaterialTheme.typography.bodyMedium)
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    ) {
                                        for (choice in
                                            listOf("together", "my_agent")) VehicleOutlineButton(
                                            onClick = { selected = choice },
                                            enabled = state.canInteract,
                                            modifier = Modifier.weight(1f).heightIn(min = 64.dp),
                                        ) {
                                            Text(
                                                (if (selected == choice) "✓ " else "") +
                                                    if (choice == "together") "함께 여행 이어가기"
                                                    else "내 캐릭터와 여행 이어가기"
                                            )
                                        }
                                    }
                                    state.actions["FINAL_CHOOSE_${selected.uppercase()}"]?.let { b
                                        ->
                                        VehicleButton(
                                            onClick = { review = "FINAL_CHOOSE" to b },
                                            enabled = state.canInteract,
                                        ) {
                                            Text("선택을 제출하기")
                                        }
                                    }
                                    Text("제출 후 변경할 수 없어요. 두 선택이 모이면 결과를 알려드려요.", style = MaterialTheme.typography.bodySmall)
                                }
                                state.actions["CONNECT_END"]?.let { b ->
                                    VehicleOutlineButton(onClick = { review = "CONNECT_END" to b }) {
                                        Text("선택 중단하고 내 여행으로")
                                    }
                                }
                            }
                            else -> {
                                if (state.phase == "my_agent")
                                    Text(
                                        "이번 만남은 여기서 마무리하고, 각자의 여행을 이어가요.",
                                        style = MaterialTheme.typography.titleLarge,
                                    )
                                else Text("연결을 마무리하고 내 여행을 이어가요. 제출하지 않은 선택을 대신 만들지 않아요.")
                                Text(
                                    state.prompt ?: "지금은 어떤 여행을 이어가고 싶어?",
                                    style = MaterialTheme.typography.titleLarge,
                                )
                                state.answers.forEach { a ->
                                    VehicleOutlineButton(
                                        onClick = {
                                            onStop()
                                            friendAnswer = a.id
                                        },
                                        enabled = state.canInteract,
                                    ) {
                                        Text(a.text)
                                    }
                                }
                                state.answers
                                    .find { it.id == friendAnswer }
                                    ?.let { a ->
                                        Text(a.reply, style = MaterialTheme.typography.titleLarge)
                                        Text(state.closing)
                                        VehicleOutlineButton(
                                            onClick = { onSpeak(a.reply + " " + state.closing) },
                                            enabled = state.canInteract && speech.available,
                                        ) {
                                            Text("내 친구 말 읽어주기")
                                        }
                                    }
                                Text("내 AI 친구와 다음 풍경을 만나요.", style = MaterialTheme.typography.bodyMedium)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    VehicleButton(onClick = { onStop(); friendAnswer = "rest" }, enabled = state.canInteract, modifier = Modifier.weight(1f)) { Text("내 캐릭터와 계속하기") }
                                    VehicleOutlineButton(onClick = { onStop(); onHome() }, modifier = Modifier.weight(1f)) { Text("오늘은 여기까지") }
                                }
                            }
                        }
                    if (state.cleanupRequired) {
                        Text("추가한 경유지는 유지돼요. 제거는 별도 승인으로 진행해요.", style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { onStop(); onNavigation() }) { Text("내비 상태 확인") }
                    }
                    if (!schedule)
                        TextButton(
                            onClick = {
                                onStop()
                                schedule = true
                            }
                        ) {
                            Text("내 일정 보기")
                        }
                    if (state.pending) {
                        Text("선택 저장 결과 확인 중 · 새 요청으로 중복 제출하지 않아요.")
                        VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) {
                            Text("선택 요청 결과 확인·재전송")
                        }
                    }
                    TextButton(onClick = { onStop(); onHome() }) { Text("내 친구 홈으로") }
                }
            },
        )
    }
    review?.let { (type, binding) ->
        AlertDialog(
            onDismissRequest = { review = null },
            title = { Text(if (type == "FINAL_CHOOSE") "이 선택을 제출할까요?" else "여행 선택을 중단할까요?") },
            text = {
                Text(
                    if (type == "FINAL_CHOOSE")
                        (if (selected == "together") "함께 여행 이어가기" else "내 캐릭터와 여행 이어가기") +
                            "\n상대 선택은 보지 않고 제출해요. 제출 후에는 이번 회차의 선택을 바꿀 수 없어요."
                    else "상대의 미제출을 각자 선택으로 간주하지 않아요. 내비 경유지는 자동 제거되지 않아요."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        review = null
                        onStop()
                        onAction(type, binding)
                    },
                    enabled = type == "CONNECT_END" || state.canInteract,
                ) {
                    Text(if (type == "FINAL_CHOOSE") "확인하고 선택 제출" else "선택 중단")
                }
            },
            dismissButton = { TextButton(onClick = { review = null }) { Text("돌아가기") } },
        )
    }
}

@Composable
private fun Schedule(journey: Journey?) {
    journey?.let { j ->
        HorizontalDivider()
        Text("내 여행 계획 · ${j.date}", style = MaterialTheme.typography.titleMedium)
        Text(
            "기존 다음 일정 ${j.nextVisit} · ${j.nextVisitLabel}\n복귀 장소 ${j.returnPlaceLabel} · 도착 예상 ${j.returnEstimate} · 마감 ${j.returnDeadline}"
        )
    }
}
