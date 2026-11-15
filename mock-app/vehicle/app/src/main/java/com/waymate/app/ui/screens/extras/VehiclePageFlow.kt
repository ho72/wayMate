package com.waymate.app.ui.screens.extras

/** Page-only fixtures. No HTTP, navigation driver, microphone or relationship commands. */
enum class VehiclePage(val wf: String) {
    HOME(""), REQUEST("034"), REST_LIST("035"), REST_DETAIL("036"),
    WAYPOINT_REVIEW("037"), DESTINATION_REVIEW("038"), ITINERARY("039"),
    MC("042"), REVIEW("043"), LUNCH_LIST("044"), LUNCH_DETAIL("045"),
    NAV_PENDING("046"), WAYPOINT_DONE("047"), DESTINATION_DONE("048"),
    NAV_FAILED("049"), NAV_UNKNOWN("050"), VOICE("051");

    val pageTitle: String get() = when (this) {
        HOME -> "나만의 여행"
        REQUEST -> "장소 찾기"
        REST_LIST -> "휴식 장소"
        REST_DETAIL -> "휴식 장소 상세"
        WAYPOINT_REVIEW -> "경유지 확인"
        DESTINATION_REVIEW -> "목적지 확인"
        ITINERARY -> "내 일정"
        MC -> "MC와 대화"
        REVIEW -> "여행 기록"
        LUNCH_LIST -> "점심 추천"
        LUNCH_DETAIL -> "식사 장소 상세"
        NAV_PENDING -> "안내 요청 중"
        WAYPOINT_DONE -> "경유지 반영"
        DESTINATION_DONE -> "목적지 반영"
        NAV_FAILED -> "안내 실패"
        NAV_UNKNOWN -> "안내 확인 필요"
        VOICE -> "음성 대화 시연"
    }
}

enum class PreviewOutcome { SUCCESS, FAILED, UNKNOWN }
enum class PreviewOperation { ADD_WAYPOINT, SET_DESTINATION }
enum class PreviewStatus { IDLE, PENDING, SUCCESS, FAILED, UNKNOWN }

data class PreviewPlace(
    val id: String, val name: String, val address: String,
    val latitude: Double, val longitude: Double, val reason: String, val timing: String,
)

object VehiclePageFixtures {
    val rest = listOf(
        PreviewPlace("rest-1", "바다쉼터", "가상 해안로 10", 37.7901, 128.9201,
            "짧은 우회로 바다를 보며 쉬는 예시", "이동 4분 + 머묾 20분 + 복귀 4분 = 28분"),
        PreviewPlace("rest-2", "해변 벤치", "가상 해안로 20", 37.7902, 128.9202,
            "가볍게 앉아서 쉬는 예시", "이동 3분 + 머묾 20분 + 복귀 3분 = 26분"),
        PreviewPlace("rest-3", "해변카페", "가상 해안로 30", 37.7903, 128.9203,
            "짧게 차 한 잔 마시는 예시 · 주문 대기 별도 확인", "이동 5분 + 머묾 15분 + 복귀 5분 = 25분"),
    )
    val lunch = listOf(
        PreviewPlace("lunch-1", "바다한상", "가상 식사길 10", 37.7911, 128.9211,
            "여유롭게 한 끼 먹는 식사 후보", "이동 7분 · 식사 50분 예시 · 실제 대기 시간 미확인"),
        PreviewPlace("lunch-2", "솔숲식당", "가상 식사길 20", 37.7912, 128.9212,
            "차분하게 식사하는 후보", "이동 9분 · 식사 60분 예시 · 실제 대기 시간 미확인"),
        PreviewPlace("lunch-3", "작은국수집", "가상 식사길 30", 37.7913, 128.9213,
            "간단한 메뉴를 고르는 후보", "이동 6분 · 식사 40분 예시 · 실제 대기 시간 미확인"),
    )
    val schedule = PreviewPlace("schedule", "저장 일정 안내 예시", "가상 일정길 1", 37.7921, 128.9221,
        "저장 일정에서 안내 확인으로 이어지는 화면 예시", "계획 시각이며 실시간 도착 예상이 아니에요")
    fun place(id: String) = (rest + lunch + schedule).firstOrNull { it.id == id }
}

data class PreviewRequest(
    val id: Int, val query: String, val placeId: String, val origin: VehiclePage,
    val operation: PreviewOperation, val destination: String?, val outcome: PreviewOutcome,
)

data class VehiclePageFlow(
    val page: VehiclePage = VehiclePage.HOME,
    val query: String = "nearby30",
    val placeId: String = "rest-1",
    val origin: VehiclePage = VehiclePage.REST_DETAIL,
    val destination: String? = "기존 개인 방문지",
    val waypoint: String? = null,
    val outcome: PreviewOutcome = PreviewOutcome.SUCCESS,
    val status: PreviewStatus = PreviewStatus.IDLE,
    val sequence: Int = 0,
    val request: PreviewRequest? = null,
    val mcPhase: String = "review",
    val voicePhase: String = "ready",
    val voiceLine: Int = 0,
    val reviewFinished: Boolean = false,
    val reviewText: String = "조용히 바다를 보며 편하게 이야기했어요.",
    val decoratedAvatars: String = "",
) {
    val locked get() = status in listOf(PreviewStatus.PENDING, PreviewStatus.UNKNOWN)
    val place get() = VehiclePageFixtures.place(placeId) ?: VehiclePageFixtures.rest.first()
    fun home() = copy(page = VehiclePage.HOME, voicePhase = "ended", mcPhase = "review")
    fun open(next: VehiclePage): VehiclePageFlow = when {
        next == VehiclePage.REQUEST && locked -> copy(page = resultPage())
        else -> copy(page = next)
    }
    fun chooseQuery(lunch: Boolean) = if (locked) this else copy(
        page = if (lunch) VehiclePage.LUNCH_LIST else VehiclePage.REST_LIST,
        query = if (lunch) "lunch" else "nearby30",
    )
    fun select(id: String): VehiclePageFlow {
        val candidates = if (query == "lunch") VehiclePageFixtures.lunch else VehiclePageFixtures.rest
        if (locked || candidates.none { it.id == id }) return this
        val detail = if (query == "lunch") VehiclePage.LUNCH_DETAIL else VehiclePage.REST_DETAIL
        return copy(page = detail, placeId = id, origin = detail)
    }
    fun reviewSchedule() = if (locked) copy(page = VehiclePage.ITINERARY) else copy(
        page = VehiclePage.ITINERARY, query = "itinerary", placeId = "schedule", origin = VehiclePage.ITINERARY,
    )
    fun reviewRoute(): VehiclePageFlow = if (locked) copy(page = resultPage()) else copy(
        page = if (destination == null) VehiclePage.DESTINATION_REVIEW else VehiclePage.WAYPOINT_REVIEW,
    )
    fun approve(): VehiclePageFlow {
        if (locked || page !in listOf(VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW)) return this
        // The page was based on the current fixture route. Never replace an existing destination.
        if ((page == VehiclePage.DESTINATION_REVIEW) != (destination == null)) return reviewRoute()
        val next = PreviewRequest(sequence + 1, query, placeId, origin,
            if (destination == null) PreviewOperation.SET_DESTINATION else PreviewOperation.ADD_WAYPOINT,
            destination, outcome)
        return copy(page = VehiclePage.NAV_PENDING, sequence = next.id, request = next, status = PreviewStatus.PENDING)
    }
    fun complete(id: Int, result: PreviewOutcome): VehiclePageFlow {
        val pending = request ?: return this
        if (pending.id != id || status !in listOf(PreviewStatus.PENDING, PreviewStatus.UNKNOWN)) return this
        if (destination != pending.destination) return copy(page = VehiclePage.NAV_UNKNOWN, status = PreviewStatus.UNKNOWN)
        val nextStatus = when (result) {
            PreviewOutcome.SUCCESS -> PreviewStatus.SUCCESS
            PreviewOutcome.FAILED -> PreviewStatus.FAILED
            PreviewOutcome.UNKNOWN -> PreviewStatus.UNKNOWN
        }
        val updated = copy(status = nextStatus,
            destination = if (result == PreviewOutcome.SUCCESS && pending.operation == PreviewOperation.SET_DESTINATION)
                pending.placeId else destination,
            waypoint = if (result == PreviewOutcome.SUCCESS && pending.operation == PreviewOperation.ADD_WAYPOINT)
                pending.placeId else waypoint)
        return updated.copy(page = updated.resultPage())
    }
    fun resultPage() = when (status) {
        PreviewStatus.PENDING -> VehiclePage.NAV_PENDING
        PreviewStatus.UNKNOWN -> VehiclePage.NAV_UNKNOWN
        PreviewStatus.FAILED -> VehiclePage.NAV_FAILED
        else -> if (request?.operation == PreviewOperation.SET_DESTINATION) VehiclePage.DESTINATION_DONE else VehiclePage.WAYPOINT_DONE
    }
    fun retryReview() = if (status == PreviewStatus.FAILED) copy(page = request?.origin ?: origin) else this
    fun back() = when (page) {
        VehiclePage.REST_LIST, VehiclePage.LUNCH_LIST -> copy(page = VehiclePage.REQUEST)
        VehiclePage.REST_DETAIL -> copy(page = VehiclePage.REST_LIST)
        VehiclePage.LUNCH_DETAIL -> copy(page = VehiclePage.LUNCH_LIST)
        VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW -> copy(page = origin)
        VehiclePage.NAV_PENDING -> this // A pending request cannot be cancelled from this page.
        else -> home()
    }
    fun unavailable(): VehiclePageFlow = copy(
        page = if (page in listOf(VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW)) origin else VehiclePage.HOME,
        status = if (status == PreviewStatus.PENDING) PreviewStatus.UNKNOWN else status,
        voicePhase = if (voicePhase == "talking") "paused" else voicePhase,
        mcPhase = "review",
    )
    fun applyDecoration(avatar: String): VehiclePageFlow {
        if (!reviewFinished || avatar in decoratedAvatars.split('|')) return this
        return copy(decoratedAvatars = (decoratedAvatars.split('|').filter { it.isNotEmpty() } + avatar).joinToString("|"))
    }

    /** Primitive saveable state also keeps unresolved preview requests locked after recreation. */
    fun save(): List<String> = listOf(page.name, query, placeId, origin.name, destination.orEmpty(), waypoint.orEmpty(),
        outcome.name, status.name, sequence.toString(), request?.id?.toString().orEmpty(), request?.query.orEmpty(),
        request?.placeId.orEmpty(), request?.origin?.name.orEmpty(), request?.operation?.name.orEmpty(),
        request?.destination.orEmpty(), request?.outcome?.name.orEmpty(), mcPhase, voicePhase, voiceLine.toString(),
        reviewFinished.toString(), reviewText, decoratedAvatars)
    companion object {
        fun restore(v: List<String>): VehiclePageFlow = runCatching {
            VehiclePageFlow(VehiclePage.valueOf(v[0]), v[1], v[2], VehiclePage.valueOf(v[3]), v[4].ifEmpty { null },
                v[5].ifEmpty { null }, PreviewOutcome.valueOf(v[6]), PreviewStatus.valueOf(v[7]), v[8].toInt(),
                if (v[9].isEmpty()) null else PreviewRequest(v[9].toInt(), v[10], v[11], VehiclePage.valueOf(v[12]),
                    PreviewOperation.valueOf(v[13]), v[14].ifEmpty { null }, PreviewOutcome.valueOf(v[15])),
                v[16], v[17], v[18].toInt(), v[19].toBoolean(), v[20], v[21])
        }.map { restored ->
            // Restoring UI never replays a previously approved preview or resumes a dialogue.
            restored.copy(
                page = if (restored.status == PreviewStatus.PENDING) VehiclePage.NAV_UNKNOWN else restored.page,
                status = if (restored.status == PreviewStatus.PENDING) PreviewStatus.UNKNOWN else restored.status,
                voicePhase = if (restored.voicePhase == "talking") "paused" else restored.voicePhase,
                mcPhase = "review",
            )
        }.getOrElse { VehiclePageFlow() }
    }
}
