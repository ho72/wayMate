package com.waymate.app.qa

import android.graphics.Bitmap
import android.os.SystemClock
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.MainActivity
import com.waymate.app.ui.screens.handoff.movePortraitWindowRight
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Fixed scenario: actual production Activity/UI; O01-only decisions use the documented operator API. */
class ScenarioE2ETest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val output by lazy { File(instrumentation.targetContext.filesDir, "qa-e2e-portrait").apply { mkdirs() } }
    private fun window(): JSONObject {
        var value=JSONObject()
        ui.activityRule.scenario.onActivity {
            val position=IntArray(2)
            it.window.decorView.getLocationOnScreen(position)
            value=JSONObject().put("width",it.window.decorView.width).put("height",it.window.decorView.height)
                .put("x",position[0]).put("y",position[1]).put("fontScale",it.resources.configuration.fontScale)
        }
        return value
    }
    private fun portraitRight() {
        fun shell(command:String) {
            instrumentation.uiAutomation.executeShellCommand(command).use {
                ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
            }
        }
        instrumentation.waitForIdleSync()
        SystemClock.sleep(650)
        if(window().getInt("width")>1000) {
            shell("input tap 2546 720")
            shell("input swipe 2540 720 1700 720 600")
        }
        ui.waitUntil(15000) { window().getInt("width")==841 }
        SystemClock.sleep(500)
        if(window().getInt("x")<1700) movePortraitWindowRight()
        ui.waitUntil(10000) { window().getInt("x")==1718 && window().getInt("width")==841 }
        shell("input tap 2250 180")
        ui.waitUntil(10000) { ui.activity.hasWindowFocus() }
        assertEquals(1210,window().getInt("height"))
    }
    private fun request(path: String, actor: String = "operator", body: JSONObject? = null): JSONObject {
        val connection = URL("http://10.0.2.2:3000$path").openConnection() as HttpURLConnection
        connection.connectTimeout = 10000
        connection.readTimeout = 15000
        connection.setRequestProperty("X-Demo-Actor", actor)
        if (body != null) {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val status = connection.responseCode
        val value = (if (status < 400) connection.inputStream else connection.errorStream)
            .bufferedReader().use { JSONObject(it.readText()) }
        connection.disconnect()
        if (status >= 400) throw IllegalStateException("HTTP$status:$value")
        return value
    }
    private fun state(actor: String = "operator") = request("/api/state?view=$actor", actor)
    private fun awaitState(message: String, check: (JSONObject) -> Boolean): JSONObject {
        val deadline = SystemClock.uptimeMillis() + 25000
        var current = state()
        while (!check(current) && SystemClock.uptimeMillis() < deadline) {
            SystemClock.sleep(150)
            current = state()
        }
        assertTrue(message, check(current))
        return current
    }
    private fun post(type: String, target: JSONObject = JSONObject(), payload: JSONObject = JSONObject()): JSONObject {
        for (attempt in 0..5) {
            val current = state()
            val command = JSONObject().put("schemaVersion",4).put("runSeq",current.getInt("runSeq"))
                .put("runId",current.getString("runId")).put("commandId",UUID.randomUUID().toString())
                .put("expectedVersion",current.getInt("version")).put("actor","operator")
                .put("type",type).put("target",target).put("payload",payload)
            try {
                val result = request("/api/commands",body=command)
                File(output,"operator-api.jsonl").appendText(JSONObject().put("transport","O01 API simulation, not browser UI")
                    .put("command",command).put("response",result).toString()+"\n")
                return result
            } catch (failure: IllegalStateException) {
                if (attempt == 5 || !failure.message.orEmpty().startsWith("HTTP409:")) throw failure
                SystemClock.sleep(200)
            }
        }
        error("Operator command retry exhausted")
    }
    private fun operatorAction(key: String) {
        val current = awaitState("Operator action $key available") { it.getJSONObject("actionBindings").has(key) }
        val binding = current.getJSONObject("actionBindings").getJSONObject(key)
        post(binding.getString("commandType"),binding.getJSONObject("target"),binding.getJSONObject("payload"))
    }
    private fun respond(kind: String, decision: String) {
        val current = awaitState("Pending $kind response") { s ->
            val pending=s.getJSONObject("social").getJSONArray("pendingResponses")
            (0 until pending.length()).any { pending.getJSONObject(it).getString("kind")==kind }
        }
        val pending=current.getJSONObject("social").getJSONArray("pendingResponses")
        val target=(0 until pending.length()).map { pending.getJSONObject(it) }.first { it.getString("kind")==kind }
        post("B_RESPONSE",target,JSONObject().put("decision",decision))
    }
    private fun mockResult(outcome: String) {
        val current=awaitState("Unsettled mock navigation") { s ->
            val attempts=s.optJSONObject("mockNavigation")?.optJSONArray("attempts")
            attempts!=null && attempts.length()>0 && attempts.getJSONObject(attempts.length()-1).getString("outcome") in listOf("pending","unknown")
        }
        val attempts=current.getJSONObject("mockNavigation").getJSONArray("attempts")
        val latest=attempts.getJSONObject(attempts.length()-1)
        post("NAV_MOCK_RESULT",JSONObject().put("attemptId",latest.getString("attemptId")).put("operation",latest.getString("operation")),JSONObject().put("outcome",outcome))
    }
    private fun text(text: String, contains: Boolean = false) = ui.onAllNodesWithText(text,substring=contains)
    private fun waitText(text: String, contains: Boolean = false) {
        ui.waitUntil(25000) { this.text(text,contains).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun click(text: String, contains: Boolean = false) {
        val matcher=hasText(text,substring=contains) and hasClickAction()
        ui.waitUntil(25000) { ui.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        val node=ui.onAllNodes(matcher)[0]
        ui.waitUntil(25000) { !node.fetchSemanticsNode().config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled) }
        try { node.performScrollTo() } catch (_: AssertionError) { }
        node.performClick()
        SystemClock.sleep(450)
        ui.waitForIdle()
    }
    private fun capture(stage: String) {
        ui.waitForIdle()
        val measured=window()
        assertEquals("Required production portrait width",841,measured.getInt("width"))
        assertEquals("Required production portrait height",1210,measured.getInt("height"))
        assertEquals("Required production right slot",1718,measured.getInt("x"))
        val image=instrumentation.uiAutomation.takeScreenshot() ?: error("No screenshot")
        FileOutputStream(File(output,"$stage.png")).use { image.compress(Bitmap.CompressFormat.PNG,100,it) }
        image.recycle()
        val roots=ui.onAllNodes(isRoot(),useUnmergedTree=true)
        File(output,"$stage-tree.txt").writeText(roots.fetchSemanticsNodes().indices.joinToString("\n\n") { roots[it].printToString() })
        File(output,"$stage-state.json").writeText(JSONObject().put("operator",state()).put("car",state("car")).put("window",measured).toString(2))
        File(output,"stages.jsonl").appendText(JSONObject().put("stage",stage).put("status","observed").toString()+"\n")
    }
    private fun connectedHome() {
        val current=state("car")
        assertEquals("Mobile connection must be ready", "linked",current.getJSONObject("social").getJSONObject("connection").getString("status"))
        if (current.optJSONObject("handoff")?.optBoolean("acknowledged") != true) click("웹에서 준비한 여행 불러오기")
        waitText("솔바람 · 연결됨")
    }
    @Test fun fullMobileHandoffToBothEndingsAndRestore() {
        try {
            portraitRight()
            connectedHome()
            capture("s05-connected-home")
            ui.activityRule.scenario.recreate()
            portraitRight()
            waitText("솔바람 · 연결됨")
            assertTrue(state("car").getJSONObject("handoff").getBoolean("acknowledged"))
            capture("s05-restored-home")

            click("대화 고르기")
            click("콘텐츠 고르기")
            click("상대 캐릭터와 알아가기")
            click("솔바람은 여행할 때 뭘 제일 좋아해?")
            click("물어보기")
            waitText("천천히 가도 괜찮죠.",true)
            capture("s06-q1-profile-answer")
            click("다른 질문")
            click("처음 만나면 무슨 얘기를 하면 좋을까?")
            click("물어보기")
            waitText("둘 다 바다 산책이랑 카페를 좋아하니까",true)
            capture("s06-q2-shared-interests")
            click("콘텐츠 목록으로")

            click("에이전트로 말 전하기")
            click("카페에서 쉬었다가 잠깐 바다를 걷는 건 어떠세요?")
            click("이 말 보내기")
            waitText("확인한 말을 보낼까요?")
            capture("s07-message-confirmation")
            click("확인하고 전송")
            respond("message","reply")
            waitText("좋아요. 천천히 가도 괜찮죠? 저도 바다 보면서 쉬고 싶었어요.")
            click("저는 천천히 걷는 쪽이 좋아요. 사진은 가끔 한 장씩 찍고요.")
            click("답변 보내기")
            click("확인하고 전송")
            waitText("전달 완료:",true)
            capture("s07-message-and-followup-complete")
            click("콘텐츠 목록으로")

            click("둘이 직접 통화하기")
            click("동의하고 통화 제안하기")
            respond("call","accept")
            waitText("양쪽 통화 동의 확인")
            waitText("샘플을 들으려면 직접 시작해 주세요.")
            capture("s08-call-consent-no-autoplay")
            click("현재 문장부터 샘플 듣기")
            waitText("샘플 음성 재생 중")
            capture("s08-prepared-call-playback")
            click("샘플 일시중단")
            waitText("샘플 일시중단 · 자동으로 다시 시작하지 않아요.")
            capture("s08-call-paused")
            click("통화 종료")
            click("콘텐츠 목록으로")

            click("만남 제안 받기")
            waitText("추가 주행 7분 / 도착 후 대기 약 13분 / 첫 만남 20분")
            click("이 장소·시간 제안하기")
            click("확인")
            respond("meeting","accept")
            waitText("만남 카페를 경유지로 추가")
            capture("s09-mutual-meeting-consent")
            click("만남 카페를 경유지로 추가")
            click("모의 경유지 추가 승인")
            click("확인하고 진행")
            mockResult("failed")
            waitText("모의 실패 확인",true)
            capture("s10-add-failure-fresh-approval")
            click("실패한 추가 다시 승인")
            click("확인하고 진행")
            mockResult("unknown")
            waitText("모의 결과 미확인",true)
            capture("s10-unknown-lock")
            assertFalse(state().getJSONObject("actionBindings").has("MEETING_START"))
            val unknownId=state().getJSONObject("mockNavigation").getJSONArray("attempts").getJSONObject(1).getString("attemptId")
            ui.activityRule.scenario.recreate()
            portraitRight()
            SystemClock.sleep(1500)
            assertEquals("unknown",state().getJSONObject("mockNavigation").getJSONArray("attempts").getJSONObject(1).getString("outcome"))
            capture("s10-unknown-restored")
            mockResult("applied")
            waitText("승인한 장소로 이동 · 개념 시연")
            assertEquals(unknownId,state().getJSONObject("mockNavigation").getJSONObject("owned").getString("attemptId"))
            capture("s10-applied-travel")

            operatorAction("MEETING_START")
            waitText("14:15 · 바다쉼표 카페에서 인사해요")
            capture("s11-meeting-before-next-line")
            click("다음 대사 고르기")
            capture("s11-meeting-after-next-line")
            operatorAction("MEETING_END")
            waitText("14:35 · 남은 여행을 어떻게 이어갈까?")
            capture("s12-independent-choice-open")
            val attempts=state().getJSONObject("mockNavigation").getJSONArray("attempts").length()
            val combinations=listOf("together" to "together","together" to "my_agent","my_agent" to "together","my_agent" to "my_agent")
            combinations.forEachIndexed { round,(a,b) ->
                if(round>0) { operatorAction("REPLAY_FINAL"); waitText("14:35 · 남은 여행을 어떻게 이어갈까?") }
                if(round%2==1) {
                    operatorAction("B_FINAL_${b.uppercase()}")
                    assertTrue(state("car").getJSONObject("journey").getJSONObject("final").isNull("myChoice"))
                    assertEquals("pending",state().getJSONObject("journey").getString("phase"))
                    capture("s12-round${round+1}-b-first-hidden")
                }
                click(if(a=="together") "함께 여행 이어가기" else "내 캐릭터와 여행 이어가기")
                click("선택을 제출하기")
                click("확인하고 선택 제출")
                if(round%2==0) {
                    waitText("내가 제출한 선택:",true)
                    assertEquals("pending",state().getJSONObject("journey").getString("phase"))
                    capture("s12-round${round+1}-a-first-waiting")
                    operatorAction("B_FINAL_${b.uppercase()}")
                }
                val expected=if(a=="together"&&b=="together")"together" else "my_agent"
                awaitState("Final combination $a/$b") { it.getJSONObject("journey").getString("phase")==expected }
                waitText(if(expected=="together") "두 분 모두 함께를 선택했어요." else "이번 만남은 여기서 마무리하고, 각자의 여행을 이어가요.",expected=="together")
                assertEquals(attempts,state().getJSONObject("mockNavigation").getJSONArray("attempts").length())
                capture("s12-round${round+1}-$a-$b")
            }
            click("바다 보면서 좀 쉬고 싶어")
            waitText("좋아. 이번엔 나랑 천천히 가보자.",true)
            capture("s12-own-agent-continuation")
            ui.activityRule.scenario.recreate()
            portraitRight()
            waitText("각자의 여행 이어가기")
            assertEquals(4,state().getJSONObject("journey").getJSONObject("final").getInt("round"))
            capture("s12-ending-restored")
            File(output,"full-e2e-result.json").writeText(JSONObject().put("passed",true).put("scope","Actual production native UI S05-S12 at right841x1210; B/O01 decisions via operator API; mobile UI separately browser-validated").put("setup","Normal representative web-role API fixture with all selected intro/publication fields").put("window",window()).put("preservedCompletedState",true).toString(2))
        } catch(failure:Throwable) { try{capture("failure-full-e2e")}catch(_:Throwable){}; throw failure }
    }

    @Test fun safeResetAfterCompletedEnding() {
        try {
            portraitRight()
            val before=state()
            val oldRun=before.getString("runId")
            assertEquals(1,before.getJSONObject("mockNavigation").getJSONObject("route").getJSONArray("waypoints").length())
            operatorAction("RESET_BEGIN")
            waitText("wayMate · 처음부터 준비하기")
            capture("reset-before-cleanup")
            click("모의 경유지 제거 승인")
            click("확인하고 진행")
            mockResult("failed")
            waitText("모의 실패 확인",true)
            capture("reset-remove-failed")
            click("실패한 제거 다시 승인")
            click("확인하고 진행")
            mockResult("removed")
            awaitState("Same vehicle ACK opens new run") { it.getString("runId")!=oldRun && it.isNull("reset") }
            waitText("내 여행을 이어갈 준비가 됐나요?")
            capture("reset-new-run-same-vehicle-ack")
        } catch(failure:Throwable) { try{capture("failure-reset")}catch(_:Throwable){}; throw failure }
    }

    @Test fun cancellationConnectionConsistency() {
        try {
            connectedHome()
            click("만남 제안 받기")
            click("이 장소·시간 제안하기")
            click("확인")
            respond("meeting","accept")
            waitText("만남 카페를 경유지로 추가")
            click("만남 카페를 경유지로 추가")
            waitText("모의 내비 · 실제 SDK 호출 없음")
            capture("cancel-navigation-before")
            click("만남 취소")
            awaitState("Meeting cancelled") { it.getJSONObject("social").getJSONObject("meeting").getString("status")=="cancelled" }
            waitText("지금은 어떤 여행을 이어가고 싶어?")
            assertTrue(text("만남을 취소할까요?").fetchSemanticsNodes().isEmpty())
            capture("cancel-navigation-no-confirmation")
            capture("cancel-early-end-private-prompt")
            click("내 친구 홈으로")
            capture("cancel-home-connection-label")
            val current=state()
            File(output,"cancellation-observed.json").writeText(current.toString(2))
            File(output,"cancellation-findings.json").writeText(JSONObject()
                .put("setup","Normal web-role API fixture after main browser journey was already validated")
                .put("nativeUi","Actual MainActivity NavigationScreen cancel button")
                .put("confirmationShown",false)
                .put("meetingStatus",current.getJSONObject("social").getJSONObject("meeting").getString("status"))
                .put("expectedConnectionStatus","ended")
                .put("actualConnectionStatus",current.getJSONObject("social").getJSONObject("connection").getString("status"))
                .toString(2))
            assertEquals("docs_prototype02 says meeting cancellation ends connection", "ended",current.getJSONObject("social").getJSONObject("connection").getString("status"))
        } catch(failure:Throwable) { try{capture("failure-cancellation")}catch(_:Throwable){}; throw failure }
    }
}
