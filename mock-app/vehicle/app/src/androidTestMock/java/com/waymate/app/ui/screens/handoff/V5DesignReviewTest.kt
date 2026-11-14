package com.waymate.app.ui.screens.handoff

import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.model.*
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Offline presentation review. No repository, HTTP, SDK driver or playback engine. */
class V5DesignReviewTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val trip = Journey(null, 1, "파도", "a-01", null, listOf("sea_walk", "cafe"),
        "2026-11-14", "15:20", "기존 개인 방문지", "내 숙소", "15:45", "16:00")
    private val social = SocialUiState(visible = true, peerAlias = "솔바람", connectionStatus = "linked",
        meetingStatus = "confirmed", notice = "서로 만나기로 했어요", canInteract = true,
        actions = mapOf("CONNECT_END" to "offline-end", "MEETING_CANCEL" to "offline-cancel"))
    private val route = """{"second":{"destination":{"name":"42dot"}}}"""

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use {
            ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
        }
    }
    private fun portrait() {
        var width = 0; var x = 0
        fun read() { ui.activityRule.scenario.onActivity {
            width = it.window.decorView.width
            val position = IntArray(2); it.window.decorView.getLocationOnScreen(position); x = position[0]
        } }
        SystemClock.sleep(600); read()
        if (width == 1682) { shell("input tap 2546 720"); shell("input swipe 2540 720 1700 720 600") }
        ui.waitUntil(15000) { read(); width == 841 }
        SystemClock.sleep(600); read()
        if (x < 1000) movePortraitWindowRight()
        ui.waitUntil(15000) { read(); width == 841 && x > 1700 }
    }
    private fun capture(name: String) {
        ui.waitForIdle()
        instrumentation.waitForIdleSync()
        SystemClock.sleep(350)
        var x = 0; var y = 0; var width = 0; var height = 0
        ui.activityRule.scenario.onActivity {
            val view = it.window.decorView; val position = IntArray(2); view.getLocationOnScreen(position)
            x = position[0]; y = position[1]; width = view.width; height = view.height
        }
        assertEquals(841, width); assertEquals(1210, height)
        val full = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val pane = Bitmap.createBitmap(full, x, y, width, height)
        val directory = File(instrumentation.targetContext.filesDir, "design-v5").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { pane.compress(Bitmap.CompressFormat.PNG, 100, it) }
        File(directory, "$name.json").writeText(JSONObject().put("width", width).put("height", height)
            .put("fontScale", ui.activity.resources.configuration.fontScale).put("sdkCalls", 0).toString(2))
        pane.recycle(); full.recycle()
    }

    @Test fun simplifiedControlsKeepConsentAndChoiceExplicitAcrossReferenceScenes() {
        var page by mutableStateOf("home")
        var approvals = 0; var choices = 0; var businessActions = 0; var playback = 0
        ui.setContent { WayMateTheme { key(page) {
            when (page) {
                "home" -> HandoffScreen(HandoffUiState(journey = trip, social = social,
                    content = ContentUiState(peerAlias = "솔바람")), {}, {}, {}, {},
                    { _, _ -> businessActions++ }, {}, {})
                "intro" -> ContentScreen(ContentUiState(visible = true, blocked = false,
                    canInteract = true, peerAlias = "솔바람", scope = "offline-design"), trip,
                    SpeechState("idle", true), { playback++ }, {}, { _, _ -> businessActions++ }, {}, {}, {}, {}, {})
                "meeting" -> MeetingScreen(social, {}, { _, _ -> businessActions++ }, { page = "navigation" }, {}, trip)
                "navigation" -> NavigationScreen(NavigationUiState(visible = true, destination = "42dot",
                    canAdd = true, reviewed = route), {}, { _, _ -> approvals++ }, {}, social, { _, _ -> businessActions++ }, {}, trip)
                "choice", "together", "separate" -> EndingScreen(EndingUiState(visible = true,
                    phase = when(page) { "choice" -> "pending"; "separate" -> "my_agent"; else -> "together" },
                    scope = "offline-$page", canInteract = true, blocked = false,
                    actions = mapOf("FINAL_CHOOSE_TOGETHER" to "offline-together", "FINAL_CHOOSE_MY_AGENT" to "offline-my-agent"),
                    lines = if (page == "together") listOf(EndingLine("안내", "두 분 모두 함께를 선택했어요. 해변 산책을 이어가요.")) else emptyList()),
                    trip, SpeechState("idle", true), { playback++ }, {}, { _, _ -> choices++ }, {}, {}, {})
                "driving" -> DrivingScreen(DrivingUiState(mode = InteractionMode.DRIVING_LIMITED,
                    canPlayPreparedAudio = true, audioValidUntil = SystemClock.elapsedRealtime() + 30000), trip,
                    SpeechState("idle", true), { playback++ }, {})
            }
        } } }
        portrait()
        capture("home")
        ui.onNodeWithText("연결 종료").assertDoesNotExist()
        ui.onNodeWithText("여행 관리").performScrollTo().performClick()
        ui.onNodeWithText("연결 종료").performScrollTo().performClick()
        assertEquals(0, businessActions)
        ui.onNodeWithText("돌아가기").performClick()

        ui.runOnIdle { page = "intro" }; capture("intro"); assertEquals(0, playback)
        ui.runOnIdle { page = "meeting" }; capture("meeting")
        ui.onNodeWithText("만남 카페를 경유지로 추가").performScrollTo().performClick()
        capture("navigation")
        ui.onNodeWithText("경유지 추가 승인").performScrollTo().performClick()
        capture("navigation-confirmation"); assertEquals(0, approvals)
        ui.onNodeWithText("승인하고 추가").performClick()
        ui.runOnIdle { assertEquals(1, approvals); page = "choice" }
        capture("choice")
        ui.onNodeWithText("함께 여행 이어가기").performScrollTo().performClick()
        ui.onNodeWithText("선택을 제출하기").performScrollTo().performClick()
        capture("choice-confirmation"); assertEquals(0, choices)
        ui.onNodeWithText("확인하고 선택 제출").performClick()
        ui.runOnIdle { assertEquals(1, choices); page = "together" }; capture("together")
        ui.runOnIdle { page = "separate" }; capture("separate")
        ui.runOnIdle { page = "driving" }; capture("driving")
        ui.onNodeWithText("경유지 추가 승인").assertDoesNotExist()
        ui.onNodeWithText("솔바람").assertDoesNotExist()
        assertEquals(0, playback); assertEquals(0, businessActions)
    }
}
