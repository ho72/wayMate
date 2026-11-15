package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.ui.components.*
import com.waymate.app.ui.theme.*
import com.waymate.app.platform.dialogue.LocalScenarioDialogue

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
    onOpenPersonalTrip: (() -> Unit)? = null,
    onOpenPlaces: (() -> Unit)? = null,
    onOpenItinerary: (() -> Unit)? = null,
    onOpenVoice: (() -> Unit)? = null,
    personalNavigationPending: Boolean = false,
    onOpenPagePreview: (() -> Unit)? = null,
) {
    val script = LocalScenarioDialogue.current
    var confirmStart by remember { mutableStateOf(false) }
    var startPreview by remember { mutableStateOf<com.waymate.app.model.Journey?>(null) }
    val journey = state.journey
    VehicleBackground(pageTag = if (journey == null) "여행 준비" else if (state.social.peerAlias != null) "친구와 여행" else "나만의 여행") {
        CompanionScene(
            avatarId = journey?.avatarId ?: state.preparation?.avatarId ?: "a-01",
            bubble = if (journey == null) "여행 전에, 우리 조금 알아갈까?" else "오늘도 좋은 길이네요!",
            title = if (journey == null) "먼저 모바일에서 준비해요" else "우리, 어디까지 왔을까?",
            subtitle = if (journey == null) "내 친구와 이야기하고 여행 계획을 저장해 주세요." else script.line("friend.opening", "나만의 페이스로 여행을 이어가요."),
            preparing = journey == null,
            motionEnabled = state.loadEnabled || state.startEnabled || (journey != null && !state.content.blocked),
            card = { HomeJourneySummary(state) },
            actions = {
                HomeActions(state, onLoadJourney, { startPreview = state.preparation; confirmStart = true },
                    onOpenContent, onOpenMeeting, onOpenNavigation)
            },
            footer = {
                Column(Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    if (journey != null) {
                        if (state.social.peerAlias == null || personalNavigationPending) onOpenPlaces?.let { open ->
                            VehicleOutlineButton(onClick = open) { Text(if (personalNavigationPending) "개인 안내 결과 확인 필요" else "장소 물어보기") }
                        }
                        onOpenItinerary?.let { open -> VehicleOutlineButton(onClick = open) { Text("내 일정과 안내 확인") } }
                        if (state.content.peerAlias != null) onOpenVoice?.let { open ->
                            VehicleOutlineButton(onClick = open) { Text("음성 대화 화면 미리보기") }
                        }

                    }
                    onOpenPersonalTrip?.let { open ->
                        VehicleOutlineButton(onClick = open) { Text("내 계정 여행") }
                    }
                    onOpenPagePreview?.let { open ->
                        VehicleOutlineButton(onClick = open) { Text("추가 차량 화면 미리보기") }
                    }
                    state.notice?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodySmall) }
                }
            },
        )
    }
    if (confirmStart)
        VehicleConfirmationDialog(
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
                VehicleDialogButton(
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
                VehicleDialogButton(secondary = true, onClick = { confirmStart = false }) {
                    Text(stringResource(R.string.home_back))
                }
            },
        )
}

@Composable
private fun HomeJourneySummary(state: HandoffUiState) {
    val journey = state.journey
    CompanionInfoCard {
        Text(if (journey == null) "차량에서도, 대화를 이어서" else "다음 일정", color = Muted,
            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 26.sp, lineHeight = 36.sp))
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
