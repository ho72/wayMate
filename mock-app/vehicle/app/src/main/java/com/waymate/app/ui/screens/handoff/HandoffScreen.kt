package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.ui.components.AgentCharacter
import com.waymate.app.ui.theme.*

@Composable
fun HandoffScreen(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
    onOpenNavigation: () -> Unit,
    onOpenMeeting: () -> Unit,
    onSocialAction: (String, String) -> Unit,
) {
    var socialReview by remember { mutableStateOf<Pair<String, String>?>(null) }
    var confirmStart by remember { mutableStateOf(false) }
    var startPreview by remember { mutableStateOf<com.waymate.app.model.Journey?>(null) }
    val journey = state.journey
    Surface(Modifier.fillMaxSize(), color = Canvas) {
        BoxWithConstraints {
            val wide = maxWidth >= 840.dp
            val bodyMinHeight = (maxHeight - 160.dp).coerceAtLeast(0.dp)
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(if (wide) 40.dp else 24.dp)
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.home_brand),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = Forest,
                    )
                    Text(
                        if (journey == null) stringResource(R.string.home_start_badge)
                        else if (state.social.peerAlias != null) "${state.social.peerAlias} · 연결됨"
                        else stringResource(R.string.home_private_badge),
                        Modifier.background(Mint, RoundedCornerShape(30.dp)).padding(14.dp),
                        color = Forest,
                    )
                }
                if (journey != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (state.social.peerAlias != null || state.social.meetingStatus != "none")
                            Button(onClick = onOpenMeeting) {
                                Text(
                                    if (state.social.cleanupRequired) "만남 취소 · 경유지 확인 필요"
                                    else if (state.social.meetingStatus == "none") "만남 제안 받기"
                                    else "만남 상태 확인"
                                )
                            }
                        else Button(onClick = onOpenNavigation) { Text("내 여행 경유지") }
                        state.social.actions["CONNECT_END"]?.let { binding ->
                            OutlinedButton(onClick = { socialReview = "CONNECT_END" to binding }) {
                                Text("연결 종료")
                            }
                        }
                        state.social.actions["PROFILE_PRIVATE"]?.let { binding ->
                            OutlinedButton(
                                onClick = { socialReview = "PROFILE_PRIVATE" to binding }
                            ) {
                                Text("소개 공개 철회")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(28.dp))
                if (wide)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = bodyMinHeight),
                        horizontalArrangement = Arrangement.spacedBy(32.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CharacterPanel(state, Modifier.weight(1f), true)
                        JourneyPanel(
                            state,
                            onLoadJourney,
                            {
                                startPreview = state.preparation
                                confirmStart = true
                            },
                            Modifier.weight(1f),
                        )
                    }
                else {
                    CharacterPanel(state, Modifier.fillMaxWidth())
                    JourneyPanel(
                        state,
                        onLoadJourney,
                        {
                            startPreview = state.preparation
                            confirmStart = true
                        },
                        Modifier.fillMaxWidth(),
                    )
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
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            state.journey?.let { stringResource(R.string.home_greeting, it.alias) }
                ?: stringResource(R.string.home_welcome),
            fontSize = 28.sp,
            lineHeight = 38.sp,
            fontWeight = FontWeight.Bold,
            color = Ink,
        )
        AgentCharacter(
            state.journey?.avatarId ?: state.preparation?.avatarId ?: "a-01",
            Modifier.fillMaxWidth().height(if (wide) 440.dp else 300.dp),
        )
        Text(
            if (state.journey != null) stringResource(R.string.home_companion)
            else stringResource(R.string.home_prepare_help),
            color = Muted,
            fontSize = 17.sp,
        )
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
                Button(
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
                OutlinedButton(
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
