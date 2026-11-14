package com.waymate.app.personal

import android.graphics.Bitmap
import android.os.SystemClock
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.ui.screens.handoff.movePortraitWindowRight
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Isolated local QA only: requires the synthetic 3006 service and Console. Not a CI fixture. */
class PairingE2ETest {
    @get:Rule val ui=createAndroidComposeRule<PersonalTripActivity>()
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun shell(cmd:String){instrumentation.uiAutomation.executeShellCommand(cmd).use {ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()}}
    private fun console(path:String,method:String="GET"):JSONObject {
        val c=URL("http://10.0.2.2:8088$path").openConnection() as HttpURLConnection
        try {c.connectTimeout=3000;c.readTimeout=3000;c.requestMethod=method;assertEquals(200,c.responseCode)
            val body=c.inputStream.bufferedReader().use{it.readText()};return if(body.trim().startsWith("{"))JSONObject(body)else JSONObject()
        }finally{c.disconnect()}
    }
    private fun park(){console("/vehicle/controls?speed=0&accelerator=0&brake=0","PUT");console("/vehicle/gear?gear=Park","PUT")}
    private fun screenshot(name:String){val dir=File(instrumentation.targetContext.filesDir,"personal-e2e").apply{mkdirs()};val bmp=checkNotNull(instrumentation.uiAutomation.takeScreenshot());File(dir,"$name.png").outputStream().use{bmp.compress(Bitmap.CompressFormat.PNG,100,it)};bmp.recycle()}
    private fun exists(text:String)=ui.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    private fun portrait(){
        var width=0;var x=0
        fun read(){ui.activityRule.scenario.onActivity {width=it.window.decorView.width;val xy=IntArray(2);it.window.decorView.getLocationOnScreen(xy);x=xy[0]}}
        SystemClock.sleep(700);read()
        if(width>1000){shell("input tap 2546 720");shell("input swipe 2540 720 1700 720 600")}
        ui.waitUntil(15000){read();width==841};SystemClock.sleep(600);read()
        if(x<1000)movePortraitWindowRight()
        ui.waitUntil(15000){read();width==841&&x>1700}
        shell("am start --user 10 -n ai.umos.maps.android.navigation.app/.MainActivity")
        SystemClock.sleep(700);shell("input tap 2250 180")
        ui.waitUntil(15000){var focused=false;ui.activityRule.scenario.onActivity{focused=it.hasWindowFocus()};focused}
    }
    @Test fun sentTripNeedsDriverApprovalAndPersistsAcrossActivityRestartWithActualUxTransitions(){
        val client="waymate-personal-${UUID.randomUUID()}";val heartbeat=Executors.newSingleThreadScheduledExecutor()
        console("/browser/session?client=$client","POST")
        heartbeat.scheduleAtFixedRate({runCatching{console("/browser/session?client=$client","POST")}},1,1,TimeUnit.SECONDS)
        try{
            val until=SystemClock.uptimeMillis()+20000
            while(!console("/vehicle/state").getJSONObject("controls").getJSONObject("dds_ready").getBoolean("all")&&SystemClock.uptimeMillis()<until)SystemClock.sleep(100)
            park();portrait()
            ui.waitUntil(20000){exists("이 여행 받기")}
            ui.onNodeWithText("이 여행 받기").performScrollTo().performClick();ui.onNodeWithText("이 여행을 받을까요?").assertIsDisplayed();screenshot("receive-review-841")
            console("/vehicle/gear?gear=Drive","PUT");console("/vehicle/controls?speed=36&accelerator=0&brake=0","PUT")
            ui.waitUntil(20000){exists("정차 후 내 여행을 확인해 주세요.")}
            ui.onNodeWithText("이 여행을 받을까요?").assertDoesNotExist();ui.onNodeWithText("강릉에서 쉬어가는 하루").assertDoesNotExist();screenshot("driving-blocked-841")
            park();ui.waitUntil(20000){exists("이 여행 받기")};ui.onNodeWithText("이 여행을 받을까요?").assertDoesNotExist()
            ui.onNodeWithText("이 여행 받기").performScrollTo().performClick();ui.onNodeWithText("확인").performClick()
            ui.waitUntil(20000){exists("내가 받은 여행")};ui.onNodeWithText("내가 받은 여행").performScrollTo().assertIsDisplayed();screenshot("received-841")
            ui.onNodeWithText("다음 날").performScrollTo().performClick();ui.onNodeWithText("따뜻한 차 한 잔").performScrollTo().assertIsDisplayed();screenshot("received-day2-841")
            ui.activityRule.scenario.recreate();ui.waitUntil(20000){exists("내가 받은 여행")};ui.onNodeWithText("내가 받은 여행").performScrollTo().assertIsDisplayed();screenshot("restored-841")
        }finally{try{park()}finally{heartbeat.shutdownNow();console("/browser/session?client=$client&closing=1","POST")}}
    }
}
