package com.waymate.app.platform.navigation

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.*
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
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
import org.json.JSONArray
import org.json.JSONObject

/**
 * Debug fixture experiment only. Never grants product navigation permission or retries a physical
 * call.
 */
class NaviProbeActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private val session = UUID.randomUUID().toString()
    private lateinit var helper: NaviHelper
    private lateinit var restrictions: VehicleRestrictions
    private lateinit var file: AtomicFile
    private var boot = -1
    private var journal = JSONObject().put("events", JSONArray()).put("pending", JSONObject.NULL)
    private var connected = false
    private var foreground = false
    private var closed = false
    private var restricted: Boolean? = null
    private var storageOkay = true
    private var querySeq = 0L
    private var batch: Batch? = null
    private var previous: ProbeSnapshot? = null
    private var latest: ProbeSnapshot? = null
    private var approval: Approval? = null
    private var result by mutableStateOf("SDK 연결 대기")
    private var canPrepare by mutableStateOf(false)
    private var canAdd by mutableStateOf(false)
    private var canRemove by mutableStateOf(false)
    private var canRecover by mutableStateOf(false)
    private var canReconcile by mutableStateOf(false)
    private var waypointPoi: VerifiedWaypointPoi? = null
    private var tripTarget: String? = null

    private data class Approval(val operation: String, val after: Long, val before: ProbeSnapshot)

    private class Batch(val seq: Long, val startedAt: Long) {
        var destination: ProbePoint? = null
        var waypoints: List<ProbePoint>? = null
        var route: RouteStateInfo? = null
    }

    private val poll =
        object : Runnable {
            override fun run() {
                if (closed) return
                if (connected && (foreground || journal.optJSONObject("pending") != null)) query()
                main.postDelayed(this, 1500)
            }
        }
    private val listener =
        object : NaviHelperEventListener {
            override fun onDestinationInfo(info: DestinationInfo) = deliver {
                val point = ProbePoint(info.latitude, info.longitude, info.name, info.poiId)
                record(
                    "destination",
                    point
                        .json()
                        .put("displayLatitude", info.displayLatitude)
                        .put("displayLongitude", info.displayLongitude)
                        .put("address", info.address)
                        .put("poiSubId", info.poiSubId)
                        .put("poiProvider", info.poiProvider),
                )
                batch?.destination = point
                completeBatch()
            }

            override fun onWayPointInfo(info: List<WaypointInfo>) = deliver {
                val points = info.map { ProbePoint(it.latitude, it.longitude, it.name, it.poiId) }
                record(
                    "waypoints",
                    JSONArray(
                        info.map {
                            ProbePoint(it.latitude, it.longitude, it.name, it.poiId)
                                .json()
                                .put("address", it.address)
                                .put("displayLatitude", it.displayLatitude)
                                .put("displayLongitude", it.displayLongitude)
                                .put("poiProvider", it.poiProvider)
                        }
                    ),
                )
                batch?.waypoints = points
                completeBatch()
            }

            override fun onRouteStateInfo(info: RouteStateInfo) = deliver {
                record(
                    "route_state",
                    JSONObject()
                        .put("naviMode", info.naviMode.name)
                        .put("isRouting", info.isRouting)
                        .put("termsAgreement", info.termsAgreement),
                )
                batch?.route = info
                completeBatch()
            }

            override fun onTripInfo(info: TripInfo) = deliver {
                record(
                    "trip_info",
                    JSONObject()
                        .put("distance", info.distance)
                        .put("eta", info.eta)
                        .put(
                            "points",
                            JSONArray(
                                info.summary.routePoints.map { p ->
                                    JSONObject()
                                        .put("latitude", p.latitude)
                                        .put("longitude", p.longitude)
                                        .put("name", p.poiName)
                                        .put("poiId", p.poiId)
                                        .put("pointType", p.pointType.name)
                                        .put("settingType", p.settingType.name)
                                }
                            ),
                        ),
                )
                if (tripTarget == "waypoint") {
                    val points =
                        info.summary.routePoints.filter { it.pointType.name == "DESTINATION" }
                    if (points.size == 1) {
                        val p = points.single()
                        val candidate =
                            VerifiedWaypointPoi(
                                p.poiId,
                                ProbePoint(p.latitude, p.longitude, p.poiName, p.poiId),
                                session,
                                SystemClock.elapsedRealtime(),
                            )
                        if (
                            RouteProbePolicy.validLookup(
                                candidate,
                                session,
                                SystemClock.elapsedRealtime(),
                            )
                        )
                            waypointPoi = candidate
                        record(
                            "waypoint_poi_lookup",
                            JSONObject()
                                .put("accepted", waypointPoi === candidate)
                                .put("poiId", p.poiId)
                                .put("point", candidate.point.json()),
                        )
                    }
                }
                tripTarget = null
                update()
            }

            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onRouteEnded() = deliver { record("legacy_route_ended") }

            override fun onRoutingCompleted() = deliver { record("routing_completed") }

            override fun onRouteStarted(info: RouteStartInfo) = deliver {
                record("route_started", info.toString())
            }

            override fun onRouteCancelled() = deliver { record("route_cancelled") }

            override fun onDestinationChanged() = deliver { record("destination_changed") }

            override fun onWaypointChanged(info: WaypointChangedInfo) = deliver {
                record("waypoint_changed", info.toString())
            }

            override fun onError(error: NaviErrorCode) = deliver {
                record("sdk_error", error.toString())
                update()
            }
        }

    private fun deliver(block: () -> Unit) {
        main.post { if (!closed) block() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        boot = Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
        file = AtomicFile(File(filesDir, "navi-probe.json"))
        try {
            if (file.baseFile.exists())
                journal = JSONObject(String(file.readFully(), Charsets.UTF_8))
        } catch (_: Exception) {
            storageOkay = false
        }
        if (!journal.has("attempts")) journal.put("attempts", JSONArray())
        journal.optJSONObject("pending")?.let {
            it.put("outcome", "unknown")
            if (!it.has("recoveryBaselineBoot")) it.put("recoveryBaselineBoot", boot)
        }
        record(
            "probe_session",
            JSONObject()
                .put("session", session)
                .put("bootCount", boot)
                .put("fixtureId", RouteProbePolicy.FIXTURE_ID),
        )
        helper = NaviHelper(this)
        restrictions =
            VehicleRestrictions(this) {
                restricted = it
                if (it != false) approval = null
                update()
            }
        setContent {
            WayMateTheme {
                Surface {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("실제 내비 SDK · 좌표 시험", style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "D 37.48544722, 127.03636666 / M 37.41275833, 127.09481944\nD는 좌표 요청, M은 SDK 조회로 위치를 먼저 확인한 POI ID를 사용합니다. 각 요청은 승인 후 한 번만 호출합니다."
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { query() }) { Text("목적지·경유지 조회") }
                            Button(onClick = { recoverBaseline() }, enabled = canRecover) {
                                Text("재부팅 후 빈 경로 복구 확인")
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { approve("prepare") }, enabled = canPrepare) {
                                Text("시험 D 설정")
                            }
                            Button(onClick = { approve("add") }, enabled = canAdd) {
                                Text("D 유지 · M 추가")
                            }
                            Button(onClick = { approve("remove") }, enabled = canRemove) {
                                Text("내 M만 제거")
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { readTrip(true) }) { Text("M POI 위치 확인") }
                            Button(onClick = { reconcilePending() }, enabled = canReconcile) {
                                Text("현재 관측으로 이전 요청 확인")
                            }
                        }
                        Text(result)
                    }
                }
            }
        }
        helper.initialize(
            onConnected = {
                deliver {
                    connected = true
                    helper.addListener(listener)
                    record("sdk_connected")
                    query()
                }
            },
            onFailed = { e ->
                deliver {
                    record("sdk_connection_failed", e.javaClass.simpleName)
                    update()
                }
            },
        )
        main.post(poll)
    }

    override fun onResume() {
        super.onResume()
        foreground = true
        restrictions.start()
        if (connected) query()
    }

    override fun onPause() {
        foreground = false
        approval = null
        restrictions.stop()
        update()
        super.onPause()
    }

    override fun onDestroy() {
        closed = true
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
                    .put("session", session)
                    .put("event", event)
                    .put("data", data)
            )
        persist()
    }

    private fun ProbePoint.json() =
        JSONObject()
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("name", name)
            .put("poiId", poiId)

    private fun ProbeSnapshot.json() =
        JSONObject()
            .put("session", sessionId)
            .put("querySeq", querySeq)
            .put("startedAt", startedAt)
            .put("completedAt", completedAt)
            .put("destination", destination.json())
            .put("waypoints", JSONArray(waypoints.map { it.json() }))
            .put("naviMode", naviMode)
            .put("isRouting", isRouting)

    private fun readTrip(waypoint: Boolean = false) {
        if (!connected || tripTarget != null) return
        tripTarget = if (waypoint) "waypoint" else "destination"
        val d = if (waypoint) RouteProbePolicy.waypoint else RouteProbePolicy.destination
        val id = if (waypoint) RouteProbePolicy.WAYPOINT_POI_ID else ""
        record("trip_query", d.json().put("poiId", id).put("target", tripTarget))
        try {
            helper.requestTrip(
                TripRequest(
                    latitude = d.latitude,
                    longitude = d.longitude,
                    poiId = id,
                    poiName = d.name,
                    poiSubId = "0",
                )
            )
        } catch (e: Exception) {
            tripTarget = null
            record("trip_query_exception", e.javaClass.simpleName)
        }
        main.postDelayed(
            {
                if (tripTarget != null) {
                    record("trip_query_timeout", tripTarget!!)
                    tripTarget = null
                    update()
                }
            },
            10000,
        )
    }

    private fun reconcilePending() {
        update()
        if (!canReconcile) return
        val p = journal.getJSONObject("pending")
        val op = p.getString("operation")
        p.put("reporterSession", session)
            .put("outcome", if (op == "remove") "removed" else "applied")
            .put("dispatch", "settled")
            .put("resolution", "reconciled")
            .put("evidence", JSONArray(listOf(previous!!.json(), latest!!.json())))
        if (op == "add") journal.put("ownsM", true).put("ownerAddAttempt", p.getString("attemptId"))
        if (op == "remove") journal.put("ownsM", false)
        attachVerification(p, latest!!)
        finishAttempt(p, "verified_after_restart")
        update()
    }

    private fun query() {
        if (
            !connected ||
                batch != null ||
                closed ||
                !storageOkay ||
                !RouteProbePolicy.queryReady(latest, SystemClock.elapsedRealtime())
        )
            return
        val q = Batch(++querySeq, SystemClock.elapsedRealtime())
        batch = q
        record("query_begin", JSONObject().put("querySeq", q.seq).put("startedAt", q.startedAt))
        try {
            helper.getDestinationInfo()
            helper.getWaypointInfo()
            helper.getRouteStateInfo()
        } catch (e: Exception) {
            record("query_exception", e.javaClass.simpleName)
        }
        main.postDelayed(
            {
                if (batch === q) {
                    batch = null
                    approval = null
                    record("query_timeout", q.seq)
                    update()
                }
            },
            5000,
        )
    }

    private fun completeBatch() {
        val q = batch ?: return
        val d = q.destination ?: return
        val w = q.waypoints ?: return
        val r = q.route ?: return
        val snapshot =
            ProbeSnapshot(
                session,
                q.seq,
                q.startedAt,
                SystemClock.elapsedRealtime(),
                d,
                w,
                r.naviMode.name,
                r.isRouting,
            )
        batch = null
        previous = latest
        latest = snapshot
        record("route_snapshot", snapshot.json())
        val intent = approval
        if (intent != null && snapshot.startedAt > intent.after) {
            approval = null
            if (
                SystemClock.elapsedRealtime() - intent.after <= 5000 &&
                    foreground &&
                    restricted == false &&
                    sameRoute(intent.before, snapshot) &&
                    permitted(intent.operation, snapshot)
            )
                dispatch(intent.operation, snapshot)
            else record("approval_not_dispatched", "경로/제한/화면 또는 유효기간 변경")
        }
        val pending = journal.optJSONObject("pending")
        if (
            pending != null &&
                pending.optString("executorSession") == session &&
                RouteProbePolicy.verified(
                    pending.getString("operation"),
                    previous,
                    snapshot,
                    pending.getLong("dispatchAt"),
                    waypointPoi,
                )
        ) {
            val op = pending.getString("operation")
            pending
                .put("outcome", if (op == "remove") "removed" else "applied")
                .put("dispatch", "settled")
                .put("resolution", "reconciled")
                .put("evidence", JSONArray(listOf(previous!!.json(), snapshot.json())))
            if (op == "add")
                journal.put("ownsM", true).put("ownerAddAttempt", pending.getString("attemptId"))
            if (op == "remove") journal.put("ownsM", false)
            attachVerification(pending, snapshot)
            finishAttempt(pending, "verified")
        }
        update()
        if (approval != null) main.postDelayed({ query() }, 50)
    }

    private fun sameRoute(a: ProbeSnapshot, b: ProbeSnapshot) =
        a.destination.sameIdentity(b.destination) &&
            a.waypoints.size == b.waypoints.size &&
            a.waypoints.zip(b.waypoints).all { (x, y) -> x.sameIdentity(y) } &&
            a.naviMode == b.naviMode &&
            !b.isRouting

    private fun permitted(op: String, s: ProbeSnapshot): Boolean =
        when (op) {
            "prepare" -> s.emptyBaseline && !journal.optBoolean("ownsM")
            "add" ->
                RouteProbePolicy.target("prepare", s) &&
                    RouteProbePolicy.validLookup(
                        waypointPoi,
                        session,
                        SystemClock.elapsedRealtime(),
                    )
            "remove" ->
                journal.optBoolean("ownsM") &&
                    RouteProbePolicy.target("add", s, waypointPoi) &&
                    journal.optJSONObject("ownedWaypoint")?.let {
                        pointFromJson(it).sameIdentity(s.waypoints.single())
                    } == true &&
                    journal.optJSONObject("ownedDestination")?.let {
                        pointFromJson(it).sameIdentity(s.destination)
                    } == true
            else -> false
        }

    private fun approve(op: String) {
        val s = latest ?: return
        update()
        if (
            !(when (op) {
                "prepare" -> canPrepare
                "add" -> canAdd
                else -> canRemove
            })
        )
            return
        approval = Approval(op, SystemClock.elapsedRealtime(), s)
        record("user_approval", JSONObject().put("operation", op).put("reviewedSnapshot", s.json()))
        update()
        main.postDelayed({ query() }, 50)
    }

    private fun dispatch(op: String, before: ProbeSnapshot) {
        if (
            !storageOkay ||
                !foreground ||
                restricted != false ||
                journal.optJSONObject("pending") != null ||
                !permitted(op, before)
        )
            return
        val at = SystemClock.elapsedRealtime()
        val requested =
            when (op) {
                "prepare" -> RouteProbePolicy.destination.json()
                "add" -> RouteProbePolicy.waypoint.json()
                else -> JSONObject().put("slot", "FIRST")
            }
        requested.put("poiId", if (op == "add") RouteProbePolicy.WAYPOINT_POI_ID else "")
        val pending =
            JSONObject()
                .put("attemptId", UUID.randomUUID().toString())
                .put("source", "real")
                .put("fixtureId", RouteProbePolicy.FIXTURE_ID)
                .put("operation", op)
                .put(
                    "requestMode",
                    when (op) {
                        "prepare" -> "coordinate_only"
                        "add" -> "validated_poi"
                        else -> "owned_first_slot"
                    },
                )
                .put("executorSession", session)
                .put("bootCount", boot)
                .put("recoveryBaselineBoot", boot)
                .put("dispatchAt", at)
                .put("dispatch", "may_have_executed")
                .put("outcome", "pending")
                .put("before", before.json())
                .put("request", requested)
        if (op == "add")
            pending.put(
                "poiLookup",
                waypointPoi?.let {
                    JSONObject()
                        .put("poiId", it.poiId)
                        .put("point", it.point.json())
                        .put("session", it.sessionId)
                        .put("receivedAt", it.receivedAt)
                },
            )
        journal.put("pending", pending)
        if (!persist()) {
            update()
            return
        }
        record("dispatch", JSONObject(pending.toString()))
        if (!storageOkay || !foreground || restricted != false) {
            pending.put("dispatch", "not_started").put("outcome", "not_dispatched")
            finishAttempt(pending, "not_dispatched")
            update()
            return
        }
        // D excludes the stale example ID. M uses only the POI independently verified before
        // approval.
        try {
            when (op) {
                "prepare" -> {
                    val route =
                        RouteInfo(
                            latitude = RouteProbePolicy.destination.latitude,
                            longitude = RouteProbePolicy.destination.longitude,
                            displayLatitude = null,
                            displayLongitude = null,
                            poiName = "42dot",
                            poiId = "",
                            poiSubId = "0",
                            address = "서울시 강남구 남부순환로 2621",
                        )
                    record("sdk_payload", route.toString())
                    if (storageOkay) helper.requestRoute(route)
                }
                "add" -> {
                    val point =
                        RequestWaypointInfo(
                            latitude = RouteProbePolicy.waypoint.latitude,
                            longitude = RouteProbePolicy.waypoint.longitude,
                            waypointIndex = WaypointIndex.FIRST,
                            poiId = RouteProbePolicy.WAYPOINT_POI_ID,
                            poiName = "소프트웨어드림센터",
                            poiSubId = "0",
                            address = "경기도 성남시 수정구 창업로40번길 6",
                        )
                    record("sdk_payload", point.toString())
                    if (storageOkay) helper.addWaypoint(point)
                }
                "remove" -> helper.removeWaypoint(WaypointIndex.FIRST)
            }
            record("call_returned", op)
        } catch (e: Exception) {
            record("dispatch_exception", e.javaClass.simpleName)
        }
        previous = null
        latest = null
        update()
        main.postDelayed({ query() }, 250)
        main.postDelayed(
            {
                val active = journal.optJSONObject("pending")
                if (active?.optString("attemptId") == pending.getString("attemptId")) {
                    active.put("outcome", "unknown")
                    record("operation_unknown", JSONObject(active.toString()))
                    update()
                }
            },
            10000,
        )
    }

    private fun pointFromJson(p: JSONObject) =
        ProbePoint(
            p.getDouble("latitude"),
            p.getDouble("longitude"),
            p.optString("name"),
            p.optString("poiId"),
        )

    private fun attachVerification(attempt: JSONObject, s: ProbeSnapshot) {
        val op = attempt.getString("operation")
        val missing =
            op == "add" &&
                s.waypoints.single().latitude == 0.0 &&
                s.waypoints.single().longitude == 0.0
        attempt.put(
            "verificationBasis",
            if (missing) "current_waypoint_poi_id_and_independent_sdk_lookup"
            else "route_snapshot_coordinates_and_slot_count",
        )
        if (op == "add") {
            journal
                .put("ownedWaypoint", s.waypoints.single().json())
                .put("ownedDestination", s.destination.json())
            waypointPoi?.let {
                attempt.put(
                    "verificationLookup",
                    JSONObject()
                        .put("poiId", it.poiId)
                        .put("point", it.point.json())
                        .put("session", it.sessionId)
                        .put("receivedAt", it.receivedAt),
                )
            }
        }
        if (op == "remove") journal.remove("ownedWaypoint")
    }

    private fun finishAttempt(attempt: JSONObject, event: String) {
        journal.getJSONArray("attempts").put(JSONObject(attempt.toString()))
        journal.put("pending", JSONObject.NULL)
        record(event, JSONObject(attempt.toString()))
    }

    private fun recoverBaseline() {
        update()
        if (!canRecover) return
        val p = journal.getJSONObject("pending")
        p.put("resolution", "recovered_baseline")
            .put("recoveryProcedureId", RouteProbePolicy.RECOVERY_ID)
            .put("recoveryBootCount", boot)
            .put("recoveryEvidence", JSONArray(listOf(previous!!.json(), latest!!.json())))
        finishAttempt(p, "baseline_recovered")
        update()
    }

    private fun update() {
        val now = SystemClock.elapsedRealtime()
        val s = latest
        val fresh = s != null && now - s.completedAt < 4000
        val ready =
            storageOkay &&
                connected &&
                foreground &&
                restricted == false &&
                fresh &&
                approval == null &&
                journal.optJSONObject("pending") == null
        canPrepare = ready && permitted("prepare", s!!)
        canAdd = ready && permitted("add", s!!)
        canRemove = ready && permitted("remove", s!!)
        val p = journal.optJSONObject("pending")
        canRecover =
            storageOkay &&
                connected &&
                foreground &&
                restricted == false &&
                fresh &&
                p != null &&
                s != null &&
                RouteProbePolicy.recoverable(
                    p.optString("operation"),
                    p.optInt("recoveryBaselineBoot", -1),
                    boot,
                    previous,
                    s,
                    ownedEmptyTrial =
                        p.optString("fixtureId") == RouteProbePolicy.FIXTURE_ID &&
                            (0 until journal.getJSONArray("attempts").length()).any { index ->
                                val a = journal.getJSONArray("attempts").getJSONObject(index)
                                a.optString("fixtureId") == RouteProbePolicy.FIXTURE_ID &&
                                    a.optString("operation") == "prepare" &&
                                    a.optString("outcome") == "applied"
                            },
                )
        canReconcile =
            storageOkay &&
                connected &&
                foreground &&
                restricted == false &&
                fresh &&
                p != null &&
                s != null &&
                p.optInt("bootCount", -1) == boot &&
                RouteProbePolicy.verified(
                    p.optString("operation"),
                    previous,
                    s,
                    p.optLong("dispatchAt", Long.MAX_VALUE),
                    waypointPoi,
                )
        val attempts = journal.getJSONArray("attempts")
        val completed =
            (0 until attempts.length()).joinToString("\n") {
                val a = attempts.getJSONObject(it)
                "${a.optString("operation")} : ${a.optString("outcome")} / ${a.optString("resolution")}"
            }
        result =
            "SDK: $connected / 제한: $restricted / 저장: $storageOkay / boot: $boot\n목적지: ${s?.destination}\n경유지: ${s?.waypoints}\n상태: ${s?.naviMode} / routing=${s?.isRouting}\nM POI 검증: ${waypointPoi?.point}\n진행: ${p?.optString("operation") ?: "없음"} / ${p?.optString("outcome") ?: "대기"}\n요청 전 확인: ${approval?.operation ?: "없음"}\n\n완료 이력\n$completed"
    }
}
