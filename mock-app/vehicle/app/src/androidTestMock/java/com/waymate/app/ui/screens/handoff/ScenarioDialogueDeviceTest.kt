package com.waymate.app.ui.screens.handoff

import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.dialogue.ScenarioDialogue
import com.waymate.app.platform.dialogue.ScenarioDialogueController
import com.waymate.app.platform.speech.SpeechApi
import java.net.ServerSocket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Loopback-only tests. No OpenAI/ElevenLabs credentials, requests or paid generation. */
class ScenarioDialogueDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun await(check: () -> Boolean) {
        val end=SystemClock.uptimeMillis()+8000
        while (!check() && SystemClock.uptimeMillis()<end) SystemClock.sleep(30)
        assertTrue(check())
    }
    private inner class Server(val audio: Boolean = false, val release: CountDownLatch = CountDownLatch(0)) : AutoCloseable {
        val socket=ServerSocket(0)
        val requests=CopyOnWriteArrayList<JSONObject>()
        val worker=thread(isDaemon=true) {
            while (!socket.isClosed) try { socket.accept().use { client ->
                val input=client.getInputStream().buffered()
                fun line():String { val output=java.io.ByteArrayOutputStream(); while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)output.write(b)};return output.toString("UTF-8") }
                line(); val headers=mutableListOf<String>()
                while(true){val value=line();if(value.isEmpty())break;headers.add(value)}
                val length=headers.firstOrNull{it.startsWith("Content-Length:",true)}?.substringAfter(':')?.trim()?.toInt()?:0
                val bytes=ByteArray(length);var n=0
                while(n<length){val count=input.read(bytes,n,length-n);if(count<0)break;n+=count}
                requests.add(JSONObject(String(bytes,Charsets.UTF_8)))
                release.await(5,TimeUnit.SECONDS)
                val response=if(audio) instrumentation.context.assets.open("speech-test.mp3").use{it.readBytes()}
                    else JSONObject().put("scope","trip-scope").put("source","openai")
                        .put("lines",JSONObject().put("peer.Q1","솔바람은 조용한 바다 산책을 좋아해요.")
                            .put("drive.rest","가상 바다쉼터는 총 28분 예시 코스야.")).toString().toByteArray(Charsets.UTF_8)
                val type=if(audio)"audio/mpeg" else "application/json"
                client.getOutputStream().apply{write("HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: ${response.size}\r\nConnection: close\r\n\r\n".toByteArray());write(response);flush()}
            }}catch(_:Exception){}
        }
        override fun close(){release.countDown();socket.close();worker.join(1000)}
    }

    @Test fun nativeTransportLoadsOnePacketAndPollingDoesNotRegenerate() {
        Server().use { server ->
            val observed=CopyOnWriteArrayList<ScenarioDialogue>()
            lateinit var controller:ScenarioDialogueController
            instrumentation.runOnMainSync {controller=ScenarioDialogueController({observed.add(it)},"http://localhost:${server.socket.localPort}/api/agent/dialogue")
                controller.synchronize("trip-scope","revision-1",true)}
            try {
                await{observed.any{it.source=="openai"}}
                assertEquals("trip-scope",server.requests.single().getString("scope"))
                assertEquals("솔바람은 조용한 바다 산책을 좋아해요.",observed.last().lines["peer.Q1"])
                instrumentation.runOnMainSync {repeat(20){controller.synchronize("trip-scope","revision-1",true)}}
                SystemClock.sleep(150);assertEquals(1,server.requests.size)
                assertTrue(observed.last().permitsDriving("가상 바다쉼터는 총 28분 예시 코스야."))
            }finally{instrumentation.runOnMainSync{controller.close()}}
        }
    }

    @Test fun movingNeverStartsGenerationAndLatePreviousTripCannotUpdateTheScreen() {
        Server(release=CountDownLatch(1)).use {server->
            val observed=CopyOnWriteArrayList<ScenarioDialogue>();lateinit var controller:ScenarioDialogueController
            instrumentation.runOnMainSync{controller=ScenarioDialogueController({observed.add(it)},"http://localhost:${server.socket.localPort}/api/agent/dialogue");controller.synchronize("trip-scope","old",false)}
            SystemClock.sleep(150);assertTrue(server.requests.isEmpty())
            instrumentation.runOnMainSync{controller.synchronize("trip-scope","old",true)}
            await{server.requests.size==1}
            instrumentation.runOnMainSync{controller.synchronize("different-trip","new",false)}
            server.release.countDown();SystemClock.sleep(300)
            assertFalse(observed.any{it.source=="openai"})
            instrumentation.runOnMainSync{controller.close()}
        }
    }

    @Test fun sameRevisionWithDifferentScopeClearsPreviouslyLoadedDialogue() {
        Server().use { server ->
            val observed=CopyOnWriteArrayList<ScenarioDialogue>(); lateinit var controller:ScenarioDialogueController
            instrumentation.runOnMainSync { controller=ScenarioDialogueController({ observed.add(it) }, "http://localhost:${server.socket.localPort}/api/agent/dialogue");controller.synchronize("trip-scope", "revision-1", true) }
            try {
                await { observed.any { it.source == "openai" } }
                instrumentation.runOnMainSync { controller.synchronize("another-trip", "revision-1", false) }
                assertTrue(observed.last().lines.isEmpty())
                assertEquals(1, server.requests.size)
            } finally { instrumentation.runOnMainSync { controller.close() } }
        }
    }

    @Test fun drivingWhileRequestIsPendingDropsLateDialogue() {
        Server(release=CountDownLatch(1)).use { server ->
            val observed=CopyOnWriteArrayList<ScenarioDialogue>(); lateinit var controller:ScenarioDialogueController
            instrumentation.runOnMainSync { controller=ScenarioDialogueController({ observed.add(it) }, "http://localhost:${server.socket.localPort}/api/agent/dialogue");controller.synchronize("trip-scope", "revision-1", true) }
            try {
                await { server.requests.size == 1 }
                instrumentation.runOnMainSync { controller.synchronize("trip-scope", "revision-1", false) }
                server.release.countDown();SystemClock.sleep(250)
                assertFalse(observed.any { it.source == "openai" })
                assertFalse(observed.last().loading)
            } finally { instrumentation.runOnMainSync { controller.close() } }
        }
    }

    @Test fun downloadedAudioIsReusedButOtherVoicesAndTripsRemainSeparate() {
        Server(audio=true).use {server->
            val api=SpeechApi("http://localhost:${server.socket.localPort}/api/tts",mapOf("X-Demo-Actor" to "car"))
            val cache=java.io.File(instrumentation.targetContext.cacheDir,"speech-replay-${System.nanoTime()}").apply{mkdirs()}
            try {
                api.setScope("trip-1")
                val first=api.download("캐시 검수","dragon",cache);val expected=first.readBytes();first.delete()
                val second=api.download("캐시 검수","dragon",cache);assertArrayEquals(expected,second.readBytes());second.delete()
                assertEquals(1,server.requests.size)
                api.download("캐시 검수","bear",cache).delete();assertEquals(2,server.requests.size)
                api.setScope("trip-2");api.download("캐시 검수","dragon",cache).delete();assertEquals(3,server.requests.size)
            }finally{api.cancel();cache.deleteRecursively()}
        }
    }
}
