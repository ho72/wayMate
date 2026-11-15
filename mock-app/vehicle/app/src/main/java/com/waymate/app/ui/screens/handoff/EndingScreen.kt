package com.waymate.app.ui.screens.handoff

import com.waymate.app.ui.components.VehicleConfirmationDialog
import com.waymate.app.ui.components.VehicleDialogButton
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.VehicleBackground
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import com.waymate.app.model.EndingUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.LocalAgentNarrator
import com.waymate.app.platform.dialogue.LocalScenarioDialogue

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
    onOpenItinerary: (() -> Unit)? = null,
    onOpenReview: (() -> Unit)? = null,
    peerAlias: String? = null,
) {
    val script = LocalScenarioDialogue.current
    val narrator = LocalAgentNarrator.current
    val lines = if (script.source == "openai" && state.phase in listOf("meeting", "together")) {
        val prefix = if (state.phase == "meeting") "meeting" else "together"
        state.lines.take(3).mapIndexed { i, line -> line.copy(text = script.line("$prefix.line$i", line.text)) }
    } else state.lines
    val answers = state.answers.map { it.copy(reply = script.line("ending.${it.id}", it.reply)) }
    val closing = script.line("ending.closing", state.closing)
    val prompt = state.prompt?.let { script.line("ending.prompt", it) }
    var selected by rememberSaveable(state.scope) { mutableStateOf("") }
    var friendAnswer by rememberSaveable(state.scope) { mutableStateOf("") }
    var schedule by rememberSaveable(state.scope) { mutableStateOf(false) }
    var lineIndex by rememberSaveable(state.scope, state.phase, lines) { mutableIntStateOf(0) }
    var showAllLines by rememberSaveable(state.scope, state.phase, lines) { mutableStateOf(false) }
    var review by remember(state.scope) { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(state.canInteract, state.myChoice, state.blocked) {
        if (!state.canInteract || state.myChoice != null || state.blocked) {
            review = null
            onStop()
        }
    }
    DisposableEffect(state.scope, state.phase, lines) { onDispose { onStop() } }
    if (state.blocked) {
        VehicleBackground(pageTag = "여행 마무리", mode = com.waymate.app.platform.restrictions.InteractionMode.BLOCKED) {
            CompanionScene(avatarId = journey?.avatarId ?: "a-01", bubble = "잠시 기다려 주세요",
                title = "정차 후 여행 선택을 이어가요", motionEnabled = false, onBack = { onStop(); onHome() },
                card = { CompanionInfoCard { Text("현재 차량·화면 상태를 확인하고 있어요. 선택과 전송은 잠시 쉬어요.") } },
                actions = { if (speech.phase in listOf("speaking", "preparing")) CompanionActionGrid(listOf(CompanionActionItem("낭독 중단", onStop, secondary = true))) },
            )
        }
        return
    }
    val endingActions = buildList<CompanionActionItem> {
        if (schedule) add(CompanionActionItem("대화로 돌아가기", { schedule = false }))
        else when (state.phase) {
            "meeting", "together" -> {
                if (lines.isNotEmpty()) {
                    val i = lineIndex.coerceIn(0, lines.lastIndex)
                    add(CompanionActionItem("현재 대사 읽어주기", { val line = lines[i]; narrator?.invoke(AgentNarration(line.text, if (peerAlias != null && line.speaker == peerAlias) "b-01" else journey?.avatarId ?: "a-01")) ?: onSpeak(line.text) }, state.canInteract && speech.available))
                    add(CompanionActionItem("다음 대사 고르기", { onStop(); lineIndex = (i + 1) % lines.size }, state.canInteract, true))
                    add(CompanionActionItem(if (showAllLines) "전체 대사 접기" else "전체 대사 보기", { showAllLines = !showAllLines }, state.canInteract, true))
                }
                if (state.phase == "together" && state.canInteract) onOpenReview?.let { open -> add(CompanionActionItem("여행 후 기록·장식", { onStop(); open() }, secondary = true)) }
            }
            "pending" -> {
                if (state.myChoice == null) {
                    val binding = state.actions["FINAL_CHOOSE_${selected.uppercase()}"]
                    add(CompanionActionItem("선택 제출하기", { binding?.let { review = "FINAL_CHOOSE" to it } }, state.canInteract && binding != null))
                }
                state.actions["CONNECT_END"]?.let { b -> add(CompanionActionItem("선택 중단하고 내 여행으로", { review = "CONNECT_END" to b }, secondary = true, quiet = true)) }
            }
            "travel" -> Unit
            else -> {
                add(CompanionActionItem("내 캐릭터와 계속하기", { onStop(); friendAnswer = "rest" }, state.canInteract))
                add(CompanionActionItem("오늘은 여기까지", { onStop(); onHome() }, secondary = true))
                answers.find { it.id == friendAnswer }?.let { a -> add(CompanionActionItem("내 친구 말 읽어주기", { onSpeak(a.reply + " " + closing) }, state.canInteract && speech.available, true)) }
            }
        }
        if (speech.phase in listOf("speaking", "preparing")) add(CompanionActionItem("낭독 중단", onStop, secondary = true))
        if (state.cleanupRequired) add(CompanionActionItem("내비 상태 확인", { onStop(); onNavigation() }, secondary = true, quiet = true))
        if (state.pending) add(CompanionActionItem("선택 요청 결과 확인·재전송", onRetry, state.canRetry, true))
        if (!schedule) add(CompanionActionItem("내 일정과 안내 확인", { onStop(); if (onOpenItinerary != null) onOpenItinerary() else schedule = true }, secondary = true, quiet = true))
    }
    val title = when (state.phase) {
        "travel" -> "승인한 장소로 이동해요"
        "meeting" -> "바다쉼표 카페에서 인사해요"
        "pending" -> "남은 여행을 어떻게 이어갈까?"
        "together" -> "함께 여행 이어가기"
        "my_agent" -> "각자의 여행 이어가기"
        "cancelled" -> "여행 선택을 중단했어요"
        else -> "내 친구와 여행을 이어가요"
    }
    VehicleBackground(pageTag = when (state.phase) {
        "travel" -> "만남 장소로"; "meeting" -> "첫 만남"; "pending" -> "여행 선택"
        "together" -> "함께하는 여행"; "my_agent" -> "나만의 여행"; else -> "여행 마무리"
    }) {
        CompanionScene(
            pinActions = true,
            avatarId = if (state.phase in listOf("travel", "meeting", "pending")) "b-01" else journey?.avatarId ?: "a-01",
            bubble = when (state.phase) {
                "pending" -> "지금은 어떤 마음이에요?"
                "together" -> "우리의 길이 이어졌어요"
                "my_agent" -> "새로운 풍경이 기다려요"
                "meeting" -> "반갑게 인사해 볼까요?"
                else -> "여행의 다음 장면으로"
            },
            title = title, speechPhase = speech.phase, motionEnabled = state.canInteract,
            onBack = { onStop(); if (schedule) schedule = false else onHome() },
            card = {
                CompanionInfoCard {
                    state.notice?.let { Text(it) }
                    if (state.replay) Text("최종 선택 재시연 · ${state.round}회")
                    if (schedule) Schedule(journey)
                    else when (state.phase) {
                        "travel" -> {
                            Text(if (state.mockNavigation) "만남 합의·운전자 승인과 모의 경유지 추가를 확인했어요."
                                else "만남 합의·운전자 승인과 실제 경유지 추가를 확인했어요.", style = MaterialTheme.typography.titleLarge)
                            Text("가상 바다쉼표 카페 · 14:15–14:35 · 20분")
                            Text(if (state.mockNavigation) "모의 경로로 진행하는 재연이에요. 실제 내비·도착 감지와 구분해요."
                                else "실제 SDK 시험 장소는 소프트웨어드림센터예요. 가상 강릉 경로·도착 감지와 구분해요.")
                            Text("시연 진행자가 만남 시작으로 전환하면 재연을 시작해요.")
                        }
                        "meeting", "together" -> {
                            Text(if (state.phase == "meeting") "준비된 첫 만남 재연 · 실제 접속·GPS 도착이 아니에요."
                                else "두 분 모두 함께를 선택했어요. 14:35–14:55 해변 산책 뒤 각자의 다음 일정으로 이어가요.")
                            if (lines.isNotEmpty()) {
                                val i = lineIndex.coerceIn(0, lines.lastIndex)
                                val line = lines[i]
                                Column(Modifier.fillMaxWidth().testTag("ending-current-line")
                                    .semantics(mergeDescendants = true) { this.selected = true },
                                    verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text("현재 대사 ${i + 1}/${lines.size} · ${line.speaker} · 재연")
                                    Text(line.text, style = MaterialTheme.typography.titleLarge)
                                }
                                if (showAllLines) lines.forEachIndexed { n, item ->
                                    Column(Modifier.fillMaxWidth().testTag("ending-script-line-$n").semantics { this.selected = n == i }) {
                                        HorizontalDivider()
                                        Text("${if (n == i) "현재 선택 · " else ""}${item.speaker} · 재연")
                                        Text(item.text, style = MaterialTheme.typography.titleLarge)
                                    }
                                }
                            }
                            Text(if (state.phase == "meeting") "만남 종료 후 두 사람의 최종 선택이 함께 열려요."
                                else "새 통화·위치 공유·경로 변경을 자동으로 만들지 않아요.")
                        }
                        "pending" -> {
                            Text("14:35–14:55 · 함께할 활동은 해변 산책이에요.")
                            if (state.myChoice != null) {
                                Text("선택을 제출했어요. 두 사람의 선택이 모이면 결과를 알려드릴게요.", style = MaterialTheme.typography.titleLarge)
                                Text("내가 제출한 선택 · " + if (state.myChoice == "together") "함께 여행 이어가기" else "내 캐릭터와 여행 이어가기")
                            } else {
                                Text("두 사람 모두 선택해요. 상대 선택은 공개되지 않아요.")
                                CompanionChoice("함께 여행 이어가기", selected == "together", state.canInteract) { selected = "together" }
                                CompanionChoice("내 캐릭터와 여행 이어가기", selected == "my_agent", state.canInteract) { selected = "my_agent" }
                                Text("제출 후 변경할 수 없어요. 두 선택이 모이면 결과를 알려드려요.")
                            }
                        }
                        else -> {
                            Text(if (state.phase == "my_agent") "이번 만남은 여기서 마무리하고, 각자의 여행을 이어가요."
                                else "연결을 마무리하고 내 여행을 이어가요. 제출하지 않은 선택을 대신 만들지 않아요.")
                            Text(prompt ?: "지금은 어떤 여행을 이어가고 싶어?", style = MaterialTheme.typography.titleLarge)
                            answers.forEach { a -> CompanionChoice(a.text, friendAnswer == a.id, state.canInteract) { onStop(); friendAnswer = a.id } }
                            answers.find { it.id == friendAnswer }?.let { a -> Text(a.reply, style = MaterialTheme.typography.titleLarge); Text(closing) }
                        }
                    }
                    if (state.cleanupRequired) Text("추가한 경유지는 유지돼요. 제거는 별도 승인으로 진행해요.")
                    if (state.pending) Text("선택 저장 결과 확인 중 · 새 요청으로 중복 제출하지 않아요.")
                }
            },
            actions = {
                CompanionActionGrid(endingActions.filterNot { it.quiet })
            },
            supporting = { CompanionActionGrid(endingActions.filter { it.quiet }) },
        )
    }
    review?.let { (type, binding) ->
        VehicleConfirmationDialog(
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
                VehicleDialogButton(
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
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { review = null }) { Text("돌아가기") } },
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
