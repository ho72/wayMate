package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
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
    var lineIndex by rememberSaveable(state.scope) { mutableIntStateOf(0) }
    var review by remember(state.scope) { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(state.canInteract, state.myChoice, state.blocked) {
        if (!state.canInteract || state.myChoice != null || state.blocked) {
            review = null
            onStop()
        }
    }
    DisposableEffect(state.scope) { onDispose { onStop() } }
    if (state.blocked) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("정차 상태에서 여행 선택을 이어갈 수 있어요.", style = MaterialTheme.typography.headlineSmall)
                Text("현재 차량·화면 상태를 확인하고 있어요.")
                OutlinedButton(onClick = onStop) { Text("낭독 중단") }
                OutlinedButton(
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
    Surface(Modifier.fillMaxSize()) {
        CharacterScene(
            resetKey = "${state.phase}:$schedule",
            character = { characterModifier, wide ->
                Column(characterModifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("내 여행 친구", style = MaterialTheme.typography.headlineSmall)
                    AgentCharacter(
                        journey?.avatarId ?: "a-01",
                        Modifier.fillMaxWidth().height(if (wide) 300.dp else 220.dp),
                        speechPhase = speech.phase,
                        motionEnabled = state.canInteract,
                    )
                    Text(if (state.replay) "최종 선택 재시연 · ${state.round}회" else "같은 여행, 다음 선택")
                    Text(
                        when (speech.phase) {
                            "speaking" -> "말하는 중"
                            "preparing" -> "낭독 준비 중"
                            "unavailable" -> "음성 준비가 되지 않아 자막으로 안내해요"
                            "interrupted" -> "낭독 중단 · 자동 재개하지 않아요"
                            else -> "대기 중"
                        }
                    )
                    OutlinedButton(onClick = onStop) { Text("낭독 중단") }
                    OutlinedButton(
                        onClick = {
                            onStop()
                            onHome()
                        }
                    ) {
                        Text("내 친구 홈으로")
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
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    state.notice?.let { Text(it) }
                    if (state.cleanupRequired)
                        Card {
                            Column(Modifier.padding(16.dp)) {
                                Text("wayMate 내비 경유지가 남아 있어요. 결말·재시연으로 자동 제거하지 않아요.")
                                Text("원래 목적지와 경유지 상태는 내비에서 확인해 주세요. 전체 초기화 정리는 별도 승인이 필요해요.")
                                OutlinedButton(
                                    onClick = {
                                        onStop()
                                        onNavigation()
                                    }
                                ) {
                                    Text("내비 상태 확인")
                                }
                            }
                        }
                    if (schedule) {
                        Schedule(journey)
                        OutlinedButton(onClick = { schedule = false }) { Text("대화로 돌아가기") }
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
                                state.lines.forEachIndexed { i, line ->
                                    Card {
                                        Column(Modifier.padding(14.dp)) {
                                            Text(
                                                "${line.speaker} · 재연",
                                                style = MaterialTheme.typography.labelLarge,
                                            )
                                            Text(
                                                line.text,
                                                style = MaterialTheme.typography.titleLarge,
                                            )
                                        }
                                    }
                                }
                                if (state.lines.isNotEmpty()) {
                                    OutlinedButton(
                                        onClick = {
                                            onSpeak(
                                                state.lines[
                                                        lineIndex.coerceAtMost(
                                                            state.lines.lastIndex
                                                        )]
                                                    .text
                                            )
                                        },
                                        enabled = state.canInteract && speech.available,
                                    ) {
                                        Text("현재 대사 읽어주기")
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            onStop()
                                            lineIndex = (lineIndex + 1) % state.lines.size
                                        },
                                        enabled = state.canInteract,
                                    ) {
                                        Text("다음 대사 고르기")
                                    }
                                }
                                Text(
                                    if (state.phase == "meeting")
                                        "시연자가 O01에서 ‘만남 종료’를 실행하면 양쪽 최종 선택이 함께 열려요."
                                    else "새 통화·위치 공유·경로 변경을 자동으로 만들지 않아요."
                                )
                            }
                            "pending" -> {
                                Text("함께할 활동은 14:35~14:55 해변 산책이에요. 동승이나 전체 일정 변경은 아니에요.")
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
                                    Text("상대가 무엇을 골랐는지 보지 않고 각자 한 번 제출해 주세요.")
                                    Row(
                                        Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    ) {
                                        for (choice in
                                            listOf("together", "my_agent")) OutlinedButton(
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
                                        Button(
                                            onClick = { review = "FINAL_CHOOSE" to b },
                                            enabled = state.canInteract,
                                        ) {
                                            Text("선택을 제출하기")
                                        }
                                    }
                                    Text("제출 후에는 이번 선택을 바꿀 수 없어요. 두 선택이 모두 모이기 전에는 결과를 확정하지 않아요.")
                                }
                                state.actions["CONNECT_END"]?.let { b ->
                                    OutlinedButton(onClick = { review = "CONNECT_END" to b }) {
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
                                    OutlinedButton(
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
                                        OutlinedButton(
                                            onClick = { onSpeak(a.reply + " " + state.closing) },
                                            enabled = state.canInteract && speech.available,
                                        ) {
                                            Text("내 친구 말 읽어주기")
                                        }
                                    }
                                Text(
                                    "다음 활동 · 해변에서 쉬기 · 14:55 다음 일정 준비 · 15:20 기존 방문\n준비된 시연 계획이며 실제 내비를 자동 변경하지 않아요."
                                )
                                OutlinedButton(
                                    onClick = {
                                        onStop()
                                        friendAnswer = "rest"
                                    },
                                    enabled = state.canInteract,
                                ) {
                                    Text("내 캐릭터와 계속하기")
                                }
                                OutlinedButton(
                                    onClick = {
                                        onStop()
                                        onHome()
                                    }
                                ) {
                                    Text("오늘은 여기까지")
                                }
                            }
                        }
                    if (!schedule)
                        OutlinedButton(
                            onClick = {
                                onStop()
                                schedule = true
                            }
                        ) {
                            Text("내 일정 보기")
                        }
                    if (state.pending) {
                        Text("선택 저장 결과 확인 중 · 새 요청으로 중복 제출하지 않아요.")
                        OutlinedButton(onClick = onRetry, enabled = state.canRetry) {
                            Text("선택 요청 결과 확인·재전송")
                        }
                    }
                    if (!schedule) Schedule(journey)
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
