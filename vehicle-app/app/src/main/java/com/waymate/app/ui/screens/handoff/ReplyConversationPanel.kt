package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.waymate.app.model.ContentThread
import com.waymate.app.model.ContentUiState
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.*
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Muted

/** Shared reply presentation. Driving text/voice availability must be admitted by the host's UX policy.
 * The current production host defers social messages while driving; Debug previews are parked-only. */
@Composable
internal fun ReplyConversationPanel(
    state: ContentUiState,
    thread: ContentThread?,
    speech: SpeechState,
    selected: String,
    onSelect: (String) -> Unit,
    onThread: (String) -> Unit,
    onReview: () -> Unit,
    onCompose: () -> Unit,
    onSpeak: (String) -> Unit,
    onStop: () -> Unit,
    onBack: (() -> Unit)?,
    recovery: @Composable () -> Unit = {},
    driving: Boolean = false,
    voice: AgentVoicePresentation = AgentVoicePresentation.playback(speech),
) {
    val received = thread?.status == "received"
    val pending = state.pendingType in listOf("MESSAGE_SEND", "MESSAGE_REPLY")
    val canSelect = state.canInteract && !pending && received
    val peer = state.peerAlias ?: "친구"
    val replyVoice = voice.copy(labelOverride = when (voice.phase) {
        AgentVoicePhase.SPEAKING -> "답장을 읽고 있어요"
        AgentVoicePhase.PREPARING -> "답장 읽기를 준비해요"
        else -> voice.labelOverride
    })
    val presentation = if (replyVoice.simulated) replyVoice else replyVoice.copy(inputNotice =
        if (received) "음성 답변 준비 중 · 화면에서 골라 주세요" else "음성 입력 연결 준비 중")
    CompanionScene(avatarId = "b-01", bubble = "답장이 도착했어요", title = when (thread?.status) {
        "waiting" -> "답장을 기다리고 있어요"
        "replied" -> "답변을 전달했어요"
        "received" -> if (driving) "${peer}님의 이야기" else "${peer}님의 답장"
        else -> "친구와 주고받은 이야기"
    }, motionEnabled = !driving && state.canInteract,
        voicePresentation = presentation, pinActions = true, onBack = if (driving) null else onBack,
        card = {
            CompanionInfoCard {
                if (!driving && state.threads.size > 1) state.threads.forEach { t ->
                    CompanionChoice(t.text + if (t.unread) " · 새 답장" else "", thread?.id == t.id, state.canInteract && !pending) { onThread(t.id) }
                }
                if (!driving && thread != null) Text("내가 보낸 말 · ${thread.text}", color = Muted, style = MaterialTheme.typography.bodyMedium)
                when (thread?.status) {
                    "received", "replied" -> {
                        if (driving) Text("${peer}님의 말", color = Forest, style = MaterialTheme.typography.bodyMedium)
                        Text(thread.response.orEmpty(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        thread.followup?.let { Text(it, style = MaterialTheme.typography.titleLarge) }
                        HorizontalDivider(color = Forest.copy(alpha = .12f))
                        if (thread.status == "replied") {
                            Text("내 답변 · ${thread.reply}", style = MaterialTheme.typography.titleLarge)
                        } else if (driving) {
                            // Read-only summaries, deliberately no click/selection semantics or disabled controls.
                            state.replies.take(2).forEachIndexed { index, reply ->
                                Text("${index + 1}. ${reply.text}", style = MaterialTheme.typography.titleLarge)
                            }
                        } else state.replies.forEach { reply ->
                            CompanionChoice(reply.text, selected == reply.id, canSelect) { onSelect(reply.id) }
                        }
                    }
                    "waiting" -> Text("$peer 님이 답하면 알려드릴게요. 다른 화면에서도 기다릴 수 있어요.", style = MaterialTheme.typography.titleLarge)
                    null -> Text("아직 주고받은 이야기가 없어요.", style = MaterialTheme.typography.titleLarge)
                    else -> Text("마무리된 대화예요. 새 이야기를 시작해 볼까요?", style = MaterialTheme.typography.titleLarge)
                }
                if (pending) Text("전송 결과 확인 중 · 같은 답변을 다시 보내지 않아요.", color = Forest)
                state.notice?.let { Text(it) }
                if (!state.canInteract && !driving) Text("현재는 답변을 선택하거나 보낼 수 없어요.", color = Muted)
            }
        },
        actions = {
            if (!driving) CompanionActionGrid(buildList {
                if (received) add(CompanionActionItem("답변 확인", onReview,
                    canSelect && state.actions["MESSAGE_REPLY_$selected"] != null))
                if (state.actions.containsKey("MESSAGE_SEND_M1")) add(CompanionActionItem("다른 말 전하기", onCompose, state.canInteract && !pending, secondary = true))
            })
        },
        footer = recovery,
        supporting = {
            if (driving) {
                Text(when (voice.phase) {
                    AgentVoicePhase.LISTENING -> "“첫 번째”처럼 편하게 답해 주세요"
                    AgentVoicePhase.PROCESSING -> "답변을 정리한 뒤 다시 읽어드릴게요"
                    AgentVoicePhase.PAUSED -> "준비되면 대화를 다시 이어가요"
                    AgentVoicePhase.STOPPED -> "안내를 멈췄어요 · 자동으로 다시 읽지 않아요"
                    AgentVoicePhase.UNAVAILABLE -> "음성 안내를 사용할 수 없어요 · 정차 후 확인해 주세요"
                    AgentVoicePhase.PREPARING -> "답장 읽기를 준비하고 있어요"
                    AgentVoicePhase.IDLE -> "대화를 시작하면 답장을 읽어드릴게요"
                    AgentVoicePhase.SPEAKING -> "답장을 들은 뒤 말로 이어가요"
                }, color = Forest, style = MaterialTheme.typography.titleMedium)
                Text("보낼 내용은 다시 확인한 뒤 전송해요", color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
            CompanionActionGrid(buildList {
                if (voice.phase == AgentVoicePhase.SPEAKING && !voice.simulated)
                    add(CompanionActionItem("안내 멈추기", onStop, secondary = true, quiet = true))
                else if (!driving && speech.available && thread?.response != null && !voice.simulated)
                    add(CompanionActionItem("답장 읽어주기", { onSpeak(listOfNotNull(thread.response, thread.followup).joinToString(" ")) }, state.canInteract, secondary = true, quiet = true))
            })
        },
    )
}
