package com.waymate.app.ui.screens.handoff

import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.waymate.app.app.WayMateApp
import com.waymate.app.model.*
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Runs production page components offline. Does not construct a repository or navigation driver. */
class VehiclePageNavigationTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val trip = Journey("pages-fixture", 1, "파도", "a-01", null, emptyList(),
        "2026-11-15", "15:20", "기존 개인 방문지", "내 숙소", "15:45", "16:00")
    private fun click(label: String) = ui.onNodeWithText(label).performScrollTo().performClick()
    private fun page(wf: String) = ui.onNodeWithTag("wf-$wf").assertExists()
    private fun awaitPage(wf: String) { ui.waitUntil(10000) { ui.onAllNodesWithTag("wf-$wf").fetchSemanticsNodes().isNotEmpty() } }

    @Test fun restAndLunchPreserveTheirOwnDetailsOnCancelAndWaypointSuccess() {
        var flow by mutableStateOf(VehiclePageFlow(page = VehiclePage.REQUEST))
        ui.setContent { WayMateTheme { VehicleExtraScreen(flow, trip, true, { flow = it }, { flow = flow.home() }, {}, {}, {}) } }
        page("034"); click("30분 쉴 곳 물어보기"); page("035")
        click("바다쉼터 자세히 보기"); page("036")
        click("이곳으로 안내 확인"); page("037")
        click("아직 변경하지 않기"); page("036")
        ui.runOnIdle { assertNull(flow.request) }
        click("다른 장소 보기"); click("질문으로 돌아가기")
        click("점심 장소 물어보기"); page("044")
        click("솔숲식당 자세히 보기"); page("045")
        click("이곳으로 안내 확인"); page("037")
        click("아직 변경하지 않기"); page("045")
        click("이곳으로 안내 확인"); click("이곳을 경유지로 추가"); page("046")
        ui.onNodeWithText("결과 확인 중").assertIsNotEnabled()
        awaitPage("047")
        ui.runOnIdle {
            assertEquals("lunch-2", flow.request?.placeId)
            assertEquals("기존 개인 방문지", flow.destination)
            assertEquals(1, flow.sequence)
        }
        click("내 일정 보기"); page("039")
    }

    @Test fun noDestinationScheduleFailureAndUnknownHaveSeparatePagesAndNoSilentRetry() {
        var flow by mutableStateOf(VehiclePageFlow(page = VehiclePage.REQUEST, destination = null, outcome = PreviewOutcome.FAILED))
        ui.setContent { WayMateTheme { VehicleExtraScreen(flow, trip, true, { flow = it }, { flow = flow.home() }, {}, {}, {}) } }
        click("점심 장소 물어보기"); click("바다한상 자세히 보기"); click("이곳으로 안내 확인"); page("038")
        click("취소"); page("045")
        click("이곳으로 안내 확인"); click("이곳을 목적지로 설정")
        awaitPage("049"); click("장소와 경로 다시 확인"); page("045")
        ui.runOnIdle { assertEquals(1, flow.sequence); flow = flow.copy(outcome = PreviewOutcome.UNKNOWN) }
        click("이곳으로 안내 확인"); click("이곳을 목적지로 설정")
        awaitPage("050")
        click("현재 내비 다시 확인"); page("050")
        ui.onNodeWithText("확인 후 새 안내 승인").assertIsNotEnabled()
        ui.runOnIdle {
            val request = flow.request
            flow = flow.home().open(VehiclePage.REQUEST)
            assertEquals(request, flow.request); assertEquals(2, flow.sequence)
        }
        page("050"); click("같은 요청의 모의 반영 확인"); page("048")
        ui.runOnIdle { assertEquals("lunch-1", flow.destination); assertEquals(2, flow.sequence) }
        click("내 일정 보기"); page("039")
        click("시연 조건 선택"); click("목적지 없음")
        click("이 일정으로 안내 확인"); page("038"); click("취소"); page("039")
    }

    @Test fun mcRequiresSeparateConsentAndDecliningReturnsToTheSameGeneralCall() {
        var state by mutableStateOf(HandoffUiState(journey = trip, content = ContentUiState(visible = true,
            peerAlias = "솔바람", canInteract = true, blocked = false, scope = "call-pages",
            call = CallUiState("call-one", "active", true, emptyList()), actions = mapOf("CALL_END" to "end-call"))))
        var actions = 0
        app({ state }, { _, _ -> actions++ })
        click("MC 참여 화면 보기"); page("042")
        click("MC 참여 제안")
        ui.onNodeWithText("MC: 오늘 가장 기억에 남은 풍경은 무엇인가요?").assertDoesNotExist()
        click("상대가 MC를 거절한 장면 보기"); click("MC 없이 일반 통화")
        ui.onNodeWithText("둘이 직접 통화하기").assertExists()
        ui.runOnIdle { assertEquals(0, actions) }
        click("MC 참여 화면 보기"); click("MC 참여 제안"); click("상대도 MC에 동의한 장면 보기")
        ui.onNodeWithText("MC: 오늘 가장 기억에 남은 풍경은 무엇인가요?").assertExists()
        click("통화 종료")
        ui.runOnIdle { assertEquals(1, actions) }
    }

    @Test fun togetherEndingOpensReviewAndAppliesOnlyAfterTheEndScene() {
        var state by mutableStateOf(HandoffUiState(journey = trip, ending = EndingUiState(visible = true,
            phase = "together", blocked = false, canInteract = true, scope = "ending-pages")))
        var actions = 0
        app({ state }, { _, _ -> actions++ })
        click("여행 후 기록·장식 보기"); page("043")
        ui.onNodeWithText("내 캐릭터에 반영하기").assertDoesNotExist()
        click("여행 종료 후 장면 보기"); click("내 캐릭터에 반영하기")
        ui.onNodeWithText("이 외형에 반영했어요").assertIsNotEnabled()
        click("건너뛰기")
        ui.onNodeWithText("함께 여행 이어가기").assertExists()
        ui.runOnIdle { assertEquals(0, actions) }
    }

    @Test fun voicePreviewPausesAndDrivingNeverShowsDetailOrAutoRestartsIt() {
        var state by mutableStateOf(HandoffUiState(journey = trip,
            content = ContentUiState(peerAlias = "솔바람", blocked = false, canInteract = true)))
        var actions = 0
        app({ state }, { _, _ -> actions++ })
        click("음성 대화 화면 미리보기"); page("051")
        click("자막으로 대화 시작"); click("잠깐 쉬자")
        ui.onNodeWithText("직접 대화 이어가기").assertExists()
        click("직접 대화 이어가기"); click("대화 그만")
        ui.onNodeWithText("자막으로 대화 시작").assertExists()
        ui.runOnIdle { state = state.copy(driving = DrivingUiState(mode = InteractionMode.DRIVING_LIMITED)) }
        ui.onNodeWithTag("driving-mode").assertExists()
        ui.onNodeWithTag("wf-051").assertDoesNotExist()
        ui.runOnIdle { state = state.copy(driving = DrivingUiState()) }
        ui.onNodeWithTag("wf-051").assertDoesNotExist()
        ui.runOnIdle { assertEquals(0, actions) }
    }

    @Test fun homeOpensPersonalPlaceFlowAndRestrictionDiscardsTheApproval() {
        var state by mutableStateOf(HandoffUiState(journey = trip))
        var actions = 0
        app({ state }, { _, _ -> actions++ })
        ui.onNodeWithText("두루밋").assertExists()
        click("장소 물어보기"); page("034")
        click("30분 쉴 곳 물어보기"); click("바다쉼터 자세히 보기"); click("이곳으로 안내 확인"); page("037")
        ui.runOnIdle { state = state.copy(driving = DrivingUiState(mode = InteractionMode.BLOCKED)) }
        ui.onNodeWithTag("blocked-mode").assertExists()
        ui.runOnIdle { state = state.copy(driving = DrivingUiState()) }
        ui.onNodeWithTag("wf-037").assertDoesNotExist()
        ui.runOnIdle { assertEquals(0, actions) }
    }

    private fun app(state: () -> HandoffUiState, action: (String, String) -> Unit) {
        ui.setContent { WayMateTheme { WayMateApp(state(), {}, {}, {}, {}, action, {}, {}, {}, action,
            {}, {}, {}, {}, SpeechState("idle", true), {}, {}, {}, {}, {}) } }
    }
}
