package com.waymate.app.demo

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.ui.screens.handoff.movePortraitWindowRight
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** The host operates the official Console; no fake restriction observations. */
class OfflineDrivingTransitionTest {
    @get:Rule val ui = createAndroidComposeRule<OfflineDemoActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val files get() = instrumentation.targetContext.filesDir
    private var sequence = 0
    private fun exists(tag: String) = ui.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
    private fun vehicle(command: String) {
        val request = "${++sequence}:$command"
        File(files, "driving-control.txt").writeText(request)
        ui.waitUntil(30000) { File(files, "driving-ack.txt").let { it.exists() && it.readText().trim() == request } }
        ui.waitUntil(30000) { exists(if (command != "park") "driving-mode" else "parked-mode") }
        ui.waitForIdle()
    }
    private fun capture(id: String) {
        val directory = File(files, "offline-proof").apply { mkdirs() }
        ui.waitForIdle(); instrumentation.waitForIdleSync(); SystemClock.sleep(900)
        val screenshot = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(directory, "$id.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG, 100, it) }
        screenshot.recycle()
    }
    private fun shell(command: String) = instrumentation.uiAutomation.executeShellCommand(command).use {
        android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
    }
    private fun width(): Int {
        var width = 0
        ui.activityRule.scenario.onActivity { width = it.window.decorView.width }
        return width
    }
    private fun select(id: String) {
        ui.activityRule.scenario.onActivity { it.showIndex = false; it.selectScene(id) }
        ui.waitUntil(15000) { exists("parked-mode") }
        ui.waitForIdle()
        shell("input tap 2250 145")
        ui.waitUntil(5000) { var focus = false; ui.activityRule.scenario.onActivity { focus = it.hasWindowFocus() }; focus }
        SystemClock.sleep(200)
        if (id == "call-active") {
            ui.onNodeWithText("통화 중 · 시연").assertIsDisplayed()
            if (width() == 841) ui.onNodeWithText("안녕하세요. 오늘 바다 풍경이 참 좋네요.").assertIsDisplayed()
        }
        if (id == "content-messages" && width() == 841) {
            ui.onNodeWithText("저도 바다를 보며 걷는 게 좋아요.").assertIsDisplayed()
            ui.onNodeWithText("저는 조용한 카페도 좋아해요.").assertIsDisplayed()
        }
    }
    private fun exercise(id: String, split: String, screenshot: Boolean) {
        select(id)
        if (screenshot) capture("$id-parked-$split")
        var narrationCount = 0
        ui.activityRule.scenario.onActivity { narrationCount = it.drivingNarrations }
        vehicle("drive")
        ui.waitUntil(10000) { var started = false; ui.activityRule.scenario.onActivity { started = it.drivingNarrations > narrationCount }; started }
        SystemClock.sleep(250)
        ui.activityRule.scenario.onActivity { assertEquals("One automatic narration per transition: $id", narrationCount + 1, it.drivingNarrations) }
        ui.onNodeWithTag("driving-context-title").assertIsDisplayed()
        val title = ui.onNodeWithTag("driving-context-title").fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.Text].joinToString { it.text }
        val expected = when {
            id.startsWith("extra-") -> OfflineDemoSession.scenesExtras.getValue(id).pageTitle
            id.startsWith("call-") -> "통화"
            id.startsWith("meeting-") -> "만남 계획"
            id.startsWith("ending-") -> "여행 이어가기"
            id == "content-messages" || id == "content-waiting" -> "답장 확인"
            id == "content-answer" || id == "content-profile" -> "상대 알아가기"
            id == "content-draft" -> "말 전하기"
            id == "content-intro" -> "친구 소개"
            id == "content-list" -> "대화 고르기"
            id == "content-rest" -> "잠깐 쉬기"
            id == "content-friend" -> "내 친구와 대화"
            id == "navigation" -> "내비 안내"
            id == "preparation" -> "여행 준비"
            else -> "나만의 여행"
        }
        assertEquals("Context for $id", expected, title)
        if (screenshot) {
            try {
                ui.waitUntil(10000) { var playing = false; ui.activityRule.scenario.onActivity { playing = it.speechState.phase == "speaking" }; playing }
            } catch (error: Throwable) {
                var phase = ""; ui.activityRule.scenario.onActivity { phase = it.speechState.toString() + " focus=" + it.hasWindowFocus() }
                throw AssertionError("Playback failed for $id/$split: $phase", error)
            }
            ui.activityRule.scenario.onActivity { assertEquals("prepared_sample", it.speechState.source) }
        }
        assertFalse("Parked controls hidden for $id", exists("parked-mode"))
        ui.activityRule.scenario.onActivity {
            assertEquals(Lifecycle.State.RESUMED, it.lifecycle.currentState)
            assertTrue(it.window.decorView.isShown)
        }
        if (screenshot) capture("$id-driving-$split")
        if (id == "content-messages" && split == "2split") {
            ui.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
            ui.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            ui.waitUntil(15000) { exists("driving-mode") }
            SystemClock.sleep(300)
            ui.activityRule.scenario.onActivity { assertFalse("Focus return does not replay", it.speechState.phase in listOf("speaking", "preparing")) }
        }
        vehicle("park")
        assertFalse("Driving cleared for $id", exists("driving-context-title"))
        ui.waitUntil(5000) { var stopped = false; ui.activityRule.scenario.onActivity { stopped = it.speechState.phase !in listOf("speaking", "preparing") }; stopped }
        SystemClock.sleep(150)
        ui.activityRule.scenario.onActivity { assertFalse("No automatic replay after P", it.speechState.phase in listOf("speaking", "preparing")) }
        if (screenshot) capture("$id-returned-$split")
        File(files, "offline-proof/results.tsv").appendText("$split\t$id\t$title\tP-D36-P PASS\n")
    }
    @Test fun parkedReplyMeetingNavigationAndFinalChoiceWorkWithoutAServer() {
        vehicle("park")
        select("content-messages")
        ui.onNodeWithText("저는 조용한 카페도 좋아해요.").performScrollTo().performClick()
        ui.onNodeWithText("답변 확인").performClick()
        ui.onNodeWithText("확인하고 전송").performClick()
        ui.activityRule.scenario.onActivity { assertEquals("저는 조용한 카페도 좋아해요.", it.session.state().content.threads.single().reply) }
        select("meeting-proposal")
        ui.onNodeWithText("이 장소·시간 제안하기").performScrollTo().performClick()
        ui.onNodeWithText("확인", substring = false).performClick()
        ui.activityRule.scenario.onActivity { assertEquals("confirmed", it.session.state().social.meetingStatus) }
        ui.onNodeWithText("만남 카페 경유지 확인").performScrollTo().performClick()
        ui.onNodeWithText("모의 경유지 추가 승인").performScrollTo().performClick()
        ui.onNodeWithText("확인하고 진행").performClick()
        ui.activityRule.scenario.onActivity { assertTrue(it.session.state().navigation.mockWaypointPresent) }
        select("ending-pending")
        ui.onNodeWithText("내 캐릭터와 여행 이어가기").performScrollTo().performClick()
        ui.onNodeWithText("선택 제출하기").performClick()
        ui.onNodeWithText("확인하고 선택 제출").performClick()
        ui.activityRule.scenario.onActivity { assertEquals("my_agent", it.session.state().ending.phase) }
    }
    @Test fun everyOfflineSceneKeepsContextAcrossActualVehicleTransitions() {
        vehicle("park")
        File(files, "offline-proof").mkdirs()
        File(files, "offline-proof/results.tsv").writeText("")
        ui.waitUntil(20000) { width() == 1682 || width() == 841 }
        if (width() == 841) {
            shell("input tap 1706 720"); shell("input swipe 1706 720 2540 720 600")
            ui.waitUntil(15000) { width() == 1682 }
        }
        for (id in listOf("content-messages", "call-active", "extra-ITINERARY", "extra-REST_DETAIL")) exercise(id, "2split", true)
        shell("input tap 2546 720"); shell("input swipe 2540 720 1700 720 600")
        ui.waitUntil(15000) { width() == 841 }
        var x = 0
        ui.activityRule.scenario.onActivity { val xy = IntArray(2); it.window.decorView.getLocationOnScreen(xy); x = xy[0] }
        if (x < 1700) movePortraitWindowRight()
        shell("input tap 2250 180")
        for ((id, _) in OfflineDemoSession.scenes) exercise(id, "3split", id in listOf("content-messages", "call-active", "extra-ITINERARY", "extra-REST_DETAIL"))
        select("content-messages"); vehicle("drive"); vehicle("idle"); vehicle("park")
        ui.activityRule.scenario.onActivity {
            assertEquals("received", it.session.state().content.threads.single().status)
            assertFalse(it.session.state().navigation.mockWaypointPresent)
        }
        File(files, "driving-control.txt").writeText("${++sequence}:done")
    }
}
