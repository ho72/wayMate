package com.waymate.app.ui.screens.handoff

import android.graphics.Bitmap
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.model.*
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.testing.LargeFontReviewActivity
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Offline UI fixtures: no repository, navigation driver, network, or speech engine is created. */
private val trip =
    Journey(
        null,
        1,
        "파도",
        "a-01",
        null,
        listOf("sea_walk", "cafe"),
        "2026-11-14",
        "15:20",
        "기존 개인 방문지",
        "내 숙소",
        "15:45",
        "16:00",
    )
private val speech = SpeechState("unavailable", false)
private const val route = """{"second":{"destination":{"name":"42dot"}}}"""
private val social =
    SocialUiState(
        visible = true,
        peerAlias = "솔바람",
        connectionStatus = "linked",
        meetingStatus = "confirmed",
        canInteract = true,
        actions = mapOf("MEETING_CANCEL" to "offline-fixture", "CONNECT_END" to "offline-fixture"),
    )

private fun evidence(name: String, data: JSONObject = JSONObject()) {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val dir = File(instrumentation.targetContext.filesDir, "window-review").apply { mkdirs() }
    File(dir, "$name.json").writeText(data.toString(2))
    val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
    File(dir, "$name.png").outputStream().use {
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
    }
    bitmap.recycle()
}

/** Pleos' documented horizontal three-finger gesture moves a portrait window to the other slot. */
private fun movePortraitWindowRight() {
    val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
    val down = SystemClock.uptimeMillis()
    val properties =
        Array(3) { index ->
            MotionEvent.PointerProperties().apply {
                id = index
                toolType = MotionEvent.TOOL_TYPE_FINGER
            }
        }
    fun send(action: Int, count: Int, x: Float) {
        val coordinates =
            Array(count) { index ->
                MotionEvent.PointerCoords().apply {
                    this.x = x
                    y = 300f + index * 100f
                    pressure = 1f
                    size = 1f
                }
            }
        val event =
            MotionEvent.obtain(
                down,
                SystemClock.uptimeMillis(),
                action,
                count,
                properties,
                coordinates,
                0,
                0,
                1f,
                1f,
                0,
                0,
                InputDevice.SOURCE_TOUCHSCREEN,
                0,
            )
        try {
            check(automation.injectInputEvent(event, true))
        } finally {
            event.recycle()
        }
    }
    send(MotionEvent.ACTION_DOWN, 1, 1250f)
    send(
        MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),
        2,
        1250f,
    )
    send(
        MotionEvent.ACTION_POINTER_DOWN or (2 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),
        3,
        1250f,
    )
    for (step in 1..10) {
        SystemClock.sleep(30)
        send(MotionEvent.ACTION_MOVE, 3, 1250f + 85f * step)
    }
    send(MotionEvent.ACTION_POINTER_UP or (2 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 3, 2100f)
    send(MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, 2100f)
    send(MotionEvent.ACTION_UP, 1, 2100f)
}

/** Run with the actual Pleos app window expanded to 1682x1210dp. */
class ExpandedWindowReviewTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()

    @Test
    fun weightedColumnsUseTheirAllocationWithoutAnExtra190DpGap() {
        var character = Rect.Zero
        var content = Rect.Zero
        var window = Rect.Zero
        var wide = false
        ui.setContent {
            WayMateTheme {
                Box(
                    Modifier.fillMaxSize().onGloballyPositioned {
                        window = Rect(0f, 0f, it.size.width.toFloat(), it.size.height.toFloat())
                    }
                ) {
                    CharacterScene(
                        "review",
                        character = { modifier, isWide ->
                            wide = isWide
                            Column(
                                modifier.onGloballyPositioned {
                                    val p = it.positionInRoot()
                                    character =
                                        Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height)
                                }
                            ) {
                                Text("캐릭터 열")
                            }
                        },
                        content = { modifier ->
                            Column(
                                modifier.onGloballyPositioned {
                                    val p = it.positionInRoot()
                                    content =
                                        Rect(p.x, p.y, p.x + it.size.width, p.y + it.size.height)
                                }
                            ) {
                                Text("내용 열")
                            }
                        },
                    )
                }
            }
        }
        ui.runOnIdle {
            assertEquals(
                "Expand the actual Pleos window before this class",
                1682f,
                window.width,
                1f,
            )
            assertEquals(1210f, window.height, 1f)
            assertTrue(wide)
            assertEquals(468f, character.width, 1f)
            assertEquals(1138f, content.width, 1f)
            assertEquals(28f, content.left - character.right, 1f)
            assertEquals(24f, character.left, 1f)
            assertEquals(24f, window.right - content.right, 1f)
        }
        evidence(
            "expanded-columns",
            JSONObject()
                .put("windowWidth", window.width)
                .put("windowHeight", window.height)
                .put("characterWidth", character.width)
                .put("contentWidth", content.width)
                .put("gap", content.left - character.right)
                .put("padding", character.left),
        )
    }

    @Test
    fun expandedEndingKeepsThe300DpCharacterAndBothChoicesUsable() {
        ui.setContent {
            WayMateTheme {
                EndingScreen(finalState("pending"), trip, speech, {}, {}, { _, _ -> }, {}, {}, {})
            }
        }
        ui.onRoot().assertWidthIsEqualTo(1682.dp)
        ui.onNodeWithContentDescription("블루 드래곤")
            .assertWidthIsEqualTo(468.dp)
            .assertHeightIsEqualTo(300.dp)
        ui.onNodeWithText("함께 여행 이어가기").assertIsDisplayed().performClick()
        ui.onNodeWithText("선택을 제출하기").assertIsDisplayed().performClick()
        ui.onNodeWithText("확인하고 선택 제출").assertIsDisplayed()
        ui.waitForIdle()
        evidence("expanded-ending")
    }
}

/** Run at 841x1210dp. The Activity's configuration scales both screen and Dialog text. */
class LargeFontWindowReviewTest {
    @get:Rule val ui = createAndroidComposeRule<LargeFontReviewActivity>()
    private var observedFontScale = 0f
    private var windowX = 0
    private val measuredTexts = JSONObject()

    private fun capture(name: String) =
        evidence(
            name,
            JSONObject()
                .put("fontScale", observedFontScale)
                .put("windowX", windowX)
                .put("activityFontScale", ui.activity.resources.configuration.fontScale)
                .put("texts", measuredTexts),
        )

    private fun show(content: @Composable () -> Unit) {
        ui.setContent {
            observedFontScale = LocalDensity.current.fontScale
            WayMateTheme { content() }
        }
        ui.onRoot().assertWidthIsEqualTo(841.dp).assertHeightIsEqualTo(1210.dp)
        // Pleos initially opens a new app in the primary slot. Use its three-finger gesture to
        // restore
        // the representative Driving View / native navigation / wayMate order.
        fun readWindowX(): Int {
            ui.runOnIdle {
                val location = IntArray(2)
                ui.activity.window.decorView.getLocationOnScreen(location)
                windowX = location[0]
            }
            return windowX
        }
        // Compose may finish its first layout before the window manager applies the slot offset.
        ui.waitUntil(timeoutMillis = 5000) { readWindowX() in listOf(853, 1718) }
        if (readWindowX() != 1718) {
            assertEquals("Expected the Pleos primary portrait slot", 853, windowX)
            movePortraitWindowRight()
            try {
                ui.waitUntil(timeoutMillis = 5000) { readWindowX() == 1718 }
            } catch (failure: AssertionError) {
                evidence("slot-setup-failure", JSONObject().put("windowX", readWindowX()))
                throw failure
            }
        }
        ui.onRoot().assertWidthIsEqualTo(841.dp).assertHeightIsEqualTo(1210.dp)
        ui.runOnIdle {
            assertEquals(1.3f, observedFontScale, .001f)
            assertEquals(1.3f, ui.activity.resources.configuration.fontScale, .001f)
        }
    }

    private fun touch(label: String) {
        ui.onNodeWithText(label).performScrollTo().assertIsDisplayed().performClick()
    }

    private fun fits(label: String) {
        val text = ui.onNodeWithText(label, useUnmergedTree = true)
        text.assertIsDisplayed()
        text.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { action ->
            val layouts = mutableListOf<TextLayoutResult>()
            assertTrue(action(layouts))
            assertTrue("Missing text layout: $label", layouts.isNotEmpty())
            for (result in layouts) {
                assertEquals(
                    "Dialog and screen must both use 130% text",
                    1.3f,
                    result.layoutInput.density.fontScale,
                    .001f,
                )
                assertFalse("Truncated text: $label", result.multiParagraph.didExceedMaxLines)
                for (line in 0 until result.lineCount) {
                    // Cached paragraph width can exceed actual text width. Check the rendered
                    // lines.
                    assertTrue(
                        "Right edge clipped: $label",
                        result.getLineRight(line) <= result.size.width + 1f,
                    )
                    assertTrue("Left edge clipped: $label", result.getLineLeft(line) >= -1f)
                    assertTrue(
                        "Bottom clipped: $label",
                        result.getLineBottom(line) <= result.size.height + 1f,
                    )
                }
                measuredTexts.put(
                    label,
                    JSONObject()
                        .put("fontScale", result.layoutInput.density.fontScale)
                        .put("width", result.size.width)
                        .put("height", result.size.height)
                        .put("lineCount", result.lineCount)
                        .put(
                            "rightmostLine",
                            (0 until result.lineCount).maxOf { result.getLineRight(it) },
                        )
                        .put("lastLineBottom", result.getLineBottom(result.lineCount - 1)),
                )
            }
        }
    }

    @Test
    fun homeActionsWrapAndStayTouchableAt130Percent() {
        var openedEnding = 0
        show {
            HandoffScreen(
                HandoffUiState(
                    journey = trip,
                    social = social,
                    ending = finalState("pending"),
                    content = ContentUiState(peerAlias = "솔바람"),
                ),
                {},
                {},
                {},
                {},
                { _, _ -> },
                {},
                { openedEnding++ },
            )
        }
        for (label in listOf("만남·여행 선택 다시 보기", "대화 고르기", "만남 상태 확인", "연결 종료")) {
            ui.onNodeWithText(label).performScrollTo()
            fits(label)
        }
        touch("만남·여행 선택 다시 보기")
        ui.runOnIdle { assertEquals(1, openedEnding) }
        capture("font130-home")
    }

    @Test
    fun questionsAndMessageConfirmationRemainReachableAt130Percent() {
        var sent = 0
        show {
            ContentScreen(
                ContentUiState(
                    visible = true,
                    blocked = false,
                    scope = "offline",
                    peerAlias = "솔바람",
                    canInteract = true,
                    questions =
                        listOf(
                            ContentQuestion(
                                "Q1",
                                "솔바람은 여행할 때 뭘 제일 좋아해?",
                                "천천히 가도 괜찮죠. 솔바람은 바다를 먼저 보고, 조용한 카페에서 커피 한 잔 하는 걸 좋아해요.",
                                true,
                            )
                        ),
                    messages = listOf(ContentPreset("M1", "카페에서 쉬었다가 잠깐 바다를 걷는 건 어떠세요?")),
                    actions = mapOf("MESSAGE_SEND_M1" to "offline-fixture"),
                ),
                trip,
                speech,
                {},
                {},
                { type, _ -> if (type == "MESSAGE_SEND") sent++ },
                {},
                {},
                {},
                {},
                {},
            )
        }
        touch("콘텐츠 고르기")
        touch("상대 캐릭터와 알아가기")
        touch("솔바람은 여행할 때 뭘 제일 좋아해?")
        touch("물어보기")
        ui.onNodeWithText("공개 프로필에 근거한 준비된 답변 · B에게 전송되지 않아요.").performScrollTo()
        fits("공개 프로필에 근거한 준비된 답변 · B에게 전송되지 않아요.")
        capture("font130-answer")
        touch("콘텐츠 목록으로")
        touch("에이전트로 말 전하기")
        touch("카페에서 쉬었다가 잠깐 바다를 걷는 건 어떠세요?")
        touch("이 말 보내기")
        fits("확인하고 전송")
        ui.runOnIdle { assertEquals(0, sent) }
        ui.onNodeWithText("확인하고 전송").performClick()
        ui.runOnIdle { assertEquals(1, sent) }
    }

    @Test
    fun bothFinalChoicesAndExplicitSubmissionFitAt130Percent() {
        var submitted = 0
        show {
            EndingScreen(
                finalState("pending"),
                trip,
                speech,
                {},
                {},
                { _, _ -> submitted++ },
                {},
                {},
                {},
            )
        }
        ui.onNodeWithText("함께 여행 이어가기").performScrollTo()
        fits("함께 여행 이어가기")
        fits("내 캐릭터와 여행 이어가기")
        val a = ui.onNodeWithText("함께 여행 이어가기").fetchSemanticsNode().boundsInRoot
        val b = ui.onNodeWithText("내 캐릭터와 여행 이어가기").fetchSemanticsNode().boundsInRoot
        assertEquals(a.width, b.width, 1f)
        assertEquals(a.height, b.height, 1f)
        touch("내 캐릭터와 여행 이어가기")
        touch("선택을 제출하기")
        fits("확인하고 선택 제출")
        ui.runOnIdle { assertEquals(0, submitted) }
        capture("font130-final-review")
        ui.onNodeWithText("확인하고 선택 제출").performClick()
        ui.runOnIdle { assertEquals(1, submitted) }
    }

    @Test
    fun ownEndingReplyAndScheduleCanBeScrolledAt130Percent() {
        show { EndingScreen(finalState("my_agent"), trip, speech, {}, {}, { _, _ -> }, {}, {}, {}) }
        touch("바다 보면서 좀 쉬고 싶어")
        ui.onNodeWithText("좋아. 이번엔 나랑 천천히 가보자. 원래 가려던 해변에서 잠깐 쉬어도 다음 일정은 지킬 수 있는 계획이야.")
            .performScrollTo()
        fits("좋아. 이번엔 나랑 천천히 가보자. 원래 가려던 해변에서 잠깐 쉬어도 다음 일정은 지킬 수 있는 계획이야.")
        capture("font130-own-ending")
        touch("내 일정 보기")
        ui.onNodeWithText("대화로 돌아가기").performScrollTo().assertIsDisplayed().performClick()
        ui.onNodeWithText("내 캐릭터와 계속하기").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun togetherEndingDialogueAndScheduleRemainReachableAt130Percent() {
        val line = "사진은 한 장만 찍고 천천히 걸을까요?"
        show {
            EndingScreen(
                finalState("together")
                    .copy(
                        lines =
                            listOf(
                                EndingLine("안내", "두 분 모두 함께를 선택했어요. 해변 산책 뒤 각자의 다음 일정으로 이어가요."),
                                EndingLine("B", line),
                                EndingLine("A", "좋아요. 오늘 여행 속도가 잘 맞네요."),
                            )
                    ),
                trip,
                speech,
                {},
                {},
                { _, _ -> },
                {},
                {},
                {},
            )
        }
        ui.onNodeWithText(line).performScrollTo()
        fits(line)
        capture("font130-together-ending")
        touch("다음 대사 고르기")
        touch("내 일정 보기")
        touch("대화로 돌아가기")
        ui.onNodeWithText("함께 여행 이어가기").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun meetingConsentAndNavigationApprovalFitAt130Percent() {
        var approved = 0
        var navigation by mutableStateOf(false)
        show {
            if (!navigation)
                MeetingScreen(
                    state = social,
                    onBack = {},
                    onAction = { _, _ -> },
                    onNavigation = { navigation = true },
                    onRetry = {},
                )
            else
                NavigationScreen(
                    NavigationUiState(
                        visible = true,
                        destination = "42dot",
                        canAdd = true,
                        reviewed = route,
                    ),
                    {},
                    { operation, _ -> if (operation == "add") approved++ },
                    {},
                    social,
                    { _, _ -> },
                    {},
                )
        }
        touch("만남 카페를 경유지로 추가")
        touch("경유지 추가 승인")
        fits("승인하고 추가")
        ui.runOnIdle { assertEquals(0, approved) }
        capture("font130-navigation-review")
        ui.onNodeWithText("승인하고 추가").performClick()
        ui.runOnIdle { assertEquals(1, approved) }
    }

    @Test
    fun resetRequiresAnExplicitConfirmationAt130Percent() {
        var removed = 0
        show {
            ResetScreen(
                ResetUiState(
                    visible = true,
                    destination = "42dot",
                    canRemove = true,
                    reviewed = route,
                ),
                { operation, _ -> if (operation == "remove") removed++ },
                {},
                {},
            )
        }
        touch("초기화를 위한 경유지 제거 승인")
        fits("승인하고 제거")
        fits("돌아가기")
        ui.runOnIdle { assertEquals(0, removed) }
        capture("font130-reset-review")
        ui.onNodeWithText("승인하고 제거").performClick()
        ui.runOnIdle { assertEquals(1, removed) }
    }
}

private fun finalState(phase: String) =
    EndingUiState(
        visible = true,
        scope = "offline-$phase",
        phase = phase,
        canInteract = true,
        blocked = false,
        cleanupRequired = true,
        actions =
            mapOf(
                "FINAL_CHOOSE_TOGETHER" to "offline-fixture",
                "FINAL_CHOOSE_MY_AGENT" to "offline-fixture",
            ),
        prompt = "이제 네 여행은 어떻게 이어가고 싶어? 바다 산책을 좋아한다고 했지.",
        answers =
            listOf(
                EndingAnswer(
                    "rest",
                    "바다 보면서 좀 쉬고 싶어",
                    "좋아. 이번엔 나랑 천천히 가보자. 원래 가려던 해변에서 잠깐 쉬어도 다음 일정은 지킬 수 있는 계획이야.",
                )
            ),
        closing = "네가 원하던 대로 천천히 쉬어가자.",
    )
