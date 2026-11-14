package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.ui.components.*
import androidx.compose.ui.text.style.TextAlign
import com.waymate.app.ui.theme.*

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HandoffScreen(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
    onOpenNavigation: () -> Unit,
    onOpenMeeting: () -> Unit,
    onSocialAction: (String, String) -> Unit,
    onOpenContent: () -> Unit,
    onOpenEnding: () -> Unit,
) {
    var socialReview by remember { mutableStateOf<Pair<String, String>?>(null) }
    var confirmStart by remember { mutableStateOf(false) }
    var startPreview by remember { mutableStateOf<com.waymate.app.model.Journey?>(null) }
    val journey = state.journey
    var showPlan by remember { mutableStateOf(false) }
    var showManage by remember { mutableStateOf(false) }
    VehicleBackground {
        BoxWithConstraints {
            val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
            Column(Modifier.fillMaxSize()) {
                VehicleHeader(if (journey == null) "여행 준비" else if (state.social.peerAlias != null) "여행 친구와 연결됨" else "나만의 여행")
                val scroll = rememberScrollState()
                Column(Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = 32.dp, vertical = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    if (wide) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                        CharacterPanel(state, Modifier.weight(1f), true)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                            HomeJourneySummary(state)
                            HomeActions(state, onLoadJourney, { startPreview = state.preparation; confirmStart = true },
                                onOpenContent, onOpenMeeting, onOpenNavigation)
                        }
                    } else {
                        CharacterPanel(state, Modifier.fillMaxWidth())
                        HomeJourneySummary(state)
                        HomeActions(state, onLoadJourney, { startPreview = state.preparation; confirmStart = true },
                            onOpenContent, onOpenMeeting, onOpenNavigation)
                    }
                    if (journey != null) {
                        TextButton(onClick = { showPlan = !showPlan }) { Text(if (showPlan) "일정 접기" else "내 일정 자세히 보기") }
                        if (showPlan) JourneyPanel(state, onLoadJourney, {}, Modifier.fillMaxWidth())
                        TextButton(onClick = { showManage = !showManage }) { Text(if (showManage) "여행 관리 접기" else "여행 관리") }
                        if (showManage) FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (state.ending.phase in listOf("travel", "meeting", "pending", "together", "my_agent", "cancelled", "early_end"))
                                VehicleOutlineButton(onClick = onOpenEnding) { Text("만남·여행 선택 다시 보기") }
                            state.social.actions["CONNECT_END"]?.let { binding ->
                                TextButton(onClick = { socialReview = "CONNECT_END" to binding }) { Text("연결 종료") }
                            }
                            state.social.actions["PROFILE_PRIVATE"]?.let { binding ->
                                TextButton(onClick = { socialReview = "PROFILE_PRIVATE" to binding }) { Text("소개 공개 철회") }
                            }
                        }
                    }
                    state.notice?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
    socialReview?.let { (type, binding) ->
        AlertDialog(
            onDismissRequest = { socialReview = null },
            title = { Text(if (type == "CONNECT_END") "연결을 종료할까요?" else "소개 공개를 철회할까요?") },
            text = { Text("상대 기능을 닫고 내 친구와 본인 여행을 유지해요. 추가한 경유지가 있으면 따로 확인해요.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        socialReview = null
                        onSocialAction(type, binding)
                    }
                ) {
                    Text("확인")
                }
            },
            dismissButton = { TextButton(onClick = { socialReview = null }) { Text("돌아가기") } },
        )
    }
    if (confirmStart)
        AlertDialog(
            onDismissRequest = { confirmStart = false },
            title = { Text(stringResource(R.string.home_start_title)) },
            text = {
                Text(
                    startPreview?.let {
                        stringResource(
                            R.string.home_review_plan,
                            it.alias,
                            it.date,
                            it.nextVisit,
                            it.nextVisitLabel,
                            it.returnPlaceLabel,
                            it.returnDeadline,
                        )
                    } ?: stringResource(R.string.home_default_plan)
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmStart = false
                        onStartTrip(startPreview)
                    },
                    enabled = state.startEnabled && !state.isLoading,
                ) {
                    Text(stringResource(R.string.home_confirm_start))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmStart = false }) {
                    Text(stringResource(R.string.home_back))
                }
            },
        )
}

@Composable
private fun CharacterPanel(state: HandoffUiState, modifier: Modifier, wide: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (state.journey == null) "MOBILE FIRST" else "MY TRAVEL MATE", color = Muted,
            style = MaterialTheme.typography.labelMedium)
        SpeechBubble(if (state.journey == null) "여행 전에, 우리 조금 알아갈까?" else "오늘도 좋은 길이네요!")
        AgentCharacter(state.journey?.avatarId ?: state.preparation?.avatarId ?: "a-01",
            Modifier.fillMaxWidth().height(if (state.journey == null) 340.dp else 460.dp),
            motionEnabled = state.loadEnabled || state.startEnabled || (state.journey != null && !state.content.blocked))
        Text(if (state.journey == null) "먼저 모바일에서 준비해요" else "우리, 어디까지 왔을까?",
            style = MaterialTheme.typography.headlineLarge, color = Ink, textAlign = TextAlign.Center)
        Text(if (state.journey == null) "내 친구와 이야기하고 여행 계획을 저장해 주세요." else "나만의 페이스로 여행을 이어가요.",
            color = Muted, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
    }
}

@Composable
private fun HomeJourneySummary(state: HandoffUiState) {
    val journey = state.journey
    VehicleInfoCard(Modifier.fillMaxWidth()) {
        Text(if (journey == null) "차량에서도, 대화를 이어서" else "다음 일정", color = Muted, style = MaterialTheme.typography.bodySmall)
        Text(journey?.let { "${it.nextVisit} · ${it.nextVisitLabel}" } ?: "모바일에서 준비한 나의 여행",
            style = MaterialTheme.typography.titleLarge, color = Ink)
        Text(journey?.let { "${it.returnPlaceLabel} · ${it.returnDeadline}까지 복귀" }
            ?: "저장한 소개와 여행 계획은 직접 불러올 때 연결돼요.", color = Muted)
    }
}

@Composable
private fun HomeActions(state: HandoffUiState, onLoad: () -> Unit, onStart: () -> Unit,
                        onContent: () -> Unit, onMeeting: () -> Unit, onNavigation: () -> Unit) {
    if (state.journey == null) {
        VehicleAction(if (state.retryPending) stringResource(R.string.home_retry) else stringResource(R.string.home_load),
            onLoad, Modifier.fillMaxWidth(), enabled = state.loadEnabled && !state.isLoading)
        VehicleAction(if (state.preparation != null) stringResource(R.string.home_start_stored) else stringResource(R.string.home_start_default),
            onStart, Modifier.fillMaxWidth(), enabled = state.startEnabled && !state.isLoading, secondary = true)
    } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            VehicleAction(if (state.content.peerAlias != null) {
                if (state.content.threads.any { it.unread }) "새 답장 · 대화 고르기" else "대화 고르기"
            } else "내 친구와 이야기하기", onContent, Modifier.weight(1f))
            val meeting = state.social.peerAlias != null || state.social.meetingStatus != "none"
            VehicleAction(if (state.social.cleanupRequired) "내비 경유지 확인 필요" else if (meeting) {
                if (state.social.meetingStatus == "none") "만남 제안 받기" else "만남 상태 확인"
            } else "내 여행 경유지", if (meeting) onMeeting else onNavigation, Modifier.weight(1f), secondary = true)
        }
    }
}

@Composable
private fun JourneyPanel(
    state: HandoffUiState,
    onLoad: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier,
) {
    Surface(modifier, shape = RoundedCornerShape(28.dp), color = Color.White) {
        Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            val j = state.journey
            Text(
                if (j == null) stringResource(R.string.home_start_trip)
                else stringResource(R.string.home_today_trip),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Ink,
            )
            if (j == null) {
                Text(
                    state.preparation?.let {
                        stringResource(
                            R.string.home_stored_preview,
                            it.alias,
                            it.date,
                            it.nextVisitLabel,
                        )
                    } ?: stringResource(R.string.home_web_help),
                    color = Muted,
                    fontSize = 18.sp,
                    lineHeight = 28.sp,
                )
                VehicleButton(
                    onClick = onLoad,
                    enabled = state.loadEnabled && !state.isLoading,
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                ) {
                    Text(
                        if (state.retryPending) stringResource(R.string.home_retry)
                        else stringResource(R.string.home_load),
                        fontSize = 18.sp,
                    )
                }
                VehicleOutlineButton(
                    onClick = onStart,
                    enabled = state.startEnabled && !state.isLoading,
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                ) {
                    Text(
                        if (state.preparation != null) stringResource(R.string.home_start_stored)
                        else stringResource(R.string.home_start_default),
                        fontSize = 18.sp,
                    )
                }
            } else {
                Text(j.date, color = Forest, fontSize = 18.sp)
                Text(
                    stringResource(R.string.home_next_visit, j.nextVisit, j.nextVisitLabel),
                    color = Ink,
                    fontSize = 22.sp,
                    lineHeight = 32.sp,
                )
                HorizontalDivider(color = Mint)
                Text(
                    stringResource(
                        R.string.home_return_trip,
                        j.returnPlaceLabel,
                        j.returnEstimate,
                        j.returnDeadline,
                    ),
                    color = Ink,
                    fontSize = 20.sp,
                    lineHeight = 32.sp,
                )
                val cafeLabel = stringResource(R.string.home_cafe)
                val seaLabel = stringResource(R.string.home_sea)
                val interests =
                    j.interests
                        .map { if (it == "cafe") cafeLabel else seaLabel }
                        .joinToString(" · ")
                Text(
                    if (interests.isEmpty()) stringResource(R.string.home_no_interests)
                    else stringResource(R.string.home_interests, interests),
                    color = Forest,
                    fontSize = 17.sp,
                )
                val preferences =
                    listOfNotNull(
                            if (j.activityPreference != null) stringResource(R.string.home_activity)
                            else null,
                            if (j.pace != null) stringResource(R.string.home_pace) else null,
                            if (j.conversationStyle != null)
                                stringResource(R.string.home_conversation)
                            else null,
                            if (j.expressionPresetIds.isNotEmpty())
                                stringResource(R.string.home_expression)
                            else null,
                        )
                        .joinToString(" · ")
                if (preferences.isNotEmpty())
                    Text(preferences, color = Muted, fontSize = 16.sp, lineHeight = 24.sp)
                Text(
                    when (j.style) {
                        "calm" -> stringResource(R.string.home_calm)
                        "light_humor" -> stringResource(R.string.home_humor)
                        else -> stringResource(R.string.home_neutral)
                    },
                    color = Muted,
                )
                Text(
                    if (state.social.peerAlias != null)
                        "${state.social.peerAlias}의 캐릭터와 이어갈 준비가 됐어요. 만남은 별도 동의로 진행해요."
                    else "내 친구와 오늘의 여행을 이어가요.",
                    color = Muted,
                )
            }
            Text(
                state.notice ?: stringResource(R.string.home_checking),
                color = Muted,
                fontSize = 15.sp,
                lineHeight = 23.sp,
            )
        }
    }
}
