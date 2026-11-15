package com.waymate.app.demo

import android.os.Bundle
import com.waymate.app.model.*
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.screens.handoff.HandoffUiState

/** All effects in this variant are local. No repository, credentials, microphone or NaviHelper. */
class OfflineDemoSession(saved: Bundle? = null) {
    var scene = saved?.getString("scene") ?: "home"
        private set
    var revision = saved?.getInt("revision") ?: 1
        private set
    private var replied = saved?.getBoolean("replied") ?: false
    private var replyChoice = saved?.getString("replyChoice") ?: "R1"
    private var call = saved?.getString("call") ?: "none"
    private var meeting = saved?.getString("meeting") ?: "none"
    private var ending = saved?.getString("ending") ?: "none"
    private var waypoint = saved?.getBoolean("waypoint") ?: false
    private var loaded = saved?.getBoolean("loaded") ?: true
    fun save() = Bundle().apply {
        putString("scene", scene); putInt("revision", revision); putBoolean("replied", replied)
        putString("replyChoice", replyChoice); putString("call", call); putString("meeting", meeting); putString("ending", ending)
        putBoolean("waypoint", waypoint); putBoolean("loaded", loaded)
    }
    fun select(id: String) {
        require(scenes.any { it.first == id })
        scene = id; revision++; replied = false; waypoint = false; loaded = id != "preparation"
        call = when (id) { "call-active", "extra-MC" -> "active"; "call-waiting" -> "requested"; "call-ended" -> "ended"; else -> "none" }
        meeting = if (id == "meeting-agreed") "confirmed" else "none"
        ending = if (id == "extra-REVIEW") "together" else if (id.startsWith("ending-")) id.removePrefix("ending-") else "none"
    }
    fun journey() = Journey("offline:$revision", 1, "여행자", "a-01", "여유로운 여행", listOf("바다", "산책"),
        "2026-12-14", "15:20", "안목해변 산책", "강릉 숙소", "15:45", "16:00",
        planTitle = "강릉에서 천천히 쉬어가는 하루", destination = "강릉",
        plannedDays = listOf(PlannedDay(1, "2026-12-14", listOf(
            PlannedStop("12:00", "점심 식사", "여행 중 점심 장소를 골라요"),
            PlannedStop("14:15", "바다쉼표 카페", "친구와 20분 만남 · 가상 장소"),
            PlannedStop("15:20", "안목해변 산책", "다음 개인 일정"),
            PlannedStop("16:00", "강릉 숙소", "복귀 마감")))))
    val contentPage get() = when {
        scene.startsWith("call-") -> "call"
        scene.startsWith("content-") -> scene.removePrefix("content-")
        else -> null
    }
    fun extra(): VehiclePageFlow? {
        val page = scenesExtras[scene] ?: return null
        val rest = VehiclePageFlow().chooseQuery(false).select("rest-1")
        val pending = rest.reviewRoute().approve()
        return when (page) {
            VehiclePage.REST_LIST -> VehiclePageFlow().chooseQuery(false)
            VehiclePage.REST_DETAIL -> rest
            VehiclePage.LUNCH_LIST -> VehiclePageFlow().chooseQuery(true)
            VehiclePage.LUNCH_DETAIL -> VehiclePageFlow().chooseQuery(true).select("lunch-1")
            VehiclePage.WAYPOINT_REVIEW -> rest.reviewRoute()
            VehiclePage.DESTINATION_REVIEW -> rest.copy(destination = null).reviewRoute()
            VehiclePage.NAV_PENDING -> pending
            VehiclePage.NAV_UNKNOWN -> pending.complete(1, PreviewOutcome.UNKNOWN)
            VehiclePage.NAV_FAILED -> pending.complete(1, PreviewOutcome.FAILED)
            VehiclePage.WAYPOINT_DONE -> pending.complete(1, PreviewOutcome.SUCCESS)
            VehiclePage.DESTINATION_DONE -> rest.copy(destination = null).reviewRoute().approve().complete(1, PreviewOutcome.SUCCESS)
            VehiclePage.ITINERARY -> VehiclePageFlow().reviewSchedule()
            VehiclePage.REVIEW -> VehiclePageFlow(page = page, reviewFinished = true)
            VehiclePage.MC -> VehiclePageFlow(page = page, mcPhase = "active")
            else -> VehiclePageFlow(page = page)
        }
    }
    fun state(): HandoffUiState {
        val actions = mutableMapOf<String, String>()
        for (id in listOf("M1", "M2")) actions["MESSAGE_SEND_$id"] = id
        for (id in listOf("R1", "R2")) actions["MESSAGE_REPLY_$id"] = id
        when (call) {
            "none", "ended" -> actions["CALL_PROPOSE"] = "call"
            "requested" -> { actions["CALL_CANCEL"] = "call"; actions["CALL_ACCEPT"] = "call" }
            "active" -> actions["CALL_END"] = "call"
        }
        val visibleContent = contentPage != null
        val content = ContentUiState(visible = visibleContent, blocked = false, scope = "offline:$revision", peerAlias = "솔바람",
            questions = listOf(ContentQuestion("Q1", "어떤 여행을 좋아해요?", "저는 바다를 보며 천천히 걷는 여행을 좋아해요.", true),
                ContentQuestion("Q2", "어디에서 쉬고 싶어요?", "저는 조용한 카페도 좋아해요.", true)),
            messages = listOf(ContentPreset("M1", "오늘 여행에서 가장 좋았던 풍경이 뭐예요?"), ContentPreset("M2", "잠깐 쉬어가고 싶어요.")),
            replies = listOf(ContentPreset("R1", "저도 바다를 보며 걷는 게 좋아요."), ContentPreset("R2", "저는 조용한 카페도 좋아해요.")),
            threads = listOf(ContentThread("demo-thread", if (replied) "replied" else if (scene == "content-waiting") "waiting" else "received",
                "오늘 여행에서 가장 좋았던 풍경이 뭐예요?", if (scene == "content-waiting") null else "저는 오늘 만난 조용한 바다가 기억에 남아요.",
                "어떤 풍경을 좋아하세요?", if (replied) (if (replyChoice == "R2") "저는 조용한 카페도 좋아해요." else "저도 바다를 보며 걷는 게 좋아요.") else null, !replied)),
            actions = actions, canInteract = true, replyDone = "편하게 여행 이야기를 이어가요.",
            call = if (call == "none") null else CallUiState("offline-call:$revision", call, call == "active", listOf(
                CallSampleLine("1", "솔바람", "안녕하세요. 오늘 바다 풍경이 참 좋네요."),
                CallSampleLine("2", "여행자", "저도 바다를 보며 걷는 게 좋아요."))),
        )
        val socialActions = if (meeting == "confirmed") mapOf("MEETING_CANCEL" to "meeting")
            else mapOf("MEETING_PROPOSE" to "meeting", "MEETING_DECLINE" to "meeting")
        val social = SocialUiState(visible = scene.startsWith("meeting-"), peerAlias = "솔바람", connectionStatus = "linked",
            meetingStatus = meeting, canInteract = true, actions = socialActions,
            meeting = MeetingPlan("바다쉼표 카페", "2026-12-14", "14:15", "14:35"))
        val end = EndingUiState(visible = ending != "none", scope = "offline:$revision", phase = ending, blocked = false,
            canInteract = true, mockNavigation = true, prompt = "남은 여행을 어떻게 이어갈까요?",
            lines = listOf(EndingLine("솔바람", "함께 걸으니 새로운 풍경이 보이네요."), EndingLine("여행자", "오늘 이야기를 나눌 수 있어서 좋았어요.")),
            closing = "오늘도 좋은 여행이었어요.", answers = listOf(EndingAnswer("rest", "조금 쉬어갈래요", "천천히 쉬어가도 괜찮아요.")),
            actions = mapOf("FINAL_CHOOSE_TOGETHER" to "together", "FINAL_CHOOSE_MY_AGENT" to "my_agent", "CONNECT_END" to "my_agent"))
        return HandoffUiState(journey = if (loaded) journey() else null, preparation = journey(), loadEnabled = true, startEnabled = true,
            content = content, social = social, ending = end,
            navigation = NavigationUiState(visible = scene == "navigation", source = "mock", status = "로컬 시연 경로 · 실제 내비 변경 없음",
                destination = "안목해변 산책", mockActions = if (waypoint) mapOf("NAV_REMOVE_APPROVE" to "{\"commandType\":\"NAV_REMOVE_APPROVE\",\"payload\":{\"operation\":\"remove\"}}")
                else mapOf("NAV_APPROVE" to "{\"commandType\":\"NAV_APPROVE\",\"payload\":{\"operation\":\"add\"}}"), mockWaypointPresent = waypoint),
            notice = "오프라인 시연 · 준비된 여행과 상대 응답 · 실제 통신 없음")
    }
    fun act(type: String, binding: String) {
        when (type) {
            "MESSAGE_SEND", "MESSAGE_REPLY" -> { replied = type == "MESSAGE_REPLY"; replyChoice = binding }
            "CALL_PROPOSE" -> call = "active" // Prepared peer consent in this offline demonstration only.
            "CALL_CANCEL", "CALL_END" -> call = "ended"
            "MEETING_PROPOSE" -> meeting = "confirmed"
            "MEETING_CANCEL", "MEETING_DECLINE" -> meeting = "none"
            "MEETING_START" -> { ending = "meeting"; scene = "ending-meeting" }
            "MEETING_END" -> { ending = "pending"; scene = "ending-pending" }
            "FINAL_CHOOSE", "CONNECT_END" -> { ending = binding; scene = "ending-$binding" }
            "MOCK_NAV_ADD", "NAV_APPROVE" -> { waypoint = true; ending = "travel"; scene = "ending-travel" }
            "MOCK_NAV_REMOVE", "NAV_REMOVE_APPROVE" -> waypoint = false
        }
    }
    fun load() { loaded = true }
    fun open(section: String) { scene = section }
    fun home() { scene = "home" }
    companion object {
        val scenesExtras = VehiclePage.entries.filter { it != VehiclePage.HOME }.associateBy { "extra-${it.name}" }
        val scenes = listOf(
            "home" to "나만의 여행 홈", "preparation" to "여행 준비", "content-friend" to "내 친구와 대화",
            "content-intro" to "친구 소개", "content-list" to "대화 고르기", "content-profile" to "상대 알아가기",
            "content-answer" to "친구의 이야기", "content-draft" to "말 전하기", "content-messages" to "답장 확인",
            "content-waiting" to "답장 기다리기", "content-rest" to "대화 쉬기", "call-waiting" to "통화 동의 대기",
            "call-active" to "통화 중", "call-ended" to "통화 종료", "meeting-proposal" to "만남 제안",
            "meeting-agreed" to "만남 동의 완료", "navigation" to "내비 경로 확인",
            "ending-travel" to "만남 장소로 이동", "ending-meeting" to "첫 만남", "ending-pending" to "남은 여행 선택",
            "ending-together" to "함께 여행", "ending-my_agent" to "각자의 여행"
        ) + scenesExtras.map { (id, page) -> id to page.pageTitle }
    }
}
