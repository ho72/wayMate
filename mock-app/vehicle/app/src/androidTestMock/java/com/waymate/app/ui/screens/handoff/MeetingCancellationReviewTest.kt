package com.waymate.app.ui.screens.handoff

import android.graphics.Bitmap
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.model.NavigationUiState
import com.waymate.app.model.SocialUiState
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Production screen with offline bindings. No HTTP, SDK or live navigation mutation. */
class MeetingCancellationReviewTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val originalBinding = "fixture-cancel-proposal-1"
    private var actions by mutableStateOf(mapOf("MEETING_CANCEL" to originalBinding))
    private var navigation by mutableStateOf(NavigationUiState(
        visible = true, source = "mock", destination = "기존 목적지 D"))
    private val sent = mutableListOf<Pair<String, String>>()
    private var approvals = 0

    private fun render() {
        ui.setContent { WayMateTheme {
            NavigationScreen(navigation, {}, { _, _ -> approvals++ }, {},
                SocialUiState(visible = true, peerAlias = "솔바람", connectionStatus = "linked",
                    meetingStatus = "confirmed", canInteract = !navigation.busy, actions = actions),
                { type, binding -> sent.add(type to binding) }, {})
        } }
    }
    private fun open() {
        ui.onNodeWithText("만남 취소").performScrollTo().performClick()
        ui.onNodeWithText("만남을 취소할까요?").assertExists()
        ui.onNodeWithText("만남 취소와 내비 경유지 제거는 별도 동작이에요.", substring = true).assertExists()
        ui.runOnIdle { assertTrue(sent.isEmpty()); assertEquals(0, approvals) }
    }
    private fun portrait() {
        fun shell(command: String) {
            instrumentation.uiAutomation.executeShellCommand(command).use {
                ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
            }
        }
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
    private fun capture() {
        ui.waitForIdle(); instrumentation.waitForIdleSync(); SystemClock.sleep(250)
        var x = 0; var y = 0; var width = 0; var height = 0
        ui.activityRule.scenario.onActivity {
            val view = it.window.decorView; val location = IntArray(2); view.getLocationOnScreen(location)
            x = location[0]; y = location[1]; width = view.width; height = view.height
        }
        assertEquals(841, width); assertEquals(1210, height)
        val full = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        val pane = Bitmap.createBitmap(full, x, y, width, height)
        val dir = File(instrumentation.targetContext.filesDir, "qa-review").apply { mkdirs() }
        File(dir, "meeting-cancel-confirmation.png").outputStream().use { pane.compress(Bitmap.CompressFormat.PNG, 100, it) }
        pane.recycle(); full.recycle()
    }

    @Test fun pendingMockCancellationCanBeReviewedAndDismissedWithoutChangingRoute() {
        navigation = navigation.copy(busy = true, status = "내비 결과 미확인")
        render(); open()
        ui.onNodeWithText("돌아가기").performClick()
        ui.onNodeWithText("만남을 취소할까요?").assertDoesNotExist()
        ui.runOnIdle { assertTrue(sent.isEmpty()); assertEquals(0, approvals) }
        ui.onNodeWithText("현재 목적지: 기존 목적지 D").assertExists()
    }
    @Test fun ownedMockWaypointNeedsOneExplicitConfirmationInThreePaneWindow() {
        navigation = navigation.copy(mockWaypointPresent = true)
        render(); portrait(); open(); capture()
        ui.onNodeWithText("만남 취소 확인").performClick()
        ui.onNodeWithText("만남 취소 확인").assertDoesNotExist()
        ui.runOnIdle { assertEquals(listOf("MEETING_CANCEL" to originalBinding), sent); assertEquals(0, approvals) }
        ui.onNodeWithText("모의 경유지: 있음", substring = true).assertExists()
    }
    @Test fun changedOrRemovedBindingDiscardsTheOpenConfirmation() {
        render(); open()
        ui.runOnIdle { actions = mapOf("MEETING_CANCEL" to "fixture-cancel-proposal-2") }
        ui.onNodeWithText("만남 취소 확인").assertDoesNotExist()
        open()
        ui.runOnIdle { actions = emptyMap() }
        ui.onNodeWithText("만남 취소 확인").assertDoesNotExist()
        ui.onNodeWithText("만남 취소").assertDoesNotExist()
        ui.runOnIdle { assertTrue(sent.isEmpty()) }
    }
    @Test fun switchingNavigationSourceDiscardsTheOldConfirmation() {
        render(); open()
        ui.runOnIdle { navigation = navigation.copy(source = "real") }
        ui.onNodeWithText("만남 취소 확인").assertDoesNotExist()
        ui.runOnIdle { assertTrue(sent.isEmpty()) }
    }
    @Test fun realNavigationUsesTheSameExplicitMeetingCancellationContract() {
        navigation = navigation.copy(source = "real")
        render(); open()
        ui.onNodeWithText("돌아가기").performClick()
        ui.runOnIdle { assertTrue(sent.isEmpty()) }
        open(); ui.onNodeWithText("만남 취소 확인").performClick()
        ui.runOnIdle { assertEquals(listOf("MEETING_CANCEL" to originalBinding), sent); assertEquals(0, approvals) }
    }
}
