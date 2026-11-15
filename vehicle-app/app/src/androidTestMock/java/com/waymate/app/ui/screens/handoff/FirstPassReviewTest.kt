package com.waymate.app.ui.screens.handoff

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.model.*
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Real device playback/focus tests, separate from server domain and offline window fixtures. */
class PreparedSpeechDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)

    private fun await(check: () -> Boolean) {
        val until = System.currentTimeMillis() + 20000
        while (!check() && System.currentTimeMillis() < until) Thread.sleep(50)
        assertTrue("Timed out waiting for playback state", check())
    }

    @Test
    fun preparedAudioStartsCompletesAndInterruptionNeverResumes() {
        val events = java.util.concurrent.CopyOnWriteArrayList<SpeechState>()
        lateinit var speech: AgentSpeech
        main { speech = AgentSpeech(instrumentation.targetContext) { events.add(it) } }
        try {
            main { speech.speak("안녕하세요. 먼저 목소리로 인사드려요.") }
            await { events.any { it.phase == "speaking" && it.source == "prepared_sample" } }
            await { events.last().phase == "finished" }
            main { speech.speak("안녕하세요. 캐릭터한테 바다 먼저 보고 커피 마시는 걸 좋아한다고 들었어요.") }
            await { events.last().phase == "speaking" }
            main { speech.allowPlayback(false) }
            assertEquals("interrupted", events.last().phase)
            val stopped = events.count { it.phase == "speaking" }
            main { speech.allowPlayback(true) }
            Thread.sleep(1200)
            assertEquals(stopped, events.count { it.phase == "speaking" })
            assertEquals("interrupted", events.last().phase)
        } finally {
            main { speech.close() }
        }
    }

    @Test
    fun competingAudioFocusStopsPreparedAudioWithoutGainResume() {
        val events = java.util.concurrent.CopyOnWriteArrayList<SpeechState>()
        lateinit var speech: AgentSpeech
        val manager = instrumentation.targetContext.getSystemService(AudioManager::class.java)
        val request =
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setOnAudioFocusChangeListener {}
                .build()
        main {
            speech = AgentSpeech(instrumentation.targetContext) { events.add(it) }
            speech.speak("안녕하세요. 캐릭터한테 바다 먼저 보고 커피 마시는 걸 좋아한다고 들었어요.")
        }
        try {
            await { events.last().phase == "speaking" }
            main {
                assertEquals(
                    AudioManager.AUDIOFOCUS_REQUEST_GRANTED,
                    manager.requestAudioFocus(request),
                )
            }
            await { events.last().phase == "interrupted" }
            val count = events.count { it.phase == "speaking" }
            main { manager.abandonAudioFocusRequest(request) }
            Thread.sleep(1200)
            assertEquals(count, events.count { it.phase == "speaking" })
        } finally {
            main {
                manager.abandonAudioFocusRequest(request)
                speech.close()
            }
        }
    }
}

class FirstPassWindowTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()

    @Test
    fun callNeedsExplicitPlaybackAndConsentLossStopsIt() {
        var call by
            mutableStateOf(
                CallUiState(
                    id = "fixture-call",
                    status = "active",
                    canPlay = true,
                    lines = listOf(CallSampleLine("one", "A", "준비된 통화 대사")),
                )
            )
        var starts = 0
        var stops = 0
        ui.setContent {
            WayMateTheme {
                CallPanel(
                    ContentUiState(canInteract = true, call = call),
                    SpeechState("idle", true),
                    { starts++ },
                    { stops++ },
                    { _, _ -> },
                    {},
                )
            }
        }
        ui.runOnIdle { assertEquals(0, starts) }
        ui.onNodeWithText("현재 문장부터 샘플 듣기").performClick()
        ui.runOnIdle {
            assertEquals(1, starts)
            call = call.copy(status = "ended", canPlay = false)
        }
        ui.waitForIdle()
        ui.runOnIdle {
            assertTrue(stops > 0)
            assertEquals(1, starts)
        }
        ui.onNodeWithText("콘텐츠 목록으로").assertExists()
    }

    @Test
    fun resetWaitsForFreshRouteThenRequiresASeparateDriverConfirmation() {
        var state by mutableStateOf(ResetUiState(visible = true))
        var removals = 0
        val route = """{"second":{"destination":{"name":"42dot"}}}"""
        ui.setContent { WayMateTheme { ResetScreen(state, { _, _ -> removals++ }, {}, {}) } }
        ui.onNodeWithText("초기화를 위한 경유지 제거 승인").assertIsNotEnabled()
        ui.runOnIdle {
            state = state.copy(destination = "42dot", canRemove = true, reviewed = route)
        }
        ui.onNodeWithText("현재 목적지: 42dot").assertExists()
        ui.onNodeWithText("초기화를 위한 경유지 제거 승인").assertIsEnabled().performClick()
        ui.runOnIdle { assertEquals(0, removals) }
        ui.onNodeWithText("승인하고 제거").performClick()
        ui.runOnIdle { assertEquals(1, removals) }
    }

    @Test
    fun staleMockApprovalCannotBeConfirmedAfterBindingChanges() {
        val binding =
            """{"commandType":"NAV_APPROVE","target":{},"payload":{"operation":"add","source":"mock","reviewedRouteRevision":0}}"""
        var actions by mutableStateOf(mapOf("NAV_APPROVE" to binding))
        var approvals = 0
        ui.setContent {
            WayMateTheme {
                Column {
                    MockNavigationPanel(
                        NavigationUiState(
                            source = "mock",
                            destination = "D",
                            mockActions = actions,
                        ),
                        { _, _ -> approvals++ },
                    )
                }
            }
        }
        ui.onNodeWithText("모의 경유지 추가 승인").performClick()
        ui.runOnIdle {
            assertEquals(0, approvals)
            actions = emptyMap()
        }
        ui.onNodeWithText("확인하고 진행").assertIsNotEnabled()
        ui.runOnIdle { assertEquals(0, approvals) }
    }
}
