package com.waymate.app.ui.screens.extras

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.LocalAgentNarrator
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.model.Journey
import com.waymate.app.ui.components.*
import com.waymate.app.ui.screens.handoff.JourneySchedule
import com.waymate.app.ui.screens.handoff.CompanionActionGrid
import com.waymate.app.ui.screens.handoff.CompanionActionItem
import com.waymate.app.ui.screens.handoff.CompanionScene
import com.waymate.app.ui.screens.handoff.CompanionInfoCard
import com.waymate.app.ui.screens.handoff.ScheduleEvent
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Ink
import com.waymate.app.ui.theme.Muted
import com.waymate.app.ui.theme.SkyLine
import kotlinx.coroutines.delay
import com.waymate.app.platform.dialogue.LocalScenarioDialogue

/** All E/O pages are deliberately presentation-only until their execution contracts exist. */
@Composable
fun VehicleExtraScreen(
    flow: VehiclePageFlow, journey: Journey?, enabled: Boolean,
    onChange: (VehiclePageFlow) -> Unit, onHome: () -> Unit,
    onReturnToCall: () -> Unit, onEndCall: () -> Unit, onReturnToEnding: () -> Unit,
    onOpenIndex: (() -> Unit)? = null,
    autoAdvance: Boolean = true,
    onSpeak: ((String) -> Unit)? = null,
) {
    val script = LocalScenarioDialogue.current
    val narrator = LocalAgentNarrator.current
    val speech = LocalAgentSpeech.current
    var promptOffered by rememberSaveable(flow.page) { mutableStateOf(false) }
    LaunchedEffect(flow.page) {
        if (flow.page == VehiclePage.REQUEST && !promptOffered) {
            promptOffered = true
            if (enabled) narrator?.invoke(AgentNarration(
                script.line("places.opening", "남는 시간에 맞춰 잠깐 쉬거나 점심 먹을 곳을 같이 골라보자."),
                journey?.avatarId ?: "a-01", automatic = true))
        }
    }
    val pending = flow.request
    LaunchedEffect(flow.page, pending?.id, enabled, autoAdvance) {
        if (autoAdvance && flow.page == VehiclePage.NAV_PENDING && flow.status == PreviewStatus.PENDING && enabled && pending != null) {
            delay(1200)
            onChange(flow.complete(pending.id, pending.outcome))
        }
    }
    fun back() {
        when (flow.page) {
            VehiclePage.MC -> onReturnToCall()
            VehiclePage.REVIEW -> onReturnToEnding()
            else -> onChange(flow.back())
        }
    }
    BackHandler { back() }
    if (flow.page == VehiclePage.REQUEST) {
        VehicleBackground(pageTag = flow.page.pageTitle) {
            Box(Modifier.fillMaxSize().testTag("wf-${flow.page.wf}")) {
                CompanionScene(
                    avatarId = journey?.avatarId ?: "a-01",
                    bubble = "어디서 쉬어갈까요?",
                    title = "내 친구에게 장소를 물어보기",
                    motionEnabled = enabled,
                    onBack = { back() },
                    card = {
                        CompanionInfoCard {
                            Text(script.line("places.opening", "남는 시간에 맞춰 잠깐 쉬거나 점심 먹을 곳을 같이 골라보자."),
                                style = MaterialTheme.typography.titleLarge)
                            if (!enabled) Text("정차 상태를 확인한 뒤 이어가요.")
                        }
                    },
                    actions = {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            VehicleAction("30분 쉴 곳 물어보기", { onChange(flow.chooseQuery(false)) },
                                Modifier.weight(1f), enabled = enabled && !flow.locked)
                            VehicleAction("점심 장소 물어보기", { onChange(flow.chooseQuery(true)) },
                                Modifier.weight(1f), enabled = enabled && !flow.locked, secondary = true)
                        }
                    },
                )
            }
        }
        return
    }
    if (flow.page in listOf(VehiclePage.REST_LIST, VehiclePage.LUNCH_LIST)) {
        val lunch = flow.page == VehiclePage.LUNCH_LIST
        val places = if (lunch) VehiclePageFixtures.lunch else VehiclePageFixtures.rest
        VehicleBackground(pageTag = flow.page.pageTitle) {
            Box(Modifier.fillMaxSize().testTag("wf-${flow.page.wf}")) {
                CompanionScene(
                    avatarId = journey?.avatarId ?: "a-01",
                    bubble = "이 중에 어디가 좋을까요?",
                    title = if (lunch) "점심 먹을 곳을 골라볼까요?" else "30분 안에 쉬었다 갈 곳",
                    motionEnabled = enabled,
                    onBack = { back() },
                    card = {
                        CompanionInfoCard {
                            if (!enabled) Text("정차 상태를 확인한 뒤 이어가요.")
                            Column(Modifier.fillMaxWidth()) {
                                places.forEachIndexed { index, place ->
                                    PlaceRecommendationRow(place, index + 1, enabled && !flow.locked) {
                                        onChange(flow.select(place.id))
                                    }
                                    if (index < places.lastIndex) HorizontalDivider(color = SkyLine.copy(alpha = .55f))
                                }
                            }
                        }
                    },
                    actions = {},
                )
            }
        }
        return
    }
    if (flow.page in listOf(VehiclePage.REST_DETAIL, VehiclePage.LUNCH_DETAIL)) {
        val lunch = flow.page == VehiclePage.LUNCH_DETAIL
        VehicleBackground(pageTag = flow.page.pageTitle) {
            Box(Modifier.fillMaxSize().testTag("wf-${flow.page.wf}")) {
                CompanionScene(
                    avatarId = journey?.avatarId ?: "a-01",
                    bubble = if (lunch) "여기서 점심 먹어볼까요?" else "여기서 잠깐 쉬어갈까요?",
                    title = "${flow.place.name} · 가상", pinActions = true,
                    motionEnabled = enabled,
                    onBack = { back() },
                    card = {
                        CompanionInfoCard {
                            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                Text(script.line("place.${flow.place.id}", flow.place.reason), fontSize = 28.sp, lineHeight = 38.sp,
                                    fontWeight = FontWeight.SemiBold, color = Ink)
                                Text(flow.place.timing, fontSize = 26.sp, lineHeight = 36.sp, color = Ink)
                                Text(flow.place.address, fontSize = 24.sp, lineHeight = 34.sp, color = Muted)
                                HorizontalDivider(color = SkyLine.copy(alpha = .55f))
                                Text(journey?.let {
                                    "다음 일정 ${it.nextVisit} · ${it.nextVisitLabel}\n${it.returnPlaceLabel} ${it.returnEstimate} 도착 예상 · ${it.returnDeadline}까지 복귀"
                                } ?: "저장된 일정이 없어요.", fontSize = 24.sp, lineHeight = 34.sp, color = Muted)
                                if (!enabled) Text("정차 상태를 확인한 뒤 이어가요.")
                            }
                        }
                    },
                    actions = {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            VehicleAction(if (flow.locked) "안내 결과 확인" else "이곳으로 안내 확인",
                                { onChange(flow.reviewRoute()) }, Modifier.weight(1f), enabled = enabled)
                            VehicleAction(if (lunch) "다른 식사 장소 보기" else "다른 장소 보기", { back() },
                                Modifier.weight(1f), enabled = enabled, secondary = true)
                        }
                    },
                )
            }
        }
        return
    }
    val title = when (flow.page) {
        VehiclePage.WAYPOINT_REVIEW -> "기존 목적지를 유지하고 들를까요?"
        VehiclePage.DESTINATION_REVIEW -> "새 목적지로 안내할까요?"
        VehiclePage.ITINERARY -> "저장된 일정과 순정 내비"
        VehiclePage.NAV_PENDING -> "개인 안내 요청 중"
        VehiclePage.WAYPOINT_DONE -> "개인 경유지를 반영했어요"
        VehiclePage.DESTINATION_DONE -> "새 목적지를 반영했어요"
        VehiclePage.NAV_FAILED -> "안내를 반영하지 못했어요"
        VehiclePage.NAV_UNKNOWN -> "안내 결과를 확인하고 있어요"
        VehiclePage.MC -> "함께 이야기 나누는 MC"
        VehiclePage.REVIEW -> "오늘의 여행을 남겨볼까요?"
        VehiclePage.VOICE -> "상대 캐릭터와 대화하기"
        else -> flow.page.pageTitle
    }
    val pageActions = buildList<CompanionActionItem> {
        if (flow.page == VehiclePage.VOICE && flow.voicePhase == "talking" && flow.voiceLine % 3 != 1 && onSpeak != null) {
            val voiceKey = if (flow.voiceLine % 3 == 0) "peer.voice0" else "peer.voice1"
            add(CompanionActionItem("친구의 말 듣기", { val text = script.line(voiceKey, "편하게 여행 이야기를 나눠볼까요?")
                narrator?.invoke(AgentNarration(text, "b-01")) ?: onSpeak(text) }, enabled))
        }
        if (enabled) when (flow.page) {
            VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW -> {
                add(CompanionActionItem(if (flow.page == VehiclePage.WAYPOINT_REVIEW) "경유지 추가 승인" else "목적지 설정 승인", { onChange(flow.approve()) }))
                add(CompanionActionItem("아직 변경하지 않기", { back() }, secondary = true))
            }
            VehiclePage.ITINERARY -> {
                if (journey != null && flow.destination != "schedule") add(CompanionActionItem("이 일정으로 안내 확인", { onChange(flow.reviewSchedule().reviewRoute()) }, !flow.locked))
                if (flow.locked) add(CompanionActionItem("미확인 안내 상태 보기", { onChange(flow.copy(page = flow.resultPage())) }, secondary = true))
            }
            VehiclePage.NAV_PENDING -> Unit
            VehiclePage.WAYPOINT_DONE, VehiclePage.DESTINATION_DONE -> {
                add(CompanionActionItem("내 친구와 계속하기", onHome))
                add(CompanionActionItem("내 일정 확인", { onChange(flow.copy(page = VehiclePage.ITINERARY)) }, secondary = true))
            }
            VehiclePage.NAV_FAILED -> add(CompanionActionItem("장소와 경로 다시 확인", { onChange(flow.retryReview()) }))
            VehiclePage.NAV_UNKNOWN -> {
                add(CompanionActionItem("현재 내비 다시 확인", { onChange(flow.complete(flow.request?.id ?: -1, PreviewOutcome.UNKNOWN)) }))
            }
            VehiclePage.MC -> {
                when (flow.mcPhase) {
                    "review" -> add(CompanionActionItem("MC 참여 제안", { onChange(flow.copy(mcPhase = "waiting")) }))
                    "waiting" -> {
                        add(CompanionActionItem("MC 제안 취소", { onChange(flow.copy(mcPhase = "review")) }, secondary = true, quiet = true))
                    }
                    "active" -> add(CompanionActionItem("MC 참여 중단", { onChange(flow.copy(mcPhase = "review")) }, secondary = true, quiet = true))
                }
                add(CompanionActionItem("MC 없이 일반 통화", onReturnToCall, secondary = true))
                add(CompanionActionItem("통화 종료", onEndCall, secondary = true, quiet = true))
            }
            VehiclePage.REVIEW -> {
                val applied = (journey?.avatarId ?: "a-01") in flow.decoratedAvatars.split('|')
                if (!flow.reviewFinished) add(CompanionActionItem("여행 종료 후 장면 보기", { onChange(flow.copy(reviewFinished = true)) }))
                else add(CompanionActionItem(if (applied) "이 외형에 반영했어요" else "내 캐릭터에 반영하기", { onChange(flow.applyDecoration(journey?.avatarId ?: "a-01")) }, !applied))
                add(CompanionActionItem("건너뛰기", onReturnToEnding, secondary = true))
            }
            VehiclePage.VOICE -> {
                when (flow.voicePhase) {
                    "ready", "ended" -> add(CompanionActionItem("자막으로 대화 시작", { onChange(flow.copy(voicePhase = "talking", voiceLine = 0)) }))
                    "paused" -> add(CompanionActionItem("직접 대화 이어가기", { onChange(flow.copy(voicePhase = "talking")) }))
                    else -> {
                        add(CompanionActionItem("다음 대사 보기", { onChange(flow.copy(voiceLine = flow.voiceLine + 1)) }))
                        add(CompanionActionItem("잠깐 쉬자", { onChange(flow.copy(voicePhase = "paused")) }, secondary = true))
                    }
                }
                if (flow.voicePhase != "ended") add(CompanionActionItem("대화 그만", { onChange(flow.copy(voicePhase = "ended")) }, secondary = true))
            }
            else -> Unit
        }
    }
    VehicleBackground(pageTag = flow.page.pageTitle) {
        Box(Modifier.fillMaxSize().testTag("wf-${flow.page.wf}")) {
            CompanionScene(
                avatarId = if (flow.page == VehiclePage.VOICE) "b-01" else journey?.avatarId ?: "a-01",
                bubble = when (flow.page) {
                    VehiclePage.ITINERARY -> "다음 일정도 기억하고 있어요"
                    VehiclePage.MC -> "두 분이 원할 때 함께해요"
                    VehiclePage.REVIEW -> "어떤 순간이 기억에 남아요?"
                    VehiclePage.NAV_FAILED, VehiclePage.NAV_UNKNOWN -> "결과를 함께 확인해요"
                    VehiclePage.NAV_PENDING -> "같은 요청은 한 번만 보내요"
                    VehiclePage.VOICE -> "자막으로 이야기를 이어가요"
                    else -> "경로를 먼저 확인해 주세요"
                },
                title = title, motionEnabled = enabled, pinActions = true,
                voicePresentation = when {
                    flow.page == VehiclePage.VOICE -> when {
                        flow.voicePhase == "paused" -> AgentVoicePresentation(AgentVoicePhase.PAUSED)
                        flow.voicePhase == "ended" -> AgentVoicePresentation(AgentVoicePhase.IDLE, labelOverride = "대화를 마쳤어요")
                        speech.phase in listOf("speaking", "preparing", "interrupted", "unavailable") -> AgentVoicePresentation.playback(speech)
                        else -> AgentVoicePresentation(AgentVoicePhase.IDLE, labelOverride = if (flow.voicePhase == "talking" && flow.voiceLine % 3 == 1) "내 답변 자막을 확인해요" else "친구의 말을 들어볼까요?")
                    }
                    flow.page == VehiclePage.MC && flow.mcPhase == "active" ->
                        AgentVoicePresentation(AgentVoicePhase.IDLE, simulated = true, labelOverride = "MC 자막을 확인해요")
                    else -> null
                },
                onBack = if (flow.page == VehiclePage.NAV_PENDING) null else ({ back() }),
                card = {
                    CompanionInfoCard {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (!enabled) Text("정차 상태를 확인한 뒤 이어가요.")
                            when (flow.page) {
                                VehiclePage.WAYPOINT_REVIEW, VehiclePage.DESTINATION_REVIEW -> {
                                    Text("${flow.place.name} · 가상", style = MaterialTheme.typography.titleLarge)
                                    Text(script.line("place.${flow.place.id}", flow.place.reason))
                                    Text(flow.place.timing)
                                    HorizontalDivider(color = SkyLine.copy(alpha = .55f))
                                    Text("현재 경로 · ${routeLabel(flow.destination)}")
                                    Text(if (flow.page == VehiclePage.WAYPOINT_REVIEW)
                                        "변경 후 · 현재 위치 → ${flow.place.name} → ${destinationName(flow.destination)}\n원래 목적지는 유지해요."
                                        else "변경 후 · 현재 위치 → ${flow.place.name}\n기존 목적지 없이 새 목적지로 설정해요.")
                                    Text("가상 장소·모의 경로예요. 실제 내비에 전송하지 않아요.", color = Muted)
                                }
                                VehiclePage.ITINERARY -> {
                                    JourneySchedule(journey)
                                    if (journey == null) Text("모바일에서 준비한 본인 여행을 불러와 주세요.")
                                    else {
                                        Text(if (flow.destination == "schedule") "현재 목적지와 같아요 · 그대로 유지해요."
                                            else "저장한 계획 · 모의 안내 미리보기예요.", style = MaterialTheme.typography.bodySmall, color = Muted)
                                    }
                                }
                                VehiclePage.NAV_PENDING, VehiclePage.WAYPOINT_DONE, VehiclePage.DESTINATION_DONE,
                                VehiclePage.NAV_FAILED, VehiclePage.NAV_UNKNOWN -> {
                                    RequestDetails(flow)
                                    Surface(color = Forest.copy(alpha = .09f), shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp)) {
                                        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                            Text(when (flow.page) {
                                                VehiclePage.NAV_PENDING -> "모의 반영 결과를 기다리고 있어요"
                                                VehiclePage.WAYPOINT_DONE -> "경유지 반영 확인 · 모의"
                                                VehiclePage.DESTINATION_DONE -> "새 목적지 반영 확인 · 모의"
                                                VehiclePage.NAV_FAILED -> "이 요청은 반영되지 않았어요 · 모의"
                                                else -> "결과 확인 전에는 새 안내를 보내지 않아요"
                                            }, style = MaterialTheme.typography.titleLarge, color = Forest)
                                            if (flow.page == VehiclePage.NAV_PENDING) LinearProgressIndicator(Modifier.fillMaxWidth().height(6.dp))
                                        }
                                    }
                                    if (flow.page == VehiclePage.NAV_UNKNOWN) Text("홈으로 돌아가도 새 요청 잠금은 유지돼요.", style = MaterialTheme.typography.bodySmall)

                                }
                                VehiclePage.MC -> {
                                    Text("일반 통화와 MC 참여는 각각 동의해요. 실제 다자 통화 없이 자막으로 미리 봐요.")
                                    Text(when (flow.mcPhase) {
                                        "review" -> "두 분이 괜찮다면 이야기 주제를 하나 꺼내볼게요."
                                        "waiting" -> "나는 MC 참여에 동의했어요. 상대의 별도 동의를 기다려요. · 시연"
                                        "active" -> "양쪽 MC 참여 동의 · 시연\nMC: ${script.line("mc.question", "오늘 가장 기억에 남은 풍경은 무엇인가요?")}\nA: 조용히 걸었던 바다가 좋았어요.\nB: 저도요. 다음 풍경도 천천히 보고 싶어요."
                                        else -> "MC 참여는 건너뛰어요. 일반 통화 동의는 유지해요."
                                    }, style = MaterialTheme.typography.titleLarge)
                                }
                                VehiclePage.REVIEW -> {
                                    if (!flow.reviewFinished) Text("개인 일정과 숙소 복귀를 마친 뒤 남기는 기록이에요. 실제 도착을 판정하지 않아요.")
                                    else {
                                        Text("오늘 남기고 싶은 순간을 적어 주세요.", style = MaterialTheme.typography.titleLarge)
                                        OutlinedTextField(value = flow.reviewText,
                                            onValueChange = { onChange(flow.copy(reviewText = it.take(500))) },
                                            enabled = enabled, textStyle = MaterialTheme.typography.titleLarge,
                                            label = { Text("나의 여행 기록 · 시연") }, minLines = 3,
                                            modifier = Modifier.fillMaxWidth())
                                        val applied = (journey?.avatarId ?: "a-01") in flow.decoratedAvatars.split('|')
                                        Text(if (applied) "바다 산책 장식 · 반영 후 미리보기" else "바다 산책 장식 · 반영 전 미리보기")
                                        Text("이번 시연 화면에만 남겨요. 프로필 외형·장기 기억·상대 평가는 바꾸지 않아요.", color = Muted)
                                    }
                                }
                                VehiclePage.VOICE -> {
                                    Text("정차에서 보는 자막 시연 · 마이크가 열려 있지 않아요.", color = Muted)
                                    Text(when (flow.voicePhase) {
                                        "ready" -> "상대 캐릭터와 대화를 시작할까요?"
                                        "ended" -> "대화를 마쳤어요. 자동으로 다시 시작하지 않아요."
                                        "paused" -> "대화를 잠깐 쉬어요. 연결과 약속은 유지해요."
                                        else -> listOf("상대 캐릭터: " + script.line("peer.voice0", "바다를 보며 천천히 걷는 여행을 좋아해요."),
                                            "나: 조용히 걷는 여행이 좋겠네요.", "상대 캐릭터: " + script.line("peer.voice1", "쉬고 싶을 땐 편하게 말해 주세요."))[flow.voiceLine % 3]
                                    }, style = MaterialTheme.typography.titleLarge)
                                }
                                else -> Unit
                            }
                        }
                    }
                },
                actions = {
                    CompanionActionGrid(pageActions.filterNot { it.quiet })
                },
                supporting = { CompanionActionGrid(pageActions.filter { it.quiet }) },

            )
        }
    }
}

@Composable
private fun PlaceRecommendationRow(place: PreviewPlace, number: Int, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 96.dp).testTag("place-${place.id}")
        .clickable(enabled = enabled, role = Role.Button, onClickLabel = "${place.name} 자세히 보기", onClick = onClick)
        .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("$number. ${place.name} · 가상", fontSize = 28.sp, lineHeight = 38.sp,
                fontWeight = FontWeight.SemiBold, color = Ink)
            Text(place.timing, fontSize = 24.sp, lineHeight = 34.sp, color = Muted)
        }
        Text("자세히 ›", fontSize = 22.sp, lineHeight = 30.sp, color = if (enabled) Forest else Muted)
    }
}

private fun queryLabel(query: String) = when (query) { "lunch" -> "점심 장소"; "itinerary" -> "저장 일정"; else -> "30분 휴식" }
private fun destinationName(id: String?) = VehiclePageFixtures.place(id.orEmpty())?.name ?: id ?: "목적지 없음"
private fun routeLabel(destination: String?) = if (destination == null) "목적지 없음" else "현재 위치 → ${destinationName(destination)}"

@Composable private fun RequestDetails(flow: VehiclePageFlow) {
    val request = flow.request ?: return
    val place = VehiclePageFixtures.place(request.placeId) ?: flow.place
    Text("${place.name} · 가상", fontSize = 32.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold, color = Ink)
    Text(place.timing, style = MaterialTheme.typography.titleMedium)
    HorizontalDivider(color = SkyLine)
    if (request.operation == PreviewOperation.ADD_WAYPOINT) {
        Text("최종 목적지 유지", style = MaterialTheme.typography.bodySmall, color = Muted)
        Text(destinationName(request.destination), style = MaterialTheme.typography.titleLarge)
    } else Text("선택한 장소를 새 목적지로 설정해요.", style = MaterialTheme.typography.bodyMedium)
}
