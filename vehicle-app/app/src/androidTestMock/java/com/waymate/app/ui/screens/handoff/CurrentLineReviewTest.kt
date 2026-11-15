package com.waymate.app.ui.screens.handoff

import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.model.*
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Production screen, offline callbacks: no repository, HTTP, SDK or audio engine. */
@RunWith(Parameterized::class)
class CurrentLineReviewTest(private val windowWidth: Int) {
    companion object {
        @JvmStatic @Parameterized.Parameters(name = "window={0}")
        fun windows(): List<Array<Int>> = listOf(arrayOf(841), arrayOf(1682))
    }
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val lines = listOf(
        EndingLine("A", "안녕하세요. 바다 산책 이야기를 들었어요."),
        EndingLine("솔바람", "반가워요. 천천히 이야기해요."),
        EndingLine("내 친구", "두 분이 원하는 속도로 이어가요."),
    )
    private val trip = Journey(null, 1, "검수친구", "a-02", null, emptyList(),
        "2026-11-14", "15:20", "기존 개인 방문지", "내 숙소", "15:45", "16:00")
    private var state by mutableStateOf(EndingUiState(visible = true, scope = "fixture-meeting",
        phase = "meeting", lines = lines, canInteract = true, blocked = false))
    private var speech by mutableStateOf(SpeechState("idle", true))
    private val spoken = mutableListOf<String>()
    private var stops = 0

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use {
            ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
        }
    }
    @Before fun actualWindow() {
        fun widthAndX(): Pair<Int, Int> {
            var result = 0 to 0
            ui.activityRule.scenario.onActivity {
                val position = IntArray(2); it.window.decorView.getLocationOnScreen(position)
                result = it.window.decorView.width to position[0]
            }
            return result
        }
        SystemClock.sleep(600)
        val (width, x) = widthAndX()
        if (windowWidth == 841 && width == 1682) {
            shell("input tap 2546 720"); shell("input swipe 2540 720 1700 720 600")
        } else if (windowWidth == 1682 && width == 841) {
            shell("input tap 1706 720"); shell("input swipe 1706 720 ${if (x > 1000) 860 else 2540} 720 600")
        }
        ui.waitUntil(15000) { widthAndX().first == windowWidth }
        if (windowWidth == 841 && widthAndX().second < 1000) movePortraitWindowRight()
        ui.waitUntil(15000) { widthAndX().first == windowWidth && (windowWidth != 841 || widthAndX().second > 1700) }
        SystemClock.sleep(400)
        shell("input tap 2440 110")
    }
    private fun host() {
        ui.setContent { WayMateTheme {
            EndingScreen(state, trip, speech, { spoken += it }, { stops++ },
                { _, _ -> fail("No business action is expected") }, {}, {}, {})
        } }
    }
    private fun current(index: Int, expected: EndingLine = lines[index], count: Int = lines.size) {
        ui.onNodeWithTag("ending-current-line").performScrollTo().assertIsDisplayed()
            .assertTextContains("현재 대사 ${index + 1}/$count")
            .assertTextContains("발화자: ${expected.speaker} · 재연")
            .assertTextContains(expected.text)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
    }
    private fun click(text: String) = ui.onNodeWithText(text).performScrollTo().performClick()
    private fun capture(name: String) {
        current(1)
        ui.waitForIdle(); instrumentation.waitForIdleSync()
        var x = 0; var y = 0; var width = 0; var height = 0
        ui.activityRule.scenario.onActivity {
            val view = it.window.decorView; val pos = IntArray(2); view.getLocationOnScreen(pos)
            x = pos[0]; y = pos[1]; width = view.width; height = view.height
        }
        assertEquals(windowWidth, width); assertEquals(1210, height)
        val full = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val pane = Bitmap.createBitmap(full, x, y, width, height)
        val dir = File(instrumentation.targetContext.filesDir, "ui-qa15-16").apply { mkdirs() }
        File(dir, "$name-$windowWidth.png").outputStream().use { pane.compress(Bitmap.CompressFormat.PNG, 100, it) }
        pane.recycle(); full.recycle()
    }
    @Test fun currentSpeakerAndTextFollowNextAndWrapInMeetingAndTogether() {
        host()
        for (phase in listOf("meeting", "together")) {
            ui.runOnIdle { state = state.copy(scope = "fixture-$phase", phase = phase) }
            current(0)
            val count = spoken.size
            click("다음 대사 고르기"); current(1)
            assertEquals(count, spoken.size)
            capture(phase)
            click("현재 대사 읽어주기"); assertEquals(lines[1].text, spoken.last())
            click("전체 대사 보기")
            ui.onNodeWithTag("ending-script-line-1").performScrollTo()
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
            ui.onNodeWithTag("ending-script-line-0")
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
            click("전체 대사 접기")
            val beforeStop = stops
            click("다음 대사 고르기"); current(2)
            assertTrue(stops > beforeStop)
            click("현재 대사 읽어주기"); assertEquals(lines[2].text, spoken.last())
            click("다음 대사 고르기"); current(0)
            click("현재 대사 읽어주기"); assertEquals(lines[0].text, spoken.last())
            assertEquals(count + 3, spoken.size)
        }
    }
    @Test fun sceneScopeContentAndEmptyListResetSelectionWithoutPlayback() {
        host(); click("다음 대사 고르기"); current(1)
        ui.runOnIdle { state = state.copy(phase = "together") }; current(0)
        click("다음 대사 고르기")
        ui.runOnIdle { state = state.copy(scope = "new-round") }; current(0)
        click("다음 대사 고르기")
        val replacement = EndingLine("안내", "새 회차에서 확인할 한 문장이에요.")
        ui.runOnIdle { state = state.copy(lines = listOf(replacement)) }
        current(0, replacement, 1)
        click("다음 대사 고르기"); current(0, replacement, 1)
        ui.runOnIdle { state = state.copy(lines = emptyList()) }
        ui.onNodeWithTag("ending-current-line").assertDoesNotExist()
        ui.onNodeWithText("다음 대사 고르기").assertDoesNotExist()
        assertTrue(spoken.isEmpty())
    }
    @Test fun blockedAndUnavailableSpeechNeverStartOrResumePlayback() {
        host(); click("다음 대사 고르기"); current(1)
        click("현재 대사 읽어주기"); assertEquals(1, spoken.size)
        val beforeStop = stops
        ui.runOnIdle { state = state.copy(canInteract = false) }
        ui.onNodeWithText("현재 대사 읽어주기").performScrollTo().assertIsNotEnabled()
        ui.onNodeWithText("다음 대사 고르기").assertIsNotEnabled()
        assertTrue(stops > beforeStop)
        ui.runOnIdle { state = state.copy(blocked = true) }
        ui.onNodeWithTag("ending-current-line").assertDoesNotExist()
        ui.runOnIdle { state = state.copy(blocked = false, canInteract = true) }
        current(1); assertEquals(1, spoken.size)
        ui.runOnIdle { speech = SpeechState("unavailable", false) }
        ui.onNodeWithText("현재 대사 읽어주기").performScrollTo().assertIsNotEnabled()
        click("다음 대사 고르기"); current(2)
        assertEquals(1, spoken.size)
        ui.runOnIdle { state = state.copy(phase = "together", scope = "own-character") }
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertExists()
    }
    @Test fun vehicleHomeKeepsOwnerCharacterForBothAvatarChoices() {
        var owner by mutableStateOf(trip)
        ui.setContent { WayMateTheme {
            HandoffScreen(HandoffUiState(journey = owner), {}, {}, {}, {},
                { _, _ -> fail("No business action is expected") }, {}, {})
        } }
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertExists()
        ui.runOnIdle { owner = trip.copy(avatarId = "a-01") }
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertDoesNotExist()
        ui.onNode(hasContentDescription("드래곤", substring = true)).assertExists()
        ui.runOnIdle { owner = trip.copy(avatarId = "a-02") }
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertExists()
    }

}
