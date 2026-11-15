package com.waymate.app.ui.screens.handoff

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.BuildConfig
import com.waymate.app.MainActivity
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Opt-in 3008 mobile account gateway integration; pass local operator session arguments. */
class MobileScenarioIntegrationDeviceTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    private fun request(actor: String, path: String, body: JSONObject? = null): JSONObject {
        check(BuildConfig.API_BASE_URL.endsWith(":3008")) { "Dedicated mobile integration server required" }
        val args = InstrumentationRegistry.getArguments()
        val operator = actor == "operator"
        val command = body?.let { JSONObject(it.toString()) }
        val route = if (!operator) path else if (command == null) "/api/journey/operator?tripId=" + args.getString("tripId")
            else if (command.getString("type") == "B_RESPONSE") "/api/journey/respond" else "/api/journey/operate"
        if (operator && command != null) {
            command.remove("schemaVersion"); command.remove("actor"); command.put("tripId", args.getString("tripId"))
            if (command.getString("type") == "B_RESPONSE") command.remove("type")
        }
        val origin = if (operator) "http://localhost:3008" else BuildConfig.API_BASE_URL
        val c=URI(origin+route).toURL().openConnection() as HttpURLConnection
        try {
            c.connectTimeout=3000;c.readTimeout=5000
            if (operator) {
                c.setRequestProperty("Host", "127.0.0.1:3008")
                c.setRequestProperty("Cookie", args.getString("operatorCookie"))
                c.setRequestProperty("X-CSRF-Token", args.getString("operatorCsrf"))
                c.setRequestProperty("Origin", "http://127.0.0.1:3008")
            } else c.setRequestProperty("X-Demo-Actor",actor)
            if(command!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(command.toString().toByteArray())}}
            val code=c.responseCode;val response=(if(code<400)c.inputStream else c.errorStream).bufferedReader().use{it.readText()}
            check(code==200){"$actor $route: $code $response"}
            val result=JSONObject(response)
            return if (operator && command==null) result.getJSONObject("state") else result
        } finally { c.disconnect() }
    }
    private fun state(actor: String="operator")=request(actor,"/api/state?view=$actor")
    private fun await(check:()->Boolean){ui.waitUntil(20000){runCatching(check).getOrDefault(false)}}
    private fun click(label: String){
        try { await { ui.onAllNodesWithText(label).fetchSemanticsNodes().isNotEmpty() && runCatching{ui.onAllNodesWithText(label).onFirst().assertIsEnabled()}.isSuccess } }
        catch (e: Throwable) {
            val context=InstrumentationRegistry.getInstrumentation().targetContext
            val folder=File(context.filesDir,"mobile-integration-evidence").apply{mkdirs()}
            InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()?.let { bitmap ->
                File(folder,"failure.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
            }
            File(folder,"failure-ui.txt").writeText("Waiting for: $label\n"+ui.onRoot(useUnmergedTree=true).printToString())
            throw AssertionError("Waiting for button: $label",e)
        }
        val node=ui.onAllNodesWithText(label).onFirst();runCatching{node.performScrollTo()};node.performClick()
    }
    private fun back(){ui.runOnIdle{ui.activity.onBackPressedDispatcher.onBackPressed()}}
    private fun command(type:String,payload:JSONObject,target:JSONObject){
        // Heartbeats may advance version between GET and POST; only retry a rejected stale envelope.
        repeat(5){
            val s=state();val envelope=JSONObject().put("schemaVersion",4).put("runSeq",s.getInt("runSeq")).put("runId",s.getString("runId"))
                .put("commandId",UUID.randomUUID().toString()).put("expectedVersion",s.getInt("version")).put("actor","operator").put("type",type).put("target",target).put("payload",payload)
            try {request("operator","/api/commands",envelope);return} catch(e:IllegalStateException){if(!e.message.orEmpty().contains("STALE_STATE"))throw e}
        };error("Operator version did not settle")
    }
    private fun act(key:String){await{state().getJSONObject("actionBindings").has(key)};val b=state().getJSONObject("actionBindings").getJSONObject(key);command(b.getString("commandType"),b.getJSONObject("payload"),b.getJSONObject("target"))}
    private fun respond(kind:String,decision:String){
        fun pending():JSONObject?{val a=state().getJSONObject("social").getJSONArray("pendingResponses");return (0 until a.length()).map{a.getJSONObject(it)}.firstOrNull{it.getString("kind")==kind}}
        await{pending()!=null};command("B_RESPONSE",JSONObject().put("decision",decision),pending()!!)
    }

    @Test fun mobileTripThroughMessagesCallMeetingAndBothEndings() {
        assertEquals("2026-12-14",state("car").getJSONObject("trip").getString("date"))
        click("웹에서 준비한 여행 불러오기")
        await{state("car").optJSONObject("activeJourney")!=null}
        click("대화 고르기");click("이야기 시작");click("상대 캐릭터와 알아가기")
        val content=state("car").getJSONObject("content")
        click(content.getJSONArray("questions").getJSONObject(0).getString("text"));click("물어보기")
        ui.onNodeWithText("친구의 이야기를 들어요").assertExists();back()
        click("에이전트로 말 전하기")
        click(state("car").getJSONObject("content").getJSONArray("messages").getJSONObject(0).getString("text"))
        click("이 말 보내기");click("확인하고 전송");respond("message","reply")
        val reply=state("car").getJSONObject("content").getJSONArray("replies").getJSONObject(0).getString("text")
        click(reply);click("답변 확인");click("확인하고 전송");back()
        click("둘이 직접 통화하기");click("동의하고 통화 제안");respond("call","accept")
        click("통화 종료");click("대화 목록으로");click("만남 제안 받기")
        ui.onNodeWithText("14:15–14:35").assertExists()
        click("이 장소·시간 제안하기");click("확인");respond("meeting","accept")
        click("만남 카페 경유지 확인");click("모의 경유지 추가 승인");click("확인하고 진행")
        await { state().optJSONObject("mockNavigation")?.optJSONArray("attempts")?.length()?.let{it>0}==true }
        val attempts=state().getJSONObject("mockNavigation").getJSONArray("attempts");val attempt=attempts.getJSONObject(attempts.length()-1)
        command("NAV_MOCK_RESULT",JSONObject().put("outcome","applied"),JSONObject().put("attemptId",attempt.getString("attemptId")).put("operation",attempt.getString("operation")))
        act("MEETING_START");await{ui.onAllNodesWithText("바다쉼표 카페에서 인사해요").fetchSemanticsNodes().isNotEmpty()}
        act("MEETING_END")
        click("함께 여행 이어가기")
        click("선택 제출하기")
        click("확인하고 선택 제출")
        act("B_FINAL_TOGETHER")
        await{state().getJSONObject("journey").getString("phase")=="together"}
        await{ui.onAllNodesWithText("함께 여행 이어가기").fetchSemanticsNodes().isNotEmpty()}
        act("REPLAY_FINAL");click("내 캐릭터와 여행 이어가기");click("선택 제출하기");click("확인하고 선택 제출");act("B_FINAL_MY_AGENT")
        await{state().getJSONObject("journey").getString("phase")=="my_agent"}
        await{ui.onAllNodesWithText("각자의 여행 이어가기").fetchSemanticsNodes().isNotEmpty()}
        val folder=File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir,"mobile-integration-evidence").apply{mkdirs()}
        File(folder,"mobile-scenario-device.json").writeText(JSONObject().put("apiPort",3008).put("date","2026-12-14").put("message",true).put("call",true).put("meeting",true)
            .put("navigation","mock").put("endings",org.json.JSONArray(listOf("together","my_agent"))).put("microphone",false).put("providerAvailable",false).toString(2))
    }
}
