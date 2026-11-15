package com.waymate.app.ui.screens.handoff

import com.waymate.app.ui.components.VehicleConfirmationDialog
import com.waymate.app.ui.components.VehicleDialogButton
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.activity.compose.BackHandler
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.LocalAgentNarrator
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.VehicleBackground
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ContentUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.VehicleAction
import com.waymate.app.platform.dialogue.LocalScenarioDialogue

@Composable
fun ContentScreen(
    state: ContentUiState,
    journey: Journey?,
    speech: SpeechState,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onAction: (String, String) -> Unit,
    onRead: (String) -> Unit,
    onProfileCue: (String) -> Unit,
    onBack: () -> Unit,
    onMeeting: () -> Unit,
    onRetry: () -> Unit,
    onOpenPlaces: (() -> Unit)? = null,
    onOpenVoice: (() -> Unit)? = null,
    onOpenMc: (() -> Unit)? = null,
    onOpenItinerary: (() -> Unit)? = null,
    initialPage: String? = null,
    onDrivingContext: (com.waymate.app.model.DrivingContext) -> Unit = {},
) {
    val script = LocalScenarioDialogue.current
    val narrator = LocalAgentNarrator.current
    var page by
        rememberSaveable(state.scope) {
            mutableStateOf(initialPage ?: if (state.peerAlias != null) "intro" else "friend")
        }
    var selected by rememberSaveable(state.scope) { mutableStateOf("") }
    var question by rememberSaveable(state.scope) { mutableStateOf(if (initialPage == "answer") state.questions.firstOrNull()?.id.orEmpty() else "") }
    var threadId by rememberSaveable(state.scope) { mutableStateOf("") }
    var review by remember(state.scope) { mutableStateOf<Pair<String, String>?>(null) }
    fun navigate(next: String) {
        onStop()
        selected = ""
        review = null
        page = next
    }
    LaunchedEffect(state.peerAlias) {
        if (state.peerAlias == null) {
            onStop()
            question = ""
            review = null
            page = "friend"
        }
    }
    LaunchedEffect(state.canInteract) {
        if (!state.canInteract) {
            onStop()
            review = null
        }
    }
    DisposableEffect(state.scope) { onDispose { onStop() } }
    val callBusy = state.call?.status in listOf("requested", "active")
    LaunchedEffect(state.call?.id, state.call?.status) {
        if (state.call?.status in listOf("requested", "active")) {
            onStop()
            page = "call"
        }
    }
    val thread = state.threads.find { it.id == threadId } ?: state.threads.lastOrNull()
    LaunchedEffect(page, thread?.id, thread?.status) {
        if (page == "messages") {
            selected = ""
            review = null
            onStop()
        }
    }
    LaunchedEffect(page, thread?.id, thread?.response, state.canInteract) {
        if (page == "messages" && state.canInteract && thread?.response != null && thread.unread)
            onRead(thread.id)
    }
    LaunchedEffect(page, question, state.scope, state.canInteract) {
        if (
            page == "answer" &&
                state.canInteract &&
                state.questions.any { it.id == question && it.known }
        )
            onProfileCue(question)
    }
    fun goBack() {
        onStop()
        if (review != null) review = null
        else if (state.peerAlias != null && page !in listOf("intro", "list") && !callBusy) navigate("list")
        else onBack()
    }
    BackHandler { goBack() }
    val caption =
        when (page) {
            "intro" -> script.line("peer.intro", if (state.peerAlias == "루밋") "반가워요. 저는 루밋이에요. 어떤 여행을 좋아하는지 편하게 물어봐 주세요." else "반가워요. 저는 ${state.peerAlias}님의 여행 친구 루밋이에요. 어떤 여행을 좋아하는지 편하게 물어봐 주세요.")
            "answer" -> state.questions.find { it.id == question }?.let { q -> if (q.known) script.line("peer.${q.id}", q.answer) else q.answer }
            "messages" -> thread?.response
            "done" -> script.line("friend.done", state.replyDone)
            "friend" -> script.line("friend.opening", "더 알아가도 좋고, 잠깐 쉬어도 좋아. 다음은 네가 고르면 돼.")
            "rest" -> script.line("friend.rest", "대화는 잠깐 쉬어가요. 다시 이어갈 때 직접 골라 주세요.")
            else -> null
        }
    val drivingContext = com.waymate.app.model.DrivingContexts.content(page, state, journey, caption, thread)
    LaunchedEffect(drivingContext) { onDrivingContext(drivingContext) }
    if (state.blocked) {
        VehicleBackground(pageTag = "캐릭터 대화", mode = com.waymate.app.platform.restrictions.InteractionMode.BLOCKED) {
            CompanionScene(avatarId = journey?.avatarId ?: "a-01", bubble = "잠시 기다려 주세요",
                title = "정차 후 대화를 이어가요", motionEnabled = false, onBack = onBack,
                card = { CompanionInfoCard { Text("현재 차량·화면 상태를 확인하고 있어요. 새 선택과 전송은 잠시 쉬어요.") } },
                actions = { CompanionActionGrid(buildList {
                    if (speech.phase in listOf("speaking", "preparing")) add(CompanionActionItem("낭독 중단", onStop, secondary = true))
                    for (type in listOf("CALL_CANCEL", "CALL_END")) state.actions[type]?.let { binding ->
                        add(CompanionActionItem(if (type == "CALL_CANCEL") "통화 제안 취소" else "통화 종료", { onStop(); onAction(type, binding) }, secondary = true))
                    }
                }) },
            )
        }
        return
    }
    VehicleBackground(pageTag = when (page) {
        "intro" -> "친구 소개"; "list" -> "대화 고르기"; "profile", "answer" -> "상대 알아가기"
        "draft" -> "말 전하기"; "messages" -> "답장 확인"; "call" -> "통화"
        "rest" -> "잠깐 쉬기"; else -> "내 친구와 대화"
    }) {
        if (page == "friend") CompanionScene(
            avatarId = journey?.avatarId ?: "a-01",
            bubble = "함께 여행 이야기를 나눠요",
            title = "서로의 이야기를 알아가요",
            speechPhase = speech.phase,
            motionEnabled = state.canInteract,
            onBack = onBack,
            card = {
                CompanionInfoCard {
                    if (!state.canInteract) Text("정차·연결·화면 활성 상태를 확인해 주세요. 새 선택과 전송은 잠겼어요.")
                    state.notice?.let { Text(it) }
                    if (state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY", "CALL_PROPOSE"))
                        Text("전송 결과 확인 중 · 다른 메시지로 중복 전송하지 않아요.")
                    Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                    if (script.loading) Text("여행에 맞는 이야기를 준비하고 있어요.", style = MaterialTheme.typography.bodySmall)
                    Text("네가 정한 다음 일정과 복귀 계획은 그대로 확인할 수 있어.")
                    if (speech.phase in listOf("speaking", "preparing", "interrupted"))
                        Text(if (speech.phase == "interrupted") "음성 중단 · 자동 재개 없음" else "짧은 음성 안내 중",
                            style = MaterialTheme.typography.bodySmall)
                }
            },
            actions = {
                if (!callBusy && state.canInteract) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (state.peerAlias == null) onOpenPlaces?.let { open ->
                        VehicleAction("장소 물어보기", { onStop(); open() }, Modifier.weight(1f))
                    }
                    if (state.peerAlias != null) onOpenVoice?.let { open ->
                        VehicleAction("음성 대화 화면 미리보기", { onStop(); open() }, Modifier.weight(1f))
                    }
                    onOpenItinerary?.let { open ->
                        VehicleAction("내 일정과 안내 확인", { onStop(); open() }, Modifier.weight(1f), secondary = true)
                    }
                }
            },
            footer = {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (state.peerAlias != null && !callBusy)
                        VehicleOutlineButton(onClick = { navigate("list") }) { Text("콘텐츠 목록으로") }
                    if (state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY", "CALL_PROPOSE")) {
                        VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) {
                            Text("이전 요청 결과 확인·재전송")
                        }
                        state.actions["CANCEL_PENDING_COMMAND"]?.let { binding ->
                            VehicleOutlineButton(onClick = { review = "CANCEL_PENDING_COMMAND" to binding }) {
                                Text("미확인 전송 요청 중단")
                            }
                        }
                    }
                    if (speech.phase in listOf("speaking", "preparing"))
                        VehicleOutlineButton(onClick = onStop) { Text("낭독 중단") }
                }
            },
        ) else if (page == "call") CallPanel(state, speech, onSpeak, onStop, onAction,
            onBack = { if (callBusy) onBack() else navigate("list") },
            myAvatar = journey?.avatarId ?: "a-01", onOpenMc = onOpenMc)
        else if (page == "messages") ReplyConversationPanel(
            state, thread, speech, selected,
            onSelect = { onStop(); selected = it },
            onThread = { onStop(); threadId = it; selected = "" },
            onReview = { onStop(); state.actions["MESSAGE_REPLY_$selected"]?.let { review = "MESSAGE_REPLY" to it } },
            onCompose = { navigate("draft") }, onSpeak = { text -> narrator?.invoke(AgentNarration(text, "b-01")) ?: onSpeak(text) }, onStop = onStop,
            onBack = { onStop(); navigate("list") },
            recovery = {
                if (state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY")) CompanionActionGrid(buildList {
                    add(CompanionActionItem("이전 요청 결과 확인·재전송", onRetry, state.canRetry, secondary = true, quiet = true))
                    state.actions["CANCEL_PENDING_COMMAND"]?.let { binding ->
                        add(CompanionActionItem("미확인 전송 요청 중단", { review = "CANCEL_PENDING_COMMAND" to binding }, secondary = true, quiet = true))
                    }
                })
            },
        )
        else CompanionScene(
            pinActions = page in listOf("list", "profile", "draft"),
            avatarId = if (page in listOf("rest", "done")) journey?.avatarId ?: "a-01" else "b-01",
            bubble = when (page) {
                "intro" -> "새로운 여행 친구를 만났어요"
                "profile", "list" -> "어떤 이야기를 시작할까요?"
                "draft" -> "전하고 싶은 말을 골라볼까요?"
                "call" -> "목소리로도 이야기해요"
                "rest" -> "잠깐 쉬어가도 괜찮아요"
                else -> "네 이야기를 듣고 있어요"
            },
            title = when (page) {
                "intro" -> if (state.peerAlias == "루밋") "루밋" else "${state.peerAlias}님의 루밋"
                "list" -> "어떤 이야기를 나눠볼까요?"
                "profile" -> "친구에게 궁금한 이야기"
                "answer" -> "친구의 이야기를 들어요"
                "draft" -> "전하고 싶은 말을 골라요"
                "call" -> "둘이 직접 통화하기"
                "rest" -> "대화는 잠깐 쉬어가요"
                else -> "내 친구와 여행을 이어가요"
            },
            speechPhase = if (page == "call") "resting" else speech.phase,
            motionEnabled = state.canInteract,
            onBack = { goBack() },
            card = {
                CompanionInfoCard {
                    if (!state.canInteract) Text("정차·연결·화면 활성 상태를 확인해 주세요. 새 선택과 전송은 잠겼어요.")
                    state.notice?.let { Text(it) }
                    when (page) {
                        "intro" -> {
                            Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                            Text("공개 프로필 기반 · 실제 상대의 현재 답변이 아니에요.")
                        }
                        "list" -> Text("궁금한 이야기를 물어보거나, 에이전트를 통해 말을 전해볼까요? 통화와 만남은 서로 동의할 때만 이어가요.", style = MaterialTheme.typography.titleLarge)
                        "profile" -> {
                            Text("${state.peerAlias}의 에이전트 · 공개 프로필 기반")
                            state.questions.forEach { q -> CompanionChoice(q.text, selected == q.id, state.canInteract) { selected = q.id } }
                        }
                        "answer" -> {
                            Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                            Text(if (script.isGenerated("peer.$question")) "공개 프로필을 바탕으로 한 AI 소개 · 상대에게 전송되지 않아요."
                                else "공개 프로필에 근거한 준비된 답변 · 상대에게 전송되지 않아요.")
                        }
                        "draft" -> {
                            Text("${state.peerAlias ?: "친구"}에게 전할 말을 먼저 확인해 주세요. 사적인 캐릭터 대화는 전송하지 않아요.")
                            state.messages.forEach { m -> CompanionChoice(m.text, selected == m.id, state.canInteract) { selected = m.id } }
                            state.messages.find { it.id == selected }?.let { Text("보낼 문장: ${it.text}", style = MaterialTheme.typography.titleLarge) }
                            Text("전송 성공은 시연 서버의 저장 확인이에요. 실제 상대 열람·통신과 구분해요.")
                        }
                        "rest", "done" -> Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                    }
                    if (state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY", "CALL_PROPOSE"))
                        Text("전송 결과 확인 중 · 다른 메시지로 중복 전송하지 않아요.")
                }
            },
            actions = {
                CompanionActionGrid(buildList {
                    when (page) {
                        "intro" -> {
                            add(CompanionActionItem("이야기 시작", { navigate("list") }, state.canInteract))
                            add(CompanionActionItem("잠깐 쉬기", { navigate("rest") }, secondary = true))
                        }
                        "list" -> {
                            add(CompanionActionItem("상대 캐릭터와 알아가기", { navigate("profile") }, state.canInteract))
                            add(CompanionActionItem(if (state.threads.any { it.unread }) "새 답장 확인" else "에이전트로 말 전하기", { navigate(if (thread != null) "messages" else "draft") }, state.canInteract, true))
                            if (state.actions.containsKey("CALL_PROPOSE") || callBusy) add(CompanionActionItem("둘이 직접 통화하기", { navigate("call") }, state.canInteract, true))
                            add(CompanionActionItem("내 에이전트와 이야기", { navigate("friend") }, secondary = true))
                            add(CompanionActionItem("만남 제안 받기", { onStop(); onMeeting() }, state.canInteract, true))
                            add(CompanionActionItem("지금은 쉬기", { navigate("rest") }, secondary = true))
                        }
                        "profile" -> add(CompanionActionItem("물어보기", { question = selected; navigate("answer") }, state.canInteract && selected.isNotEmpty()))
                        "answer" -> {
                            if (state.questions.find { it.id == question }?.known == false) add(CompanionActionItem("직접 물어볼 말 확인", { navigate("draft") }, state.canInteract))
                            add(CompanionActionItem("다른 질문", { navigate("profile") }, secondary = true))
                        }
                        "draft" -> {
                            val binding = state.actions["MESSAGE_SEND_$selected"]
                            add(CompanionActionItem("이 말 보내기", { binding?.let { review = "MESSAGE_SEND" to it } }, state.canInteract && binding != null))
                        }
                        "rest" -> add(CompanionActionItem("다시 이어가기", { navigate(if (state.peerAlias != null) "list" else "friend") }, state.canInteract))
                    }
                    if (caption != null && page in listOf("answer", "done") && speech.available)
                        add(CompanionActionItem("현재 문장 읽어주기", { narrator?.invoke(AgentNarration(caption, if (page == "answer") "b-01" else journey?.avatarId ?: "a-01")) ?: onSpeak(caption) }, state.canInteract, true))
                })
            },
            footer = {
                CompanionActionGrid(buildList {
                    if (state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY", "CALL_PROPOSE")) {
                        add(CompanionActionItem("이전 요청 결과 확인·재전송", onRetry, state.canRetry, true))
                        state.actions["CANCEL_PENDING_COMMAND"]?.let { b -> add(CompanionActionItem("미확인 전송 요청 중단", { review = "CANCEL_PENDING_COMMAND" to b }, secondary = true)) }
                    }
                    if (speech.phase in listOf("speaking", "preparing")) add(CompanionActionItem("낭독 중단", onStop, secondary = true))
                })
            },
        )
    }

    review?.let { (type, binding) ->
        VehicleConfirmationDialog(
            onDismissRequest = { review = null },
            title = {
                Text(if (type == "CANCEL_PENDING_COMMAND") "이 전송 요청을 중단할까요?" else "${state.peerAlias ?: "친구"} 님에게 이 말을 보낼까요?")
            },
            text = {
                Text(
                    if (type == "CANCEL_PENDING_COMMAND")
                        "아직 도착하지 않은 요청은 막아요. 시연 서버에 이미 전달됐다면 메시지를 회수하거나 만남을 취소하지 않아요."
                    else if (type == "MESSAGE_SEND")
                        state.messages.find { it.id == selected }?.text.orEmpty()
                    else state.replies.find { it.id == selected }?.text.orEmpty()
                )
            },
            confirmButton = {
                VehicleDialogButton(
                    onClick = {
                        review = null
                        onStop()
                        onAction(type, binding)
                        if (type == "MESSAGE_SEND") threadId = ""
                        if (type != "CANCEL_PENDING_COMMAND") page = "messages"
                    },
                    enabled = type == "CANCEL_PENDING_COMMAND" || state.canInteract,
                ) {
                    Text(if (type == "CANCEL_PENDING_COMMAND") "요청 중단" else "확인하고 전송")
                }
            },
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { review = null }) { Text("돌아가기") } },
        )
    }
}
