package com.waymate.app.platform

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.MainActivity
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

/** Real production Activity + real Console vehicle signals. Restores P/0; never changes a route. */
class DrivingModeTransitionDeviceTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun console(path: String, write: Boolean = false, method: String? = null): JSONObject {
        val connection = URL("http://10.0.2.2:8088$path").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 3000; connection.readTimeout = 3000
            connection.requestMethod = method ?: if (write) "PUT" else "GET"
            assertEquals("Console $path", 200, connection.responseCode)
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return if (body.trim().startsWith("{")) JSONObject(body) else JSONObject()
        } finally { connection.disconnect() }
    }

    private fun park() {
        console("/vehicle/controls?speed=0&accelerator=0&brake=0", true)
        console("/vehicle/gear?gear=Park", true)
    }

    private fun exists(tag: String) = ui.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
    private fun enabled(text: String) = ui.onAllNodesWithText(text).fetchSemanticsNodes().any {
        !it.config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled)
    }
    private fun portraitRight() {
        fun shell(command: String) {
            instrumentation.uiAutomation.executeShellCommand(command).use {
                android.os.ParcelFileDescriptor.AutoCloseInputStream(it).readBytes()
            }
        }
        var width = 0; var x = 0
        fun read() { ui.activityRule.scenario.onActivity {
            width = it.window.decorView.width
            val location = IntArray(2); it.window.decorView.getLocationOnScreen(location); x = location[0]
        } }
        SystemClock.sleep(600); read()
        if (width == 1682) {
            shell("input tap 2546 720"); shell("input swipe 2540 720 1700 720 600")
        }
        ui.waitUntil(15000) { read(); width == 841 }
        SystemClock.sleep(600); read()
        if (x < 1000) movePortraitWindowRight()
        ui.waitUntil(15000) { read(); x > 1700 && width == 841 }
        SystemClock.sleep(600); shell("input tap 2250 180")
        ui.waitUntil(15000) {
            var focus = false; ui.activityRule.scenario.onActivity { focus = it.hasWindowFocus() }; focus
        }
    }
    private fun journal() = File(context.filesDir, "navigation-journal-v1.json").readBytes()
    private fun phase(): String {
        var value = ""
        ui.activityRule.scenario.onActivity {
            val field = MainActivity::class.java.getDeclaredField("speech").apply { isAccessible = true }
            val speech = field.get(it)
            value = speech.javaClass.getDeclaredField("phase").apply { isAccessible = true }.get(speech) as String
        }
        return value
    }
    private fun capture(name: String, facts: JSONObject) {
        val directory = File(context.filesDir, "driving-mode-review").apply { mkdirs() }
        File(directory, "$name.json").writeText(facts.toString(2))
        val screenshot = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(directory, "$name.png").outputStream().use {
            screenshot.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        screenshot.recycle()
    }

    @Test fun consoleMovingSignalShowsDoCharacterSurfaceAndParkNeverResumesPlaybackOrApproval() {
        val before = journal()
        // The Console enables its DDS bridge only while a browser session is alive. Use the
        // same heartbeat endpoint as its UI, without a browser physics loop rewriting speed.
        val client = "waymate-driving-${UUID.randomUUID()}"
        val heartbeat = Executors.newSingleThreadScheduledExecutor()
        console("/browser/session?client=$client", method = "POST")
        heartbeat.scheduleAtFixedRate({
            runCatching { console("/browser/session?client=$client", method = "POST") }
        }, 1, 1, TimeUnit.SECONDS)
        try {
            val deadline = SystemClock.uptimeMillis() + 15000
            while (!console("/vehicle/state").getJSONObject("controls").getJSONObject("dds_ready").getBoolean("all") &&
                SystemClock.uptimeMillis() < deadline) SystemClock.sleep(100)
            park()
            portraitRight()
            ui.waitUntil(20000) { exists("parked-mode") }
            val initial = console("/vehicle/state")
            assertEquals("Park", initial.getJSONObject("gear").getJSONObject("actual").getString("value"))
            capture("parked", initial)
            if (ui.onAllNodesWithText("기본 시연 계획 확인하기").fetchSemanticsNodes().isNotEmpty()) {
                ui.waitUntil(20000) { enabled("기본 시연 계획 확인하기") }
                ui.onNodeWithText("기본 시연 계획 확인하기").assertIsEnabled().performClick()
                ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertIsDisplayed()
            }
            console("/vehicle/gear?gear=Drive", true)
            console("/vehicle/controls?speed=36&accelerator=0&brake=0", true)
            ui.waitUntil(20000) { exists("driving-mode") }
            ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertDoesNotExist()
            ui.onNodeWithText("기본 시연 계획 확인하기").assertDoesNotExist()
            ui.activityRule.scenario.onActivity {
                assertEquals(Lifecycle.State.RESUMED, it.lifecycle.currentState)
                assertTrue(it.window.decorView.isShown)
            }
            val moving = console("/vehicle/state")
            assertEquals("Drive", moving.getJSONObject("gear").getJSONObject("actual").getString("value"))
            assertTrue(moving.getJSONObject("controls").getDouble("speed_kph") > 0)
            ui.waitUntil(20000) { enabled("친구 한마디 듣기") }
            ui.onNodeWithText("친구 한마디 듣기").assertIsEnabled().performClick()
            ui.waitUntil(10000) { phase() == "speaking" }
            capture("driving", moving)
            park()
            ui.waitUntil(20000) { exists("parked-mode") }
            ui.waitUntil(5000) { phase() !in listOf("speaking", "preparing") }
            ui.onNodeWithText("이 준비로 여행을 시작할까요?").assertDoesNotExist()
            SystemClock.sleep(1200)
            assertFalse(phase() in listOf("speaking", "preparing"))
            capture("returned-parked", console("/vehicle/state"))
        } finally {
            try { park() } finally {
                heartbeat.shutdownNow()
                console("/browser/session?client=$client&closing=1", method = "POST")
            }
            assertArrayEquals("No SDK execution/journal change during a mode transition", before, journal())
        }
    }
}
