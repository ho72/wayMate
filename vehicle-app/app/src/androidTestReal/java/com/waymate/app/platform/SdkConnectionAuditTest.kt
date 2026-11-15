package com.waymate.app.platform

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.data.*
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.platform.navigation.RouteProbePolicy
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Read-only live SDK checks. Never add/remove a waypoint, change gear, or disable restrictions. */
class SdkConnectionAuditTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)

    private fun save(name: String, value: JSONObject) {
        val directory = File(context.filesDir, "sdk-audit").apply { mkdirs() }
        File(directory, "$name.json").writeText(value.toString(2))
    }

    @Test
    fun naviServiceReturnsDestinationWaypointsRouteAndPoiWithoutMutation() {
        for (permission in listOf("NAVI_ROUTE", "NAVI_ROUTE_SEARCH"))
            assertEquals(
                "Installed navigation permission: $permission",
                PackageManager.PERMISSION_GRANTED,
                context.checkSelfPermission("pleos.car.permission.$permission"),
            )
        val connected = CountDownLatch(1)
        val replies = CountDownLatch(4)
        val failure = AtomicReference<String?>()
        val destination = AtomicReference<DestinationInfo?>()
        val waypoints = AtomicReference<List<WaypointInfo>?>()
        val route = AtomicReference<RouteStateInfo?>()
        val trip = AtomicReference<TripInfo?>()
        val listener = object : NaviHelperEventListener {
            override fun onDestinationInfo(info: DestinationInfo) {
                if (destination.compareAndSet(null, info)) replies.countDown()
            }
            override fun onWayPointInfo(info: List<WaypointInfo>) {
                if (waypoints.compareAndSet(null, info)) replies.countDown()
            }
            override fun onRouteStateInfo(info: RouteStateInfo) {
                if (route.compareAndSet(null, info)) replies.countDown()
            }
            override fun onTripInfo(info: TripInfo) {
                if (trip.compareAndSet(null, info)) replies.countDown()
            }
            override fun onError(error: NaviErrorCode) { failure.set(error.toString()) }
        }
        lateinit var helper: NaviHelper
        main {
            helper = NaviHelper(context)
            helper.initialize(
                onConnected = { helper.addListener(listener); connected.countDown() },
                onFailed = { failure.set("initialize failed"); connected.countDown() },
            )
        }
        try {
            assertTrue("NaviHelper connection timeout", connected.await(15, TimeUnit.SECONDS))
            assertNull(failure.get())
            main {
                helper.getDestinationInfo()
                helper.getWaypointInfo()
                helper.getRouteStateInfo()
                helper.requestTrip(
                    TripRequest(
                        latitude = RouteProbePolicy.waypoint.latitude,
                        longitude = RouteProbePolicy.waypoint.longitude,
                        poiName = RouteProbePolicy.waypoint.name,
                        poiId = RouteProbePolicy.WAYPOINT_POI_ID, poiSubId = "0",
                    )
                )
            }
            assertTrue("SDK query callbacks; error=${failure.get()}", replies.await(20, TimeUnit.SECONDS))
            val d = checkNotNull(destination.get())
            val w = checkNotNull(waypoints.get())
            val r = checkNotNull(route.get())
            val points = checkNotNull(trip.get()).summary.routePoints.filter { it.pointType.name == "DESTINATION" }
            assertTrue("Prepare a native destination before the read-only audit", d.name.isNotBlank())
            assertEquals(1, points.size)
            assertEquals(RouteProbePolicy.WAYPOINT_POI_ID, points.single().poiId)
            save("navigation", JSONObject()
                .put("destinationName", d.name).put("destinationLatitude", d.latitude)
                .put("destinationLongitude", d.longitude).put("waypointCount", w.size)
                .put("naviMode", r.naviMode.name).put("isRouting", r.isRouting)
                .put("lookupPoiId", points.single().poiId)
                .put("lookupLatitude", points.single().latitude).put("lookupLongitude", points.single().longitude)
                .put("physicalMutationCalls", 0))
        } finally {
            main { helper.removeListener(listener); helper.release() }
        }
    }

    @Test
    fun productionRestrictionListenerReceivesKnownStateAndClearsOnStop() {
        val received = CountDownLatch(1)
        val current = AtomicReference<Boolean?>()
        lateinit var restrictions: VehicleRestrictions
        main {
            restrictions = VehicleRestrictions(context) {
                current.set(it)
                if (it != null) received.countDown()
            }
            restrictions.start()
        }
        try {
            assertTrue("CarUxRestrictions callback timeout", received.await(15, TimeUnit.SECONDS))
            save("restrictions", JSONObject().put("known", true).put("restricted", current.get()))
        } finally { main { restrictions.stop() } }
        assertNull("Explicit stop() must publish unknown", current.get())
    }

    @Test
    fun installedMainActivityDeclaresDoForTheRestrictedSurface() {
        @Suppress("DEPRECATION")
        val info = context.packageManager.getActivityInfo(
            android.content.ComponentName(context.packageName, "com.waymate.app.MainActivity"),
            PackageManager.GET_META_DATA,
        )
        assertTrue(info.metaData?.getBoolean("distractionOptimized", false) == true)
        save("manifest", JSONObject().put("distractionOptimized", true))
    }

    @Test
    fun recordAndroidTtsInitializationWithoutClaimingPleosSpeechSdkSupport() {
        val initialized = CountDownLatch(1)
        val result = AtomicReference<Int?>()
        lateinit var tts: TextToSpeech
        main { tts = TextToSpeech(context) { result.set(it); initialized.countDown() } }
        try {
            assertTrue("TTS initialization result timeout", initialized.await(15, TimeUnit.SECONDS))
            val report = JSONObject().put("initializationStatus", result.get()).put("pleosSpeechSdkIntegrated", false)
            main {
                report.put("androidEngines", JSONArray(tts.engines.map { it.name }))
                report.put("koreanLanguageStatus", if (result.get() == TextToSpeech.SUCCESS) tts.setLanguage(java.util.Locale.KOREAN) else JSONObject.NULL)
            }
            save("android-tts", report)
        } finally { main { tts.shutdown() } }
    }
}
