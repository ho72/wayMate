package com.waymate.app.ui.testing

import androidx.compose.runtime.*
import com.waymate.app.model.*
import com.waymate.app.personal.*
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.screens.handoff.*
import com.waymate.app.ui.components.*
import com.waymate.app.platform.restrictions.InteractionMode

/** Offline visual fixtures only. No repository, microphone, SDK or command transport. */
internal val remainingScenes = linkedMapOf(
    "intro" to "친구 소개", "list" to "대화 고르기", "profile" to "공개 프로필 질문",
    "answer" to "프로필 답변", "draft" to "보낼 말 선택", "messages" to "답장 확인",
    "messages-waiting" to "답장 대기", "messages-replied" to "답변 전달 완료", "messages-closed" to "종료된 메시지",
    "call" to "통화 제안", "call-requested" to "통화 동의 대기", "call-active" to "동의 후 통화 샘플",
    "call-ended" to "통화 종료", "call-declined" to "통화 거절", "rest" to "잠깐 쉬기", "done" to "대화 마무리",
    "content-blocked" to "대화 제한 안내", "meeting" to "만남 제안", "meeting-confirmed" to "만남 확정",
    "meeting-cancelled" to "만남 취소", "navigation" to "실제 내비 경유 승인", "navigation-remove" to "실제 경유지 제거",
    "navigation-mock" to "모의 내비 승인", "navigation-pending" to "모의 내비 처리 중", "navigation-unknown" to "모의 내비 미확인",
    "waypoint" to "개인 경유지 승인", "destination" to "개인 목적지 승인", "itinerary" to "저장 일정 확인",
    "itinerary-same" to "같은 일정 목적지 유지", "pending" to "개인 안내 요청 중",
    "waypoint-done" to "개인 경유 반영", "destination-done" to "새 목적지 반영", "failed" to "안내 실패", "unknown" to "안내 미확인",
    "mc" to "MC 참여 제안", "mc-waiting" to "MC 동의 대기", "mc-active" to "MC 참여", "mc-declined" to "MC 거절",
    "voice" to "자막 대화 시작", "voice-talking" to "자막 대화", "voice-paused" to "대화 쉬기", "voice-ended" to "대화 종료",
    "ending-travel" to "만남 장소로 이동", "ending-meeting" to "첫 만남 재연", "ending-pending" to "최종 선택",
    "ending-submitted" to "최종 선택 제출 대기", "ending-together" to "함께 여행 결과", "ending-my_agent" to "각자 여행 결과",
    "ending-cancelled" to "선택 중단", "ending-blocked" to "선택 제한 안내",
    "review" to "여행 기록 진입", "review-write" to "여행 기록 작성", "review-applied" to "장식 반영 결과",
    "reset" to "초기화·경유지 정리", "reset-mock" to "모의 정리·복구",
    "account-unlinked" to "계정 연결 시작", "account-pending" to "연결 코드", "account-requested" to "계정 확인",
    "account-empty" to "연결 후 여행 대기", "account-trip" to "새 여행 수신", "account-received" to "받은 여행 일정",
    "account-revoked" to "계정 연결 해제", "account-blocked" to "계정 제한 안내", "account-loading" to "계정 로딩",
)

@Composable
internal fun RemainingPagesPreview(scene: String, journey: Journey) {
    val name = scene.removePrefix("batch-")
    key(scene) {
        val noop: () -> Unit = {}
        val action: (String, String) -> Unit = { _, _ -> }
        val questions = listOf(
            ContentQuestion("Q1", "어떤 여행을 좋아해요?", "저는 바다를 보며 천천히 걷는 여행을 좋아해요.", true),
            ContentQuestion("Q2", "여행에서 가장 좋아하는 순간은?", "조용한 풍경에서 잠깐 쉬는 순간이 좋아요.", true),
            ContentQuestion("Q3", "오늘 점심은 뭘 먹고 싶어요?", "공개 프로필로는 알 수 없어요. 직접 물어볼까요?", false),
        )
        val presets = listOf(ContentPreset("M1", "오늘 여행에서 가장 좋았던 풍경이 뭐예요?"), ContentPreset("M2", "잠깐 바다를 보며 쉬어갈까요?"))
        val content = ContentUiState(visible = true, blocked = false, scope = scene, peerAlias = "솔바람",
            questions = questions, messages = presets, replies = listOf(ContentPreset("R1", "저도 바다를 보며 걷는 게 좋아요."), ContentPreset("R2", "저는 조용한 카페도 좋아해요.")),
            threads = listOf(ContentThread("T1", when (name) { "messages-waiting" -> "waiting"; "messages-replied" -> "replied"; "messages-closed" -> "closed"; else -> "received" },
                presets.first().text, if (name == "messages-waiting") null else "저는 오늘 만난 조용한 바다가 기억에 남아요.", "어떤 풍경을 좋아하세요?", "저도 바다가 좋아요.", unread = false)),
            actions = mapOf("MESSAGE_SEND_M1" to "preview", "MESSAGE_SEND_M2" to "preview", "MESSAGE_REPLY_R1" to "preview", "MESSAGE_REPLY_R2" to "preview", "CALL_PROPOSE" to "preview"),
            canInteract = true, replyDone = "답변을 전달했어요. 편하게 다음 이야기를 나눠요.")
        val social = SocialUiState(visible = true, peerAlias = "솔바람", meetingStatus = when (name) { "meeting-confirmed" -> "confirmed"; "meeting-cancelled" -> "cancelled"; else -> "none" },
            notice = when (name) { "meeting-confirmed" -> "두 분 모두 같은 장소와 시간에 동의했어요."; "meeting-cancelled" -> "만남을 취소했어요. 이미 추가한 경유지는 별도로 정리해요."; else -> "여행 사이에 잠깐 만나볼까요?" },
            actions = if (name == "meeting") mapOf("MEETING_PROPOSE" to "preview", "MEETING_DECLINE" to "preview") else emptyMap(),
            canInteract = true, cleanupRequired = name == "meeting-cancelled")
        val route = """{"second":{"destination":{"name":"내 숙소"}}}"""
        val navigation = NavigationUiState(visible = true, status = "경로를 확인한 뒤 직접 승인해 주세요.", destination = "내 숙소", canAdd = true, reviewed = route)
        val mock = navigation.copy(source = "mock", status = when (name) { "navigation-pending" -> "모의 반영 결과를 기다리고 있어요."; "navigation-unknown" -> "반영 여부 미확인 · 새 요청 잠금"; else -> "모의 경유지를 추가하기 전에 경로를 확인해 주세요." },
            mockActions = if (name in listOf("navigation-pending", "navigation-unknown")) emptyMap() else mapOf("NAV_APPROVE" to """{"commandType":"NAV_APPROVE","payload":{"operation":"add"}}"""))
        when {
            name.startsWith("reply-") -> {
                val driving = name.startsWith("reply-driving-")
                val phase = when (name.substringAfterLast('-')) {
                    "speaking" -> AgentVoicePhase.SPEAKING
                    "listening" -> AgentVoicePhase.LISTENING
                    "processing" -> AgentVoicePhase.PROCESSING
                    "paused" -> AgentVoicePhase.PAUSED
                    else -> AgentVoicePhase.IDLE
                }
                var selected by remember { mutableStateOf("") }
                VehicleBackground(pageTag = "답장 확인", mode = if (driving) InteractionMode.DRIVING_LIMITED else InteractionMode.PARKED) {
                    ReplyConversationPanel(content, content.threads.first(), SpeechState(), selected, { selected = it }, {}, {}, {}, {}, {}, noop,
                        driving = driving, voice = AgentVoicePresentation(phase, simulated = true))
                }
            }
            name in listOf("intro", "list", "profile", "answer", "draft", "messages", "messages-waiting", "messages-replied", "messages-closed", "rest", "done", "content-blocked") || name.startsWith("call") -> {
                val callStatus = name.removePrefix("call-")
                val state = when {
                    name == "content-blocked" -> content.copy(blocked = true, canInteract = false)
                    name.startsWith("call-") -> content.copy(call = CallUiState("C1", callStatus, callStatus == "active", listOf(CallSampleLine("L1", "솔바람", "안녕하세요. 오늘 바다 풍경이 참 좋네요."), CallSampleLine("L2", "여행자", "반가워요. 천천히 여행을 즐기고 있어요."))), actions = if (callStatus == "active") mapOf("CALL_END" to "preview") else if (callStatus == "requested") mapOf("CALL_CANCEL" to "preview") else emptyMap())
                    else -> content
                }
                ContentScreen(state, journey, SpeechState(), {}, noop, action, {}, {}, noop, noop, noop,
                    onOpenPlaces = noop, onOpenVoice = noop, onOpenMc = noop, onOpenItinerary = noop,
                    initialPage = when { name.startsWith("call") -> "call"; name.startsWith("messages") -> "messages"; name == "content-blocked" -> "intro"; else -> name })
            }
            name.startsWith("meeting") -> MeetingScreen(social, noop, action, noop, noop, journey)
            name.startsWith("navigation") -> NavigationScreen(
                when (name) { "navigation-remove" -> navigation.copy(canAdd = false, canRemove = true, status = "두루밋이 추가한 경유지만 제거해요."); "navigation" -> navigation; else -> mock },
                noop, action, noop, social.copy(meetingStatus = "confirmed"), action, noop, journey)
            name.startsWith("ending-") -> {
                val phase = name.removePrefix("ending-")
                EndingScreen(EndingUiState(visible = true, scope = scene, phase = if (phase == "submitted") "pending" else phase,
                    blocked = phase == "blocked", canInteract = phase != "blocked", mockNavigation = true,
                    myChoice = if (phase == "submitted") "together" else null,
                    lines = listOf(EndingLine("솔바람", "실제로 만나니 더 반가워요. 오늘 어떤 풍경이 좋았어요?"), EndingLine("여행자", "조용히 걸었던 바다가 기억에 남아요.")),
                    answers = listOf(EndingAnswer("rest", "잠깐 쉬면서 이어가자", "좋아. 우리의 속도로 천천히 가보자.")),
                    closing = "다음 풍경도 함께 찾아보자.", actions = mapOf("FINAL_CHOOSE_TOGETHER" to "preview", "FINAL_CHOOSE_MY_AGENT" to "preview", "CONNECT_END" to "preview")),
                    journey, SpeechState(), {}, noop, action, noop, noop, noop, noop, noop)
            }
            name.startsWith("reset") -> ResetScreen(ResetUiState(visible = true, status = "새 회차 전에 경유지 정리 승인이 필요해요.", destination = "내 숙소", canRemove = true, canRetry = true, reviewed = route,
                mockNavigation = if (name == "reset-mock") mock.copy(status = "새 회차 전에 경유지를 정리해요.", mockActions = mapOf("NAV_REMOVE_APPROVE" to """{"commandType":"NAV_REMOVE_APPROVE","payload":{"operation":"remove"}}"""), mockWaypointPresent = true) else null), action, noop, noop, action)
            name.startsWith("account-") -> {
                val phase = name.removePrefix("account-")
                val delivery = PersonalDelivery("D1", "P1", 1, if (phase == "received") 1L else null, "여행자", "dragon", "T1", "천천히 걷는 바다 여행", "강릉", "바다 산책과 작은 카페에서 쉬어가는 하루예요.",
                    listOf(PersonalDay(1, "2026-11-15", listOf(PersonalStop("14:00", "바다 산책", "바닷길을 따라 천천히 걸어요."), PersonalStop("15:20", "해변 카페", "차 한 잔과 함께 쉬어가요."))), PersonalDay(2, null, listOf(PersonalStop("10:00", "아침 산책", "숙소 주변을 가볍게 걸어요.")))), emptyList())
                PersonalTripScreen(PersonalVehicleState(phase = if (phase in listOf("trip", "received", "empty")) "active" else phase,
                    pairingId = "P1", code = "48261539", accountName = "여행자", delivery = if (phase in listOf("trip", "received")) delivery else null, allowed = phase != "blocked", localParked = phase != "blocked"),
                    noop, {}, noop, noop, noop, noop)
            }
            else -> {
                val page = when (name) {
                    "waypoint" -> VehiclePage.WAYPOINT_REVIEW; "destination" -> VehiclePage.DESTINATION_REVIEW
                    "itinerary", "itinerary-same" -> VehiclePage.ITINERARY; "pending" -> VehiclePage.NAV_PENDING
                    "waypoint-done" -> VehiclePage.WAYPOINT_DONE; "destination-done" -> VehiclePage.DESTINATION_DONE
                    "failed" -> VehiclePage.NAV_FAILED; "unknown" -> VehiclePage.NAV_UNKNOWN
                    else -> if (name.startsWith("mc")) VehiclePage.MC else if (name.startsWith("review")) VehiclePage.REVIEW else VehiclePage.VOICE
                }
                var flow by remember { mutableStateOf(previewFor(page).copy(
                    mcPhase = name.removePrefix("mc-").takeIf { name.startsWith("mc-") } ?: "review",
                    voicePhase = name.removePrefix("voice-").takeIf { name.startsWith("voice-") } ?: "ready",
                    reviewFinished = name in listOf("review-write", "review-applied"), decoratedAvatars = if (name == "review-applied") "a-01" else "",
                ).let { if (name == "itinerary-same") it.copy(destination = "schedule") else it }) }
                VehicleExtraScreen(flow, journey, true, { flow = it }, noop, noop, noop, noop, autoAdvance = false)
            }
        }
    }
}
