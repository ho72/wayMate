package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import com.waymate.app.ui.components.VehicleButton
import com.waymate.app.ui.components.VehicleOutlineButton
import com.waymate.app.ui.components.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.NavigationUiState
import org.json.JSONObject

@Composable
fun NavigationScreen(
    state: NavigationUiState,
    onBack: () -> Unit,
    onApprove: (String, String) -> Unit,
    onCancel: () -> Unit,
    social: com.waymate.app.model.SocialUiState,
    onSocialAction: (String, String) -> Unit,
    onRetry: () -> Unit,
    journey: com.waymate.app.model.Journey? = null,
) {
    val cancellationBinding = social.actions["MEETING_CANCEL"]
    var review by remember(cancellationBinding, state.source) { mutableStateOf<Pair<String, String>?>(null) }
    VehicleBackground(pageTag = if (state.canRemove) "경유지 정리" else "경로 확인") {
        val show: @Composable ((@Composable () -> Unit)?, (@Composable () -> Unit)?) -> Unit = { mockCard, mockControls ->
        CompanionScene(
            pinActions = true,
            avatarId = journey?.avatarId ?: "a-01",
            bubble = if (state.canRemove) "내가 추가한 경유지만 정리해요" else "경로를 먼저 확인해 주세요",
            title = if (state.canRemove) "원래 목적지는 그대로 유지해요" else "이 장소를 들러갈까요?",
            motionEnabled = false, onBack = onBack,
            card = {
                if (mockCard != null) mockCard()
                else CompanionInfoCard {
                    Text("현재 목적지 · ${state.destination}", style = MaterialTheme.typography.titleLarge)
                    Text(if (social.meetingStatus != "none") "만남 시연 장소 · 바다쉼표 카페\n실제 내비 연동 장소 · 소프트웨어드림센터" else "추가할 장소 · 소프트웨어드림센터")
                    Text("경기도 성남시 수정구 창업로40번길 6")
                    Text("연동 시연용 경유지예요. 승인하면 실제 순정 내비 경로에 반영돼요. 기존 목적지는 유지해요.")
                    HorizontalDivider()
                    Text(state.status, style = MaterialTheme.typography.titleLarge)
                    if (social.meetingStatus == "cancelled") Text(if (social.cleanupRequired) "만남은 취소됐어요. 추가한 경유지는 별도 제거 승인이 필요해요." else "만남은 취소됐어요. 내비 처리 상태를 확인해 주세요.")
                    if (state.busy) Text("반영을 확인 중이에요. 같은 요청은 자동으로 반복하지 않아요.")
                }
            },
            actions = {
                mockControls?.invoke()
                CompanionActionGrid(buildList {
                    if (state.source != "mock") {
                        if (!state.canRemove) add(CompanionActionItem("경유지 추가 승인", { state.reviewed?.let { review = "add" to it } }, state.canAdd))
                        if (state.canRemove) add(CompanionActionItem("두루밋 경유지 제거 승인", { state.reviewed?.let { review = "remove" to it } }, state.canRemove))
                        if (state.canCancel) add(CompanionActionItem("실행 전 승인 취소", onCancel, secondary = true))
                        social.actions["CANCEL_PENDING_COMMAND"]?.let { b -> add(CompanionActionItem("미확인 요청 취소", { onSocialAction("CANCEL_PENDING_COMMAND", b) }, secondary = true)) }
                    }
                    social.actions["MEETING_CANCEL"]?.let { b -> add(CompanionActionItem("만남 취소", { review = "meeting_cancel" to b }, secondary = true)) }
                    if (social.retryPending) add(CompanionActionItem("이전 요청 결과 확인·재전송", onRetry, social.canRetry, true))
                })
            },
        )
        }
        if (state.source == "mock") MockNavigationPanel(state, onSocialAction) { card, controls -> show(card, controls) }
        else show(null, null)
    }
    review?.let { r ->
        val add = r.first == "add"
        val reviewedDestination =
            if (r.first == "meeting_cancel") state.destination
            else
                JSONObject(r.second)
                    .getJSONObject("second")
                    .getJSONObject("destination")
                    .getString("name")
        VehicleConfirmationDialog(
            onDismissRequest = { review = null },
            title = {
                Text(
                    if (r.first == "meeting_cancel") "만남을 취소할까요?"
                    else if (add) "이 경유지를 추가할까요?" else "두루밋 경유지를 제거할까요?"
                )
            },
            text = {
                if (r.first == "meeting_cancel") Text(
                    "만남과 상대 연결을 종료해요. 처리 중인 내비 결과를 확인하고, 추가한 경유지는 별도 제거 승인으로 정리해요."
                ) else VehicleRouteChangeSummary(
                    place = if (state.source == "mock") "바다쉼표 카페" else "소프트웨어드림센터",
                    destination = reviewedDestination,
                    remove = !add,
                    simulated = state.source == "mock",
                )
            },
            confirmButton = {
                VehicleDialogButton(
                    onClick = confirm@{
                        if (review != r) return@confirm
                        review = null
                        if (r.first == "meeting_cancel") {
                            if (social.actions["MEETING_CANCEL"] == r.second) onSocialAction("MEETING_CANCEL", r.second)
                        }
                        else onApprove(r.first, r.second)
                    },
                    enabled = if (r.first == "meeting_cancel") social.actions["MEETING_CANCEL"] == r.second else social.canInteract && !state.busy,
                ) {
                    Text(
                        if (r.first == "meeting_cancel") "만남 취소 확인"
                        else if (add) "경유지 추가" else "경유지 제거"
                    )
                }
            },
            dismissButton = { VehicleDialogButton(secondary = true, onClick = { review = null }) { Text(if (r.first == "meeting_cancel") "돌아가기" else "취소") } },
        )
    }
}
