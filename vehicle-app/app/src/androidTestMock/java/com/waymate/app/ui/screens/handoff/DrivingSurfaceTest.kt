package com.waymate.app.ui.screens.handoff

import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.waymate.app.app.WayMateApp
import com.waymate.app.model.DrivingUiState
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class DrivingSurfaceTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()

    @Test fun drivingDisposesParkedConfirmationAndNeverSubmitsOrStartsAudioOnReturn() {
        var state by mutableStateOf(HandoffUiState(startEnabled = true))
        var submissions = 0
        var starts = 0
        ui.setContent {
            WayMateTheme {
                WayMateApp(
                    state, {}, { submissions++ }, {}, {}, { _, _ -> submissions++ }, {}, {}, {},
                    { _, _ -> submissions++ }, {}, {}, {}, {}, SpeechState("idle", true),
                    { starts++ }, {}, {}, {}, {},
                )
            }
        }
        ui.onNodeWithText("기본 시연 계획 확인하기").performClick()
        ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertIsDisplayed()
        ui.runOnIdle {
            state = state.copy(driving = DrivingUiState(
                mode = InteractionMode.DRIVING_LIMITED, canPlayPreparedAudio = true,
                audioValidUntil = SystemClock.elapsedRealtime() + 10000,
            ))
        }
        ui.onNodeWithTag("driving-mode").assertExists()
        ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertDoesNotExist()
        ui.onNodeWithText("경유지 추가 승인").assertDoesNotExist()
        ui.runOnIdle { assertEquals(0, starts); assertEquals(0, submissions) }
        ui.onNodeWithText("친구 한마디 듣기").performClick()
        ui.runOnIdle { assertEquals(1, starts); state = state.copy(driving = DrivingUiState()) }
        ui.onNodeWithTag("parked-mode").assertExists()
        ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertDoesNotExist()
        ui.runOnIdle { assertEquals(1, starts); assertEquals(0, submissions) }
    }

    @Test fun leaseExpiryDisablesNewAudioAndRenewalDoesNotStartPlayback() {
        var value by mutableStateOf(DrivingUiState(
            mode = InteractionMode.DRIVING_LIMITED, canPlayPreparedAudio = true,
            audioValidUntil = SystemClock.elapsedRealtime() + 1000,
        ))
        var starts = 0
        var stops = 0
        ui.setContent {
            WayMateTheme { DrivingScreen(value, null, SpeechState("idle", true), { starts++ }, { stops++ }) }
        }
        ui.waitUntil(5000) { stops > 0 }
        ui.onNodeWithText("친구 한마디 듣기").assertIsNotEnabled()
        ui.runOnIdle { value = value.copy(audioValidUntil = SystemClock.elapsedRealtime() + 10000) }
        ui.onNodeWithText("친구 한마디 듣기").assertIsEnabled()
        ui.runOnIdle { assertEquals(0, starts) }
        ui.onNodeWithText("친구 한마디 듣기").performClick()
        ui.runOnIdle { assertEquals(1, starts) }
    }
}
