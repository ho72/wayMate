package com.waymate.app.platform.navigation

import ai.pleos.playground.navi.constants.*
import ai.pleos.playground.navi.data.*
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AtomicFile
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.ui.theme.WayMateTheme
import java.io.File
import java.util.UUID
import kotlin.math.abs
import org.json.JSONArray
import org.json.JSONObject

/**
 * Debug-only, fixture-only SDK experiment. It grants no product NAV_APPROVE/NAV_REPORT capability.
 */
class NaviProbeActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var helper: NaviHelper
    private lateinit var restrictions: VehicleRestrictions
    private lateinit var file: AtomicFile
    private var journal = JSONObject().put("events", JSONArray()).put("pending", JSONObject.NULL)
    private var connected = false
    private var foreground = false
    private var restricted: Boolean? = null
    private var storageOkay = true
    private var destination: DestinationInfo? = null
    private var waypoints: List<WaypointInfo>? = null
    private var queriedAt = 0L
    private var queryStarted = 0L
    private var queryInFlight = false
    private var destinationReceived = false
    private var waypointsReceived = false
    private var routingCompleted = false
    private var result by mutableStateOf("NaviHelper 3.0.5 · 연결 대기")
    private var canPrepare by mutableStateOf(false)
    private var canAdd by mutableStateOf(false)
    private var canRemove by mutableStateOf(false)
    private val listener =
        object : NaviHelperEventListener {
            override fun onDestinationInfo(info: DestinationInfo) {
                main.post {
                    destination = info
                    destinationReceived = true
                    record(
                        "destination",
                        JSONObject()
                            .put("name", info.name)
                            .put("latitude", info.latitude)
                            .put("longitude", info.longitude)
                            .put("displayLatitude", info.displayLatitude)
                            .put("displayLongitude", info.displayLongitude)
                            .put("poiId", info.poiId),
                    )
                    observe()
                }
            }

            override fun onWayPointInfo(info: List<WaypointInfo>) {
                main.post {
                    waypoints = info
                    waypointsReceived = true
                    record(
                        "waypoints",
                        JSONArray(
                            info.map {
                                JSONObject()
                                    .put("name", it.name)
                                    .put("latitude", it.latitude)
                                    .put("longitude", it.longitude)
                            }
                        ),
                    )
                    observe()
                }
            }

            override fun onRouteStarted(info: RouteStartInfo) {
                main.post { record("route_started", info.toString()) }
            }

            override fun onRouteCancelled() {
                main.post {
                    record("route_cancelled")
                    if (!queryInFlight) query()
                }
            }

            override fun onRoutingCompleted() {
                main.post {
                    routingCompleted = true
                    record("routing_completed")
                    if (!queryInFlight) query()
                }
            }

            override fun onDestinationChanged() {
                main.post {
                    record("destination_changed")
                    if (!queryInFlight) query()
                }
            }

            override fun onWaypointChanged(info: WaypointChangedInfo) {
                main.post {
                    record("waypoint_changed")
                    if (!queryInFlight) query()
                }
            }

            override fun onError(error: NaviErrorCode) {
                main.post {
                    record("sdk_error", error.toString())
                    update()
                }
            }

            override fun onRouteStateInfo(info: RouteStateInfo) {
                main.post { record("route_state", info.toString()) }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        file = AtomicFile(File(filesDir, "navi-probe.json"))
        try {
            if (file.baseFile.exists())
                journal = JSONObject(String(file.readFully(), Charsets.UTF_8))
        } catch (_: Exception) {
            storageOkay = false
            result = "기존 시험 기록을 읽지 못했어요. 물리 호출 차단"
        }
        if (journal.optJSONObject("pending") != null) {
            journal.getJSONObject("pending").put("outcome", "unknown")
            persist()
        }
        helper = NaviHelper(this)
        restrictions =
            VehicleRestrictions(this) {
                restricted = it
                update()
            }
        setContent {
            WayMateTheme {
                Surface {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("실제 내비 SDK · 개발 시험", style = MaterialTheme.typography.headlineMedium)
                        Text(
                            "공식 예제 D: 42dot / M: 소프트웨어드림센터. 다른 경로는 덮어쓰지 않아요. unknown 작업은 자동 재호출하지 않아요."
                        )
                        Button(onClick = { query() }) { Text("실제 목적지·경유지 조회") }
                        Button(onClick = { dispatch("prepare") }, enabled = canPrepare) {
                            Text("빈 경로에 시험 목적지 D 설정")
                        }
                        Button(onClick = { dispatch("add") }, enabled = canAdd) {
                            Text("D 유지 · 시험 경유지 M 추가")
                        }
                        Button(onClick = { dispatch("remove") }, enabled = canRemove) {
                            Text("내 시험 경유지 M만 제거")
                        }
                        Text(result)
                    }
                }
            }
        }
        helper.initialize(
            onConnected = {
                main.post {
                    connected = true
                    helper.addListener(listener)
                    record("sdk_connected")
                    query()
                }
            },
            onFailed = { error ->
                main.post {
                    record("sdk_connection_failed", error.javaClass.simpleName)
                    update()
                }
            },
        )
    }

    override fun onResume() {
        super.onResume()
        foreground = true
        restrictions.start()
        if (connected) query()
    }

    override fun onPause() {
        foreground = false
        restrictions.stop()
        update()
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        if (connected) helper.removeListener(listener)
        helper.release()
        super.onDestroy()
    }

    private fun persist(): Boolean {
        if (!storageOkay) return false
        var stream: java.io.FileOutputStream? = null
        return try {
            stream = file.startWrite()
            stream.write(journal.toString(2).toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
            true
        } catch (_: Exception) {
            if (stream != null) file.failWrite(stream)
            storageOkay = false
            false
        }
    }

    private fun record(event: String, data: Any = JSONObject.NULL) {
        journal
            .getJSONArray("events")
            .put(
                JSONObject()
                    .put("seq", journal.getJSONArray("events").length() + 1)
                    .put("time", System.currentTimeMillis())
                    .put("event", event)
                    .put("data", data)
            )
        persist()
    }

    private fun query() {
        if (!connected || queryInFlight) return
        queryInFlight = true
        queryStarted = SystemClock.elapsedRealtime()
        destinationReceived = false
        waypointsReceived = false
        queriedAt = 0
        update()
        try {
            helper.getDestinationInfo()
            helper.getWaypointInfo()
            helper.getRouteStateInfo()
        } catch (e: Exception) {
            record("query_exception", e.javaClass.simpleName)
        }
        val token = queryStarted
        main.postDelayed(
            {
                if (queryInFlight && queryStarted == token) {
                    queryInFlight = false
                    record("query_timeout")
                    update()
                }
            },
            10000,
        )
    }

    private fun isD() =
        destination?.let {
            abs(it.latitude - 37.48544722) <= 0.00001 && abs(it.longitude - 127.03636666) <= 0.00001
        } == true

    private fun isM() =
        waypoints?.let {
            it.size == 1 &&
                abs(it[0].latitude - 37.41275833) <= 0.00001 &&
                abs(it[0].longitude - 127.09481944) <= 0.00001
        } == true

    private fun emptyDestination() =
        destination?.let { it.latitude == 0.0 && it.longitude == 0.0 && it.name.isBlank() } == true

    private fun observe() {
        if (!queryInFlight || !destinationReceived || !waypointsReceived) return
        queryInFlight = false
        queriedAt = SystemClock.elapsedRealtime()
        val pending = journal.optJSONObject("pending")
        if (pending != null && routingCompleted && isD()) {
            val op = pending.getString("operation")
            val verified = if (op == "add") isM() else waypoints?.isEmpty() == true
            if (verified) {
                pending
                    .put("outcome", if (op == "remove") "removed" else "applied")
                    .put("dispatch", "settled")
                record("verified", JSONObject(pending.toString()))
                journal.put("pending", JSONObject.NULL)
                if (op == "add") journal.put("ownsM", true)
                if (op == "remove") journal.put("ownsM", false)
                persist()
            }
        }
        update()
    }

    private fun dispatch(operation: String) {
        update()
        if (
            !(when (operation) {
                "prepare" -> canPrepare
                "add" -> canAdd
                else -> canRemove
            })
        )
            return
        val pending =
            JSONObject()
                .put("attemptId", UUID.randomUUID().toString())
                .put("source", "real")
                .put("operation", operation)
                .put("dispatch", "may_have_executed")
                .put("outcome", "pending")
        journal.put("pending", pending)
        routingCompleted = false
        // The durable dispatch record precedes every physical call, including the fixture
        // destination setup.
        if (!persist()) {
            update()
            return
        }
        record("dispatch", JSONObject(pending.toString()))
        if (!storageOkay || !foreground || restricted != false) {
            pending.put("dispatch", "not_started").put("outcome", "not_dispatched")
            persist()
            update()
            return
        }
        try {
            when (operation) {
                "prepare" ->
                    helper.requestRoute(
                        RouteInfo(
                            latitude = 37.48544722,
                            longitude = 127.03636666,
                            displayLatitude = null,
                            displayLongitude = null,
                            poiName = "42dot",
                            poiId = "36khp37hh8gqcm5nqhe5",
                            poiSubId = "0",
                            address = "서울시 강남구 남부순환로 2621",
                        )
                    )
                "add" ->
                    helper.addWaypoint(
                        RequestWaypointInfo(
                            latitude = 37.41275833,
                            longitude = 127.09481944,
                            waypointIndex = WaypointIndex.FIRST,
                            poiId = "36khp2hdj2cfcm5nqhe3",
                            poiName = "소프트웨어드림센터",
                            poiSubId = "0",
                            address = "경기도 성남시 수정구 창업로40번길 6",
                        )
                    )
                "remove" -> helper.removeWaypoint(WaypointIndex.FIRST)
            }
            record("call_returned", operation)
        } catch (e: Exception) {
            record("dispatch_exception", e.javaClass.simpleName)
        }
        queriedAt = 0
        update()
        query()
        main.postDelayed(
            {
                val current = journal.optJSONObject("pending")
                if (current?.optString("attemptId") == pending.getString("attemptId")) {
                    current.put("outcome", "unknown")
                    record("operation_unknown", JSONObject(current.toString()))
                    update()
                }
            },
            10000,
        )
    }

    private fun update() {
        val fresh = queriedAt > 0 && SystemClock.elapsedRealtime() - queriedAt < 15000
        val ready =
            storageOkay &&
                connected &&
                foreground &&
                restricted == false &&
                fresh &&
                journal.optJSONObject("pending") == null
        canPrepare = ready && emptyDestination() && waypoints?.isEmpty() == true
        canAdd = ready && isD() && waypoints?.isEmpty() == true
        canRemove = ready && isD() && isM() && journal.optBoolean("ownsM")
        val events = journal.getJSONArray("events")
        val tail =
            (maxOf(0, events.length() - 7) until events.length()).joinToString("\n") {
                events.getJSONObject(it).toString()
            }
        result =
            "SDK 연결: $connected / 제한: $restricted / 저장: $storageOkay\n목적지: ${destination?.name ?: "미확인"}\n경유지: ${waypoints?.map {it.name} ?: "미확인"}\n진행: ${journal.optJSONObject("pending")?.toString() ?: "대기"}\n\n$tail"
    }
}
