package com.waymate.app.ui.screens.handoff

import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.waymate.app.model.*
import com.waymate.app.platform.speech.*
import com.waymate.app.ui.components.LocalAgentSpeech
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Offline callbacks only: no providers, microphone, commands or navigation execution. */
class PleosAlignmentDeviceTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val trip = Journey(null, 1, "여행자", "a-01", null, emptyList(), "2026-12-14", "15:20", "개인 방문지", "내 숙소", "15:45", "16:00")
    private val content = ContentUiState(visible = true, blocked = false, scope = "alignment", peerAlias = "솔바람", canInteract = true)

    @Test fun preparedPeerAnswerUsesRumitAndHardwareBackReturnsToContentList() {
        val requests = mutableListOf<AgentNarration>();var homeBack = 0
        ui.setContent { WayMateTheme { CompositionLocalProvider(LocalAgentNarrator provides { requests.add(it) }) {
            ContentScreen(content.copy(questions = listOf(ContentQuestion("Q1", "여행 취향", "공개된 바다 산책 이야기", true))), trip,
                SpeechState("idle", true), {}, {}, { _, _ -> }, {}, {}, { homeBack++ }, {}, {}, initialPage = "answer")
        } } }
        ui.onNodeWithText("현재 문장 읽어주기").performScrollTo().performClick()
        ui.runOnIdle { assertEquals("b-01", requests.single().avatarId); assertEquals("공개된 바다 산책 이야기", requests.single().text) }
        ui.runOnIdle { ui.activity.onBackPressedDispatcher.onBackPressed() }
        ui.onNodeWithText("어떤 이야기를 나눠볼까요?").assertExists()
        ui.runOnIdle { assertEquals(0, homeBack) }
    }

    @Test fun placePromptIsLocalAutomaticAndNeverRestartsOnForegroundRestoration() {
        val requests = mutableListOf<AgentNarration>();val enabled = mutableStateOf(true)
        ui.setContent { WayMateTheme { CompositionLocalProvider(LocalAgentNarrator provides { requests.add(it) }) {
            VehicleExtraScreen(VehiclePageFlow(page = VehiclePage.REQUEST), trip, enabled.value, {}, {}, {}, {}, {})
        } } }
        ui.runOnIdle { assertEquals(1, requests.size); assertTrue(requests.single().automatic); assertEquals("a-01", requests.single().avatarId); enabled.value = false }
        ui.waitForIdle();ui.runOnIdle { enabled.value = true };ui.waitForIdle()
        ui.runOnIdle { assertEquals(1, requests.size) }
    }

    @Test fun subtitlePreviewDoesNotPretendToListenOrSpeakBeforePlayback() {
        val playback = mutableStateOf(SpeechState("idle", true))
        ui.setContent { WayMateTheme { CompositionLocalProvider(LocalAgentSpeech provides playback.value) {
            VehicleExtraScreen(VehiclePageFlow(page = VehiclePage.VOICE, voicePhase = "talking"), trip, true, {}, {}, {}, {}, {}, onSpeak = {})
        } } }
        ui.onNodeWithText("루밋 · 친구의 말을 들어볼까요?").assertExists()
        ui.onNodeWithText("루밋 · 듣고 있어요").assertDoesNotExist()
        ui.onNodeWithText("루밋 · 말하고 있어요").assertDoesNotExist()
        ui.runOnIdle { playback.value = SpeechState("speaking", true, "친구의 말", "prepared_sample") }
        ui.onNodeWithText("루밋 · 말하고 있어요").assertExists()
    }

    @Test fun serverMeetingPlanIsUsedInCardAndConfirmationAndChangesDismissReview() {
        val state = mutableStateOf(SocialUiState(canInteract = true, peerAlias = "솔바람", actions = mapOf("MEETING_PROPOSE" to "{}"),
            meeting = MeetingPlan("새 만남 카페", "2026-12-20", "14:20", "15:05")))
        ui.setContent { WayMateTheme { MeetingScreen(state.value, {}, { _, _ -> }, {}, {}, trip) } }
        ui.onNodeWithText("새 만남 카페").assertExists()
        ui.onNodeWithText("14:20–15:05").assertExists()
        ui.onNodeWithText("45분 동안 가볍게 만나요").assertExists()
        ui.onNodeWithText("이 장소·시간 제안하기").performScrollTo().performClick()
        ui.onNodeWithText("새 만남 카페 · 2026-12-20 14:20~15:05", substring = true).assertExists()
        ui.runOnIdle { state.value = state.value.copy(meeting = state.value.meeting!!.copy(start = "14:25")) }
        ui.onNodeWithText("이 장소와 시간을 제안할까요?").assertDoesNotExist()
    }

    @Test fun compactEndingKeepsBothChoicesVisibleWhenNavigationCleanupIsRequired() {
        ui.setContent { WayMateTheme { Box(Modifier.width(841.dp).fillMaxHeight()) {
            EndingScreen(EndingUiState(visible = true, phase = "my_agent", replay = true, round = 2, blocked = false, canInteract = true, cleanupRequired = true,
                prompt = "이제 네 속도로 이어가자. 바다를 조금 더 볼까, 잠깐 쉬어갈까?", answers = listOf(
                    EndingAnswer("rest", "바다 보면서 좀 쉬고 싶어", "쉬어가요."), EndingAnswer("photo", "사진도 한 장 남기고 싶어", "사진을 남겨요."))),
                trip, SpeechState("idle", true), {}, {}, { _, _ -> }, {}, {}, {})
        } } }
        ui.onNodeWithText("바다 보면서 좀 쉬고 싶어").assertIsDisplayed()
        val second=ui.onNodeWithText("사진도 한 장 남기고 싶어").assertIsDisplayed().getUnclippedBoundsInRoot()
        val primary=ui.onNodeWithText("내 캐릭터와 계속하기").getUnclippedBoundsInRoot()
        assertTrue("Both complete choice rows remain above fixed actions", second.bottom <= primary.top)
    }

    @Test fun callSampleUsesActualParticipantIdentityForVoice() {
        val requests = mutableListOf<AgentNarration>()
        ui.setContent { WayMateTheme { CompositionLocalProvider(LocalAgentNarrator provides { requests.add(it) }) {
            CallPanel(content.copy(call = CallUiState("call", "active", true, listOf(CallSampleLine("b1", "솔바람", "반가워요.")))),
                SpeechState("idle", true), {}, {}, { _, _ -> }, {}, myAvatar = "a-01")
        } } }
        ui.onNodeWithText("샘플 듣기").performClick()
        ui.runOnIdle { assertEquals("b-01", requests.single().avatarId); assertEquals("반가워요.", requests.single().text) }
    }
}
