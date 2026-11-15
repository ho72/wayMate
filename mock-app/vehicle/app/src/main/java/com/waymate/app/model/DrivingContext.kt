package com.waymate.app.model

import com.waymate.app.ui.screens.extras.*

/** Read-only projection of the page the driver was viewing. Never carries a command or grant. */
data class DrivingContext(
    val id: String,
    val title: String,
    val headline: String,
    val detail: String,
    val narration: String,
    val avatarId: String = "a-01",
    val callActive: Boolean = false,
) {
    fun save() = listOf(id, title, headline, detail, narration, avatarId, callActive.toString())
    companion object {
        fun restore(v: List<String>) = runCatching {
            DrivingContext(v[0], v[1], v[2], v[3], v[4], v[5], v[6].toBoolean())
        }.getOrNull()
    }
}

object DrivingContexts {
    // These short prompts are bundled as local audio. They do not claim microphone input.
    const val HOME = "다음 일정과 복귀 계획을 기억하고 있어요. 안전하게 이동해요."
    const val FRIEND = "친구와 나누던 이야기를 기억하고 있어요. 정차하면 그 자리에서 이어가요."
    const val REPLY = "친구의 답장이 도착했어요. 답장 내용은 간단히 표시하고, 답변 전송은 정차 후에 이어가요."
    const val CALL = "통화 시연 상태를 유지하고 있어요. 새 통화나 대사 선택은 정차 후에 이어가요."
    const val PLACE = "보고 있던 장소를 기억하고 있어요. 자세한 비교와 경로 승인은 정차 후에 이어가요."
    const val SCHEDULE = "저장한 여행 일정을 기억하고 있어요. 다음 일정과 복귀 시간을 확인해 주세요."
    const val ROUTE = "확인하던 경로를 기억하고 있어요. 주행 전의 승인은 취소했어요. 정차 후 다시 확인해 주세요."
    const val PENDING = "요청한 안내의 결과를 확인하고 있어요. 같은 요청을 다시 보내지 않아요."
    const val SUCCESS = "시연 경로의 반영 결과를 확인했어요. 다음 일정에 맞춰 안전하게 이동해요."
    const val FAILED = "안내를 반영하지 못했어요. 기존 목적지는 유지하고, 정차 후 다시 확인해 주세요."
    const val UNKNOWN = "안내 결과를 아직 확인하지 못했어요. 새 요청은 보내지 않고 정차 후 확인해요."
    const val MEETING = "친구와의 만남 계획을 기억하고 있어요. 장소와 시간에 대한 동의는 정차 후에 이어가요."
    const val ENDING = "여행의 다음 이야기를 기억하고 있어요. 남은 여행의 선택은 정차 후에 이어가요."
    const val PREPARATION = "여행 준비 내용을 기억하고 있어요. 여행 불러오기와 시작은 정차 후에 진행해 주세요."
    const val VOICE = "음성 대화 화면을 보고 있어요. 이 버전은 마이크가 연결되지 않은 시연이에요."
    const val RESET = "여행 상태를 확인하고 있어요. 정차 후 확인 화면에서 이어가 주세요."

    fun home(journey: Journey?) = DrivingContext("home", if (journey == null) "여행 준비" else "나만의 여행",
        journey?.let { "${it.nextVisit} · ${it.nextVisitLabel}" } ?: "정차 후 여행을 준비해요",
        journey?.let { "${it.returnPlaceLabel} · ${it.returnDeadline}까지 복귀" } ?: "저장한 여행은 정차 후 불러올 수 있어요",
        if (journey == null) PREPARATION else HOME, journey?.avatarId ?: "a-01")

    fun extra(flow: VehiclePageFlow, journey: Journey?): DrivingContext {
        val place = flow.place
        val (headline, detail, narration) = when (flow.page) {
            VehiclePage.REQUEST -> Triple("휴식 장소와 점심 장소를 찾고 있어요", "장소 선택은 정차 후 이어가요", PLACE)
            VehiclePage.REST_LIST, VehiclePage.LUNCH_LIST -> Triple(place.name, place.timing,
                DrivingRecommendations.forQuery(flow.query)?.narration ?: PLACE)
            VehiclePage.REST_DETAIL, VehiclePage.LUNCH_DETAIL -> Triple(place.name, place.reason, PLACE)
            VehiclePage.ITINERARY -> Triple(journey?.let { "${it.nextVisit} · ${it.nextVisitLabel}" } ?: "저장된 다음 일정",
                journey?.let { "${it.returnPlaceLabel} · ${it.returnDeadline}까지 복귀" } ?: "일정 자세히 보기는 정차 후 이어가요", SCHEDULE)
            VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW -> Triple(place.name, "정차 후 경로를 다시 확인하고 승인해 주세요", ROUTE)
            VehiclePage.NAV_PENDING -> Triple("${place.name} · 안내 결과 확인 중", "중복 요청 없이 결과를 기다려요", PENDING)
            VehiclePage.NAV_UNKNOWN -> Triple("${place.name} · 안내 결과 확인 필요", "반영 여부를 확인할 때까지 새 요청을 보내지 않아요", UNKNOWN)
            VehiclePage.NAV_FAILED -> Triple("${place.name} · 안내 실패", "기존 목적지를 유지해요", FAILED)
            VehiclePage.WAYPOINT_DONE, VehiclePage.DESTINATION_DONE -> Triple("${place.name} · 시연 반영 완료", "실제 순정 내비 변경과 구분되는 로컬 시연이에요", SUCCESS)
            VehiclePage.MC -> Triple("MC와 나누던 이야기", "${flow.mcPhase.let { if (it == "active") "참여 중" else "참여 상태 확인" }} · 정차 후 이어가요", CALL)
            VehiclePage.REVIEW -> Triple("오늘의 여행 기록", "기록과 캐릭터 꾸미기는 정차 후 이어가요", ENDING)
            VehiclePage.VOICE -> Triple("친구와의 음성 대화 시연", "마이크 연결 준비 중 · 자동 전송 없음", VOICE)
            VehiclePage.HOME -> return home(journey)
        }
        return DrivingContext("extra:${flow.page}", flow.page.pageTitle, headline, detail, narration, journey?.avatarId ?: "a-01")
    }

    fun content(page: String, state: ContentUiState, journey: Journey?, answer: String? = null,
        thread: ContentThread? = state.threads.lastOrNull()): DrivingContext {
        val title = when (page) {
            "intro" -> "친구 소개"; "list" -> "대화 고르기"; "profile", "answer" -> "상대 알아가기"
            "draft" -> "말 전하기"; "messages" -> "답장 확인"; "call" -> "통화"
            "rest" -> "잠깐 쉬기"; else -> "내 친구와 대화"
        }
        val headline = when (page) {
            "messages" -> when (thread?.status) {
                "replied" -> "답변을 전했어요 · ${thread.response.orEmpty()}"
                "received" -> thread.response ?: "친구의 답장이 도착했어요"
                "waiting" -> "친구의 답장을 기다리고 있어요"
                null -> "아직 주고받은 이야기가 없어요"
                else -> "마무리한 대화예요"
            }
            "answer" -> answer ?: "친구의 여행 취향을 알아가고 있어요"
            "call" -> when (state.call?.status) {
                "active" -> "${state.peerAlias ?: "친구"}님과 통화 중 · 시연"
                "requested" -> "상대의 통화 동의를 기다려요"
                "ended", "cancelled", "declined" -> "통화가 종료되었어요"
                else -> "정차 후 통화를 제안해요"
            }
            "draft" -> "친구에게 전할 말을 고르고 있어요"
            else -> "${state.peerAlias ?: "내 친구"}와 나누던 이야기"
        }
        val narration = when (page) { "messages" -> if (thread?.status in listOf("received", "replied")) thread?.response?.take(100) ?: REPLY else FRIEND; "answer" -> answer?.take(100) ?: FRIEND; "call" -> CALL; else -> FRIEND }
        return DrivingContext(if (page == "messages") "content:messages:${thread?.id.orEmpty()}" else "content:$page", title, headline.take(100),
            if (page == "messages") (thread?.followup ?: "답변 선택과 전송은 정차 후 이어가요").take(80)
            else "새 선택과 전송은 정차 후 같은 화면에서 이어가요", narration,
            if (page in listOf("intro", "answer", "messages", "call")) "b-01" else journey?.avatarId ?: "a-01",
            page == "call" && state.call?.status == "active")
    }
}
