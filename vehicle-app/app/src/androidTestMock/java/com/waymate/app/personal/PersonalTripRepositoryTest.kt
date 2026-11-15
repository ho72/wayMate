package com.waymate.app.personal

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.restrictions.UxObservation
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger

/** Real Android HTTP, private preferences and AtomicFile; no demo repository or SDK commands. */
class PersonalTripRepositoryTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun await(condition: () -> Boolean) {
        val deadline=android.os.SystemClock.elapsedRealtime()+10000
        while (!condition() && android.os.SystemClock.elapsedRealtime()<deadline) Thread.sleep(40)
        assertTrue("Timed out waiting for repository", condition())
    }
    private class Observation { @Volatile var value = PersonalVehicleState() }
    private inner class Server : AutoCloseable {
        val socket=ServerSocket(0)
        val base="http://localhost:${socket.localPort}"
        val key=MessageDigest.getInstance("SHA-256").digest(base.toByteArray()).take(8).joinToString("") { "%02x".format(it.toInt() and 255) }
        val file=File(context.filesDir,"personal-trip-$key.json")
        val acks=AtomicInteger()
        @Volatile var large=false
        @Volatile var responseBytes=0
        @Volatile var offline=false
        @Volatile var revoked=false
        @Volatile var acknowledged=false
        @Volatile var savedBeforeAck=false
        @Volatile var deviceId: String?=null
        private val fixture=instrumentation.context.assets.open("personal-received.json").use { String(it.readBytes(),Charsets.UTF_8) }
        private val worker=Thread {
            while (!socket.isClosed) try {
                socket.accept().use { client ->
                    client.soTimeout=5000
                    val input=client.getInputStream().buffered()
                    fun line(): String { val out=java.io.ByteArrayOutputStream();while(true){val b=input.read();if(b<0||b==10)break;if(b!=13)out.write(b)};return out.toString("UTF-8") }
                    val path=line().split(" ")[1];val headers=mutableMapOf<String,String>()
                    while(true){val l=line();if(l.isEmpty())break;headers[l.substringBefore(':').lowercase()]=l.substringAfter(':').trim()}
                    val bytes=ByteArray(headers["content-length"]!!.toInt());var offset=0
                    while(offset<bytes.size){val n=input.read(bytes,offset,bytes.size-offset);if(n<0)break;offset+=n}
                    val body=JSONObject(String(bytes,Charsets.UTF_8))
                    deviceId=headers["x-waymate-device-id"]
                    val json=JSONObject(fixture);json.getJSONObject("device").put("id",deviceId)
                    if(path.endsWith("/ack")){
                        acks.incrementAndGet()
                        savedBeforeAck=file.isFile && JSONObject(file.readText()).getJSONObject("delivery").getString("id")==body.getString("deliveryId")
                        acknowledged=true
                    }
                    json.getJSONObject("delivery").put("acknowledgedAt",if(acknowledged) 1800000001000L else JSONObject.NULL)
                    if(revoked)json.put("status","revoked").put("pairing",JSONObject.NULL).put("delivery",JSONObject.NULL)
                    if(large){
                        val plan=json.getJSONObject("delivery").getJSONObject("snapshot").getJSONObject("trip").getJSONObject("plan")
                        plan.put("title","🌊".repeat(80)).put("destination","🌊".repeat(100)).put("summary","🌊".repeat(800))
                        val days=org.json.JSONArray()
                        repeat(14){day -> val stops=org.json.JSONArray();repeat(12){stops.put(JSONObject().put("time",JSONObject.NULL).put("title","🌊".repeat(100)).put("description","🌊".repeat(500)).put("category","walk").put("placeQuery","🌊".repeat(150)))};days.put(JSONObject().put("dayNumber",day+1).put("date",JSONObject.NULL).put("stops",stops))}
                        plan.put("days",days).put("notes",org.json.JSONArray(List(12){"🌊".repeat(300)}))
                    }
                    val ux=body.optJSONObject("ux")
                    if(ux!=null && (!ux.getBoolean("known")||ux.getBoolean("requiresDo")||ux.getInt("activeRestrictions")!=0||!ux.getBoolean("foreground")))json.put("canInteract",false).put("delivery",JSONObject.NULL)
                    val reply=(if(offline)JSONObject().put("error",JSONObject().put("code","OFFLINE")) else json).toString().toByteArray(Charsets.UTF_8)
                    responseBytes=reply.size
                    client.getOutputStream().apply {write("HTTP/1.1 ${if(offline) "503 Unavailable" else "200 OK"}\r\nContent-Type: application/json\r\nContent-Length: ${reply.size}\r\nConnection: close\r\n\r\n".toByteArray());write(reply);flush()}
                }
            }catch(_:Exception){ /* Close breaks accept; a failed client is isolated. */ }
        }.apply { isDaemon=true;start() }
        override fun close(){socket.close();worker.join(2000);file.deleteRecursively();File(file.path+".new").delete();context.getSharedPreferences("personal-device-$key",Context.MODE_PRIVATE).edit().clear().commit()}
    }
    @Test fun durableReceiptThenRestartRestoresWithoutAnotherAutomaticAck() {
        Server().use { server ->
            val observed=Observation();var repository:PersonalTripRepository?=null
            main { repository=PersonalTripRepository(context,{observed.value=it},server.base);repository!!.restriction(UxObservation(false,0));repository!!.resume() }
            try {
                await { observed.value.delivery!=null };assertEquals(0,server.acks.get());assertFalse(server.file.exists())
                main { repository!!.acceptTrip() };await { observed.value.delivery?.acknowledgedAt!=null }
                assertTrue(server.savedBeforeAck);assertEquals(1,server.acks.get());val firstId=server.deviceId
                main { repository!!.close();repository=PersonalTripRepository(context,{observed.value=it},server.base);repository!!.restriction(UxObservation(false,0));repository!!.resume() }
                await { observed.value.delivery?.acknowledgedAt!=null };assertEquals(firstId,server.deviceId);assertEquals(1,server.acks.get())
                assertTrue(JSONObject(server.file.readText()).getJSONObject("delivery").getLong("acknowledgedAt")>0)
            } finally { main { repository!!.close() } }
        }
    }
    @Test fun unknownDrivingOfflineAndRevocationHidePersonalContentWithoutAck() {
        Server().use { server ->
            val observed=Observation();lateinit var repository:PersonalTripRepository
            main { repository=PersonalTripRepository(context,{observed.value=it},server.base);repository.resume() }
            try {
                await {observed.value.phase=="blocked"};assertNull(observed.value.delivery)
                main {repository.restriction(UxObservation(false,0))};await {observed.value.delivery!=null}
                main {repository.restriction(UxObservation(true,80))};await {observed.value.phase=="blocked"};assertNull(observed.value.delivery);assertNull(observed.value.accountName)
                main {repository.restriction(UxObservation(false,0))};await {observed.value.delivery!=null};assertEquals(0,server.acks.get())
                server.offline=true;main {repository.refresh()};await {observed.value.phase=="offline"};assertNull(observed.value.delivery);assertNull(observed.value.accountName)
                server.offline=false;main {repository.refresh()};await {observed.value.delivery!=null}
                main {repository.acceptTrip()};await {observed.value.delivery?.acknowledgedAt!=null};assertTrue(server.file.exists())
                server.revoked=true;main {repository.refresh()};await {observed.value.phase=="revoked"};assertNull(observed.value.delivery);assertNull(observed.value.accountName);assertFalse(server.file.exists())
            } finally {main {repository.close()} }
        }
    }
    @Test fun failedDurableWriteNeverSendsReceipt() {
        Server().use { server ->
            val observed=Observation();lateinit var repository:PersonalTripRepository
            main {repository=PersonalTripRepository(context,{observed.value=it},server.base);repository.restriction(UxObservation(false,0));repository.resume()}
            try {
                await {observed.value.delivery!=null}
                assertTrue(server.file.mkdirs())
                File(server.file,"unwritable-target").writeText("Synthetic disk failure")
                main {repository.acceptTrip()}
                await {observed.value.phase=="offline"}
                assertEquals(0,server.acks.get())
                assertNull(observed.value.delivery)
            } finally {main {repository.close()} }
        }
    }

    @Test fun maximumUnicodeTripSurvivesRealHttpReaderAndDecoder() {
        Server().use { server ->
            server.large=true
            val observed=Observation();lateinit var repository:PersonalTripRepository
            main {repository=PersonalTripRepository(context,{observed.value=it},server.base);repository.restriction(UxObservation(false,0));repository.resume()}
            try {
                await {observed.value.delivery!=null}
                val trip=checkNotNull(observed.value.delivery)
                assertTrue(server.responseBytes>524288)
                assertTrue(server.responseBytes<1048576)
                assertEquals(14,trip.days.size)
                assertEquals(12,trip.days.last().stops.size)
                val description=trip.days.last().stops.last().description
                assertEquals(500,description.codePointCount(0,description.length))
                assertEquals(0,server.acks.get())
            } finally {main {repository.close()} }
        }
    }

}
