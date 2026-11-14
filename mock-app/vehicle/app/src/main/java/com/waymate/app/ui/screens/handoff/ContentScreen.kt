package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.VehicleBackground
import com.waymate.app.ui.components.SpeechBubble
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ContentUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.AgentCharacter

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
) {
    var page by
        rememberSaveable(state.scope) {
            mutableStateOf(if (state.peerAlias != null) "intro" else "friend")
        }
    var showVoice by rememberSaveable(state.scope) { mutableStateOf(false) }
    var showSchedule by rememberSaveable(state.scope) { mutableStateOf(false) }
    var selected by rememberSaveable(state.scope) { mutableStateOf("") }
    var question by rememberSaveable(state.scope) { mutableStateOf("") }
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
    val caption =
        when (page) {
            "intro" -> "반가워요. 저는 ${state.peerAlias}의 캐릭터예요. 만나기 전에 어떤 여행을 좋아하는지 편하게 물어봐 주세요."
            "answer" -> state.questions.find { it.id == question }?.answer
            "messages" -> thread?.response
            "done" -> state.replyDone
            "friend" -> "말할 주제가 생겼네. 더 알아가도 좋고, 잠깐 쉬어도 좋아. 다음은 네가 고르면 돼."
            "rest" -> "대화는 잠깐 쉬어가요. 다시 이어갈 때 직접 골라 주세요."
            else -> null
        }
    if (state.blocked) {
        VehicleBackground {
            Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("정차 상태에서 대화를 이어갈 수 있어요.", style = MaterialTheme.typography.headlineSmall)
                Text("현재 차량·화면 상태를 확인하고 있어요.")
                VehicleOutlineButton(onClick = onStop) { Text("낭독 중단") }
                for (type in listOf("CALL_CANCEL", "CALL_END")) state.actions[type]?.let { b ->
                    VehicleOutlineButton(
                        onClick = {
                            onStop()
                            onAction(type, b)
                        }
                    ) {
                        Text(if (type == "CALL_CANCEL") "통화 제안 취소" else "통화 종료")
                    }
                }
                VehicleOutlineButton(onClick = onBack) { Text("내 친구 홈으로") }
            }
        }
        return
    }
    VehicleBackground {
        CharacterScene(
            resetKey = page,
            character = { characterModifier, wide ->
                Column(characterModifier, horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("말이통행", color = com.waymate.app.ui.theme.Forest, style = MaterialTheme.typography.headlineMedium)
                    SpeechBubble(when(page) {
                        "intro" -> "새로운 여행 친구를 만났어요"
                        "profile", "list" -> "어떤 이야기를 시작할까요?"
                        "draft" -> "전하고 싶은 말을 골라볼까요?"
                        "messages" -> if (thread?.response != null) "답장이 도착했어요!" else "조금만 천천히 기다려요"
                        "call" -> "목소리로도 이야기해요"
                        "rest" -> "잠깐 쉬어가도 괜찮아요"
                        else -> "네 이야기를 듣고 있어요"
                    })
                    AgentCharacter(
                        if (page in listOf("friend", "rest", "done")) journey?.avatarId ?: "a-01" else "b-01",
                        Modifier.fillMaxWidth().height(if (wide) 260.dp else 420.dp),
                        speechPhase = if (page == "call") "resting" else speech.phase,
                        motionEnabled = state.canInteract,
                    )
                    Text(if (page in listOf("friend", "rest", "done")) "내 여행 친구" else "${state.peerAlias ?: "내 친구"}의 에이전트",
                        color = com.waymate.app.ui.theme.Muted, style = MaterialTheme.typography.labelMedium)
                    if (speech.phase in listOf("speaking", "preparing", "interrupted"))
                        Text(if (speech.phase == "interrupted") "음성 중단 · 자동 재개 없음" else "짧은 음성 안내 중",
                            color = com.waymate.app.ui.theme.Muted, style = MaterialTheme.typography.bodySmall)
                }
            },
            content = { contentModifier ->
                Column(contentModifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(if (page == "intro") "${state.peerAlias}님의 AI 친구" else "서로의 이야기를 알아가요",
                        style = MaterialTheme.typography.headlineLarge, color = com.waymate.app.ui.theme.Ink)
                    if (!state.canInteract) Text("정차·연결·화면 활성 상태를 확인해 주세요. 새 선택과 전송은 잠겼어요.")
                    state.notice?.let { Text(it) }
                    when (page) {
                        "intro" -> {
                            Text("이제 조금씩 알아가 볼까요?", style = MaterialTheme.typography.titleLarge)
                            Text("공개 프로필 기반 · 실제 B의 현재 답변이 아니에요.", style = MaterialTheme.typography.bodySmall)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                VehicleButton(onClick = { navigate("list") }, enabled = state.canInteract, modifier = Modifier.weight(1f)) { Text("이야기 시작") }
                                VehicleOutlineButton(onClick = { navigate("rest") }, modifier = Modifier.weight(1f)) { Text("잠깐 쉬기") }
                            }
                        }
                        "list" -> {
                            VehicleButton(onClick = { navigate("profile") }, enabled = state.canInteract) {
                                Text("상대 캐릭터와 알아가기")
                            }
                            VehicleButton(
                                onClick = { navigate(if (thread != null) "messages" else "draft") },
                                enabled = state.canInteract,
                            ) {
                                Text(
                                    if (state.threads.any { it.unread }) "새 답장 · 에이전트로 말 전하기"
                                    else "에이전트로 말 전하기"
                                )
                            }
                            if (state.actions.containsKey("CALL_PROPOSE") || callBusy)
                                VehicleButton(
                                    onClick = { navigate("call") },
                                    enabled = state.canInteract,
                                ) {
                                    Text("둘이 직접 통화하기")
                                }
                            VehicleButton(onClick = { navigate("friend") }) { Text("내 에이전트와 이야기하기") }
                            VehicleButton(
                                onClick = {
                                    onStop()
                                    onMeeting()
                                },
                                enabled = state.canInteract,
                            ) {
                                Text("만남 제안 받기")
                            }
                            VehicleOutlineButton(onClick = { navigate("rest") }) { Text("지금은 쉬기") }
                        }
                        "call" ->
                            CallPanel(state, speech, onSpeak, onStop, onAction) { navigate("list") }
                        "profile" -> {
                            Text("${state.peerAlias}의 에이전트 · 공개 프로필 기반")
                            state.questions.forEach { q ->
                                VehicleOutlineButton(
                                    onClick = { selected = q.id },
                                    enabled = state.canInteract,
                                ) {
                                    Text((if (selected == q.id) "✓ " else "") + q.text)
                                }
                            }
                            VehicleButton(
                                onClick = {
                                    question = selected
                                    navigate("answer")
                                },
                                enabled = state.canInteract && selected.isNotEmpty(),
                            ) {
                                Text("물어보기")
                            }
                        }
                        "answer" -> {
                            Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                            Text("공개 프로필에 근거한 준비된 답변 · B에게 전송되지 않아요.")
                            if (state.questions.find { it.id == question }?.known == false)
                                VehicleButton(
                                    onClick = { navigate("draft") },
                                    enabled = state.canInteract,
                                ) {
                                    Text("직접 물어보기 · 보낼 말 확인")
                                }
                            VehicleOutlineButton(onClick = { navigate("profile") }) { Text("다른 질문") }
                        }
                        "draft" -> {
                            Text("솔바람에게 전할 말을 먼저 확인해 주세요. 사적인 캐릭터 대화는 전송하지 않아요.")
                            state.messages.forEach { m ->
                                VehicleOutlineButton(
                                    onClick = { selected = m.id },
                                    enabled = state.canInteract,
                                ) {
                                    Text((if (selected == m.id) "✓ " else "") + m.text)
                                }
                            }
                            state.messages
                                .find { it.id == selected }
                                ?.let {
                                    Text(
                                        "보낼 문장: ${it.text}",
                                        style = MaterialTheme.typography.titleLarge,
                                    )
                                }
                            state.actions["MESSAGE_SEND_$selected"]?.let { binding ->
                                VehicleButton(
                                    onClick = { review = "MESSAGE_SEND" to binding },
                                    enabled = state.canInteract,
                                ) {
                                    Text("이 말 보내기")
                                }
                            }
                            Text("전송 성공은 시연 서버 저장 확인이에요. 실제 상대 열람·통신 증빙은 아니에요.")
                        }
                        "messages" -> {
                            state.threads.forEach { t ->
                                VehicleOutlineButton(
                                    onClick = {
                                        onStop()
                                        threadId = t.id
                                        selected = ""
                                    },
                                    enabled = state.canInteract,
                                ) {
                                    Text(t.text + (if (t.unread) " · 새 답장" else ""))
                                }
                            }
                            thread?.let { t ->
                                Text("보낸 말: ${t.text}", style = MaterialTheme.typography.titleLarge)
                                when (t.status) {
                                    "waiting" -> Text("솔바람님의 답장을 기다리고 있어요. 목록으로 나가도 요청은 유지돼요.")
                                    "received",
                                    "replied" -> {
                                        Text(
                                            "솔바람의 메시지 · 에이전트가 읽어줌",
                                            style = MaterialTheme.typography.titleMedium,
                                        )
                                        Text(t.response.orEmpty())
                                        Text("솔바람의 후속 질문: ${t.followup}")
                                        if (t.status == "received") {
                                            state.replies.forEach { r ->
                                                VehicleOutlineButton(
                                                    onClick = { selected = r.id },
                                                    enabled = state.canInteract,
                                                ) {
                                                    Text(
                                                        (if (selected == r.id) "✓ " else "") +
                                                            r.text
                                                    )
                                                }
                                            }
                                            state.actions["MESSAGE_REPLY_$selected"]?.let { binding
                                                ->
                                                VehicleButton(
                                                    onClick = {
                                                        review = "MESSAGE_REPLY" to binding
                                                    },
                                                    enabled = state.canInteract,
                                                ) {
                                                    Text("답변 보내기")
                                                }
                                            }
                                        } else {
                                            Text("전달 완료: ${t.reply}")
                                            Text(state.replyDone)
                                        }
                                    }
                                    else -> Text("종료된 메시지예요. 새 답장으로 다시 열지 않아요.")
                                }
                            }
                            if (state.actions.containsKey("MESSAGE_SEND_M1"))
                                VehicleOutlineButton(
                                    onClick = { navigate("draft") },
                                    enabled = state.canInteract,
                                ) {
                                    Text("다른 말 전하기")
                                }
                        }
                        "friend",
                        "done" -> {
                            Text(caption.orEmpty(), style = MaterialTheme.typography.titleLarge)
                            Text("네가 정한 다음 일정과 복귀 계획은 그대로 확인할 수 있어.")
                        }
                        "rest" -> {
                            Text(caption.orEmpty())
                            VehicleButton(
                                onClick = {
                                    navigate(if (state.peerAlias != null) "list" else "friend")
                                },
                                enabled = state.canInteract,
                            ) {
                                Text("다시 이어가기")
                            }
                        }
                    }
                    if (state.peerAlias != null && page !in listOf("list", "intro") && !callBusy && page != "call")
                        VehicleOutlineButton(onClick = { navigate("list") }) { Text("콘텐츠 목록으로") }
                    if (
                        state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY", "CALL_PROPOSE")
                    ) {
                        Text("전송 결과 확인 중 · 다른 메시지로 중복 전송하지 않아요.")
                        VehicleOutlineButton(onClick = onRetry, enabled = state.canRetry) {
                            Text("이전 요청 결과 확인·재전송")
                        }
                        state.actions["CANCEL_PENDING_COMMAND"]?.let { b ->
                            VehicleOutlineButton(onClick = { review = "CANCEL_PENDING_COMMAND" to b }) {
                                Text("미확인 전송 요청 중단")
                            }
                        }
                    }
                    if (caption != null && page != "rest") {
                        TextButton(onClick = { showVoice = !showVoice }) { Text(if (showVoice) "음성 안내 접기" else "음성 안내") }
                        if (showVoice) VehicleOutlineButton(onClick = { onSpeak(caption) }, enabled = state.canInteract && speech.available) { Text("현재 문장 읽어주기") }
                        if (speech.phase in listOf("speaking", "preparing")) VehicleOutlineButton(onClick = onStop) { Text("낭독 중단") }
                    }
                    TextButton(onClick = { onStop(); onBack() }, enabled = !callBusy) { Text("내 친구 홈으로") }
                    TextButton(onClick = { showSchedule = !showSchedule }) { Text(if (showSchedule) "내 일정 접기" else "내 일정 보기") }
                    if (showSchedule) JourneySchedule(journey)
                }
            },
        )
    }
    review?.let { (type, binding) ->
        AlertDialog(
            onDismissRequest = { review = null },
            title = {
                Text(if (type == "CANCEL_PENDING_COMMAND") "이 전송 요청을 중단할까요?" else "확인한 말을 보낼까요?")
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
                TextButton(
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
            dismissButton = { TextButton(onClick = { review = null }) { Text("돌아가기") } },
        )
    }
}
