package com.waymate.app.platform.navigation

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.*
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AtomicFile
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

fun createNavigationDriver(context: Context): NavigationDriver = PleosNavigationDriver(context)

/** Single SDK writer. The journal is synced before entering either physical mutation. */
private class PleosNavigationDriver(context: Context) : NavigationDriver {
    override val source = "real"
    private val main = Handler(Looper.getMainLooper())
    private val helper = NaviHelper(context)
    private val sdkSession = UUID.randomUUID().toString()
    private val file = AtomicFile(File(context.filesDir, "navigation-journal-v1.json"))
    private var journal = JSONObject().put("records", JSONArray())
    @Volatile private var healthy = true
    @Volatile private var foreground = false
    private var closed = false
    private var connected = false
    private var querySeq = 0L
    private var batch: Batch? = null
    private var previous: ProbeSnapshot? = null
    private var latest: ProbeSnapshot? = null
    private var poi: VerifiedWaypointPoi? = null
    private var lookupStarted = -1L
    @Volatile private var published: String? = null
    @Volatile
    override var message = "순정 내비 연결과 목적지를 확인하고 있어요."
        private set

    private class Batch(val seq: Long, val started: Long) {
        var destination: ProbePoint? = null
        var waypoints: List<ProbePoint>? = null
        var route: RouteStateInfo? = null
    }

    private fun now() = SystemClock.elapsedRealtime()

    private fun post(block: () -> Unit) {
        main.post { if (!closed) block() }
    }

    init {
        try {
            if (
                file.baseFile.exists() ||
                    File(file.baseFile.path + ".bak").exists() ||
                    File(file.baseFile.path + ".new").exists()
            )
                journal = JSONObject(String(file.readFully(), Charsets.UTF_8))
            require(journal.getJSONArray("records").length() >= 0)
            val legacy = File(context.filesDir, "navi-probe.json")
            if (legacy.exists()) {
                val old = JSONObject(legacy.readText())
                require(old.optJSONObject("pending") == null && !old.optBoolean("ownsM"))
            }
            // No SDK call is reconstructed from disk. Awaiting grant means SDK entry was not
            // reached.
            synchronized(this) {
                active()?.let {
                    if (!it.has("report"))
                        finish(
                            it,
                            if (it.getString("phase") == "awaiting_grant") "not_dispatched"
                            else "unknown",
                            null,
                        )
                }
            }
        } catch (_: Exception) {
            healthy = false
            message = "실행 기록 복구가 필요해요. 새 경유지 변경을 잠갔어요."
        }
        helper.initialize(
            onConnected = {
                post {
                    connected = true
                    helper.addListener(listener)
                    query()
                }
            },
            onFailed = { post { message = "순정 내비 서비스에 연결할 수 없어요." } },
        )
        main.post { main.post(poll) }
    }

    private val listener =
        object : NaviHelperEventListener {
            override fun onDestinationInfo(info: DestinationInfo) = post {
                batch?.destination =
                    ProbePoint(info.latitude, info.longitude, info.name, info.poiId)
                complete()
            }

            override fun onWayPointInfo(info: List<WaypointInfo>) = post {
                batch?.waypoints = info.map {
                    ProbePoint(it.latitude, it.longitude, it.name, it.poiId)
                }
                complete()
            }

            override fun onRouteStateInfo(info: RouteStateInfo) = post {
                batch?.route = info
                complete()
            }

            override fun onTripInfo(info: TripInfo) = post {
                if (lookupStarted < 0) return@post
                val points = info.summary.routePoints.filter { it.pointType.name == "DESTINATION" }
                if (points.size == 1) {
                    val p = points.single()
                    val candidate =
                        VerifiedWaypointPoi(
                            p.poiId,
                            ProbePoint(p.latitude, p.longitude, p.poiName, p.poiId),
                            sdkSession,
                            now(),
                        )
                    if (RouteProbePolicy.validLookup(candidate, sdkSession, now())) poi = candidate
                }
                lookupStarted = -1
            }

            override fun onError(error: NaviErrorCode) = post { message = "내비 응답을 확인 중이에요: $error" }
        }
    private val poll =
        object : Runnable {
            override fun run() {
                if (closed) return
                if (connected && (foreground || hasWork())) query()
                main.postDelayed(this, 500)
            }
        }

    private fun query() {
        if (
            !connected ||
                !healthy ||
                synchronized(this) { active()?.optString("phase") == "awaiting_grant" }
        )
            return
        if (batch != null) {
            if (
                now() - batch!!.started > 8000
            ) { // Late callbacks cannot be assigned to another query.
                connected = false
                published = null
                message = "내비 조회 시간이 초과됐어요. 앱을 다시 열어 연결을 확인해 주세요."
            }
            return
        }
        if (!RouteProbePolicy.queryReady(latest, now())) return
        if (!RouteProbePolicy.validLookup(poi, sdkSession, now()) && lookupStarted < 0) {
            lookupStarted = now()
            helper.requestTrip(
                TripRequest(
                    latitude = RouteProbePolicy.waypoint.latitude,
                    longitude = RouteProbePolicy.waypoint.longitude,
                    poiName = "소프트웨어드림센터",
                    poiId = RouteProbePolicy.WAYPOINT_POI_ID,
                    poiSubId = "0",
                )
            )
        }
        batch = Batch(++querySeq, now())
        try {
            helper.getDestinationInfo()
            helper.getWaypointInfo()
            helper.getRouteStateInfo()
        } catch (_: Exception) {
            connected = false
            published = null
            message = "내비 조회 연결을 다시 확인해 주세요."
        }
    }

    private fun complete() {
        val b = batch ?: return
        val d = b.destination ?: return
        val w = b.waypoints ?: return
        val r = b.route ?: return
        val s =
            ProbeSnapshot(sdkSession, b.seq, b.started, now(), d, w, r.naviMode.name, r.isRouting)
        batch = null
        previous = latest
        latest = s
        val a = previous
        val p = poi
        published =
            if (
                a != null &&
                    p != null &&
                    stable(a, s) &&
                    RouteProbePolicy.validLookup(p, sdkSession, s.completedAt)
            )
                JSONObject()
                    .put("first", a.json())
                    .put("second", s.json())
                    .put(
                        "lookup",
                        JSONObject()
                            .put("sessionId", p.sessionId)
                            .put("receivedAt", p.receivedAt)
                            .put("poiId", p.poiId)
                            .put("point", p.point.json()),
                    )
                    .toString()
            else null
        message =
            when {
                d.empty -> "순정 내비에서 목적지를 먼저 설정해 주세요."
                published == null -> "목적지와 경유지를 두 번 확인하고 있어요."
                else -> "현재 목적지 ${d.name} · 경유지 ${w.size}개"
            }
        synchronized(this) {
            val rec = active() ?: return@synchronized
            if (
                rec.getString("phase") != "may_have_executed" ||
                    rec.getString("sdkSessionId") != sdkSession
            )
                return@synchronized
            val evidence = published?.let(::JSONObject)
            if (
                evidence != null &&
                    a != null &&
                    a.startedAt > rec.getLong("dispatchAt") &&
                    d.sameIdentity(point(rec.getJSONObject("baseline"))) &&
                    s.naviMode == "ROUTE_GUIDING" &&
                    !s.isRouting
            ) {
                val add = rec.getString("operation") == "add"
                if (if (add) w.size == 1 && waypointMatches(w[0], p, s) else w.isEmpty())
                    finish(rec, if (add) "applied" else "removed", evidence)
            }
            if (!rec.has("report") && now() - rec.getLong("dispatchAt") > 20000)
                finish(rec, "unknown", null)
        }
    }

    private fun stable(a: ProbeSnapshot, b: ProbeSnapshot) =
        RouteProbePolicy.consistentPair(a, b, -1) &&
            a.destination.sameIdentity(b.destination) &&
            a.waypoints.zip(b.waypoints).all { (x, y) -> x.sameIdentity(y) }

    private fun waypointMatches(w: ProbePoint, p: VerifiedWaypointPoi?, s: ProbeSnapshot) =
        w.name == RouteProbePolicy.waypoint.name &&
            w.poiId == RouteProbePolicy.WAYPOINT_POI_ID &&
            RouteProbePolicy.validLookup(p, sdkSession, s.completedAt) &&
            ((w.latitude == 0.0 && w.longitude == 0.0) ||
                w.matches(RouteProbePolicy.waypoint) ||
                w.matches(p!!.point))

    override fun evidence(): JSONObject? =
        published?.let(::JSONObject)?.takeIf {
            now() - it.getJSONObject("second").getLong("completedAt") < 2000 && healthy && connected
        }

    @Synchronized
    private fun active(): JSONObject? {
        val list = journal.getJSONArray("records")
        return if (list.length() == 0) null
        else list.getJSONObject(list.length() - 1).takeUnless { it.optBoolean("acknowledged") }
    }

    @Synchronized
    override fun record(): JSONObject? =
        active()?.let { JSONObject(it.toString()) }
            ?: journal.getJSONArray("records").let {
                if (it.length() == 0) null
                else JSONObject(it.getJSONObject(it.length() - 1).toString())
            }

    @Synchronized
    override fun hasWork() =
        healthy && active() != null && active()?.optBoolean("acknowledged") != true

    @Synchronized
    override fun owns(scope: String, attemptId: String): Boolean =
        healthy &&
            journal.getJSONArray("records").let { records ->
                (0 until records.length()).any {
                    val r = records.getJSONObject(it)
                    r.optString("scope") == scope &&
                        r.optString("attemptId") == attemptId &&
                        r.optJSONObject("report")?.optString("outcome") == "applied"
                }
            }

    @Synchronized
    override fun reserve(scope: String, attempt: JSONObject, executionId: String) {
        check(healthy && active() == null)
        journal
            .getJSONArray("records")
            .put(
                JSONObject()
                    .put("scope", scope)
                    .put("attemptId", attempt.getString("attemptId"))
                    .put("executionRecordId", executionId)
                    .put("sdkSessionId", sdkSession)
                    .put("operation", attempt.getString("operation"))
                    .put("baseline", attempt.getJSONObject("baseline"))
                    .put("before", attempt.getJSONObject("before"))
                    .put("phase", "awaiting_grant")
                    .put("sdkCalls", 0)
            )
        save()
    }

    override fun dispatch(executionId: String, deadline: Long, allowed: () -> Boolean) = post {
        synchronized(this) {
            val rec = active() ?: return@synchronized
            if (
                rec.getString("executionRecordId") != executionId ||
                    rec.getString("phase") != "awaiting_grant"
            )
                return@synchronized
            val current = evidence()?.getJSONObject("second")
            val before = rec.getJSONObject("before").getJSONObject("second")
            if (
                !healthy ||
                    batch != null ||
                    !foreground ||
                    !allowed() ||
                    now() > deadline ||
                    current == null ||
                    !sameRoute(current, before)
            ) {
                finish(rec, "not_dispatched", null)
                return@synchronized
            }
            rec.put("phase", "may_have_executed").put("dispatchAt", now()).put("sdkCalls", 1)
            try {
                save()
            } catch (_: Exception) {
                return@synchronized
            } // No SDK entry after a failed sync.
            previous = null
            latest = null
            published = null
            batch = null
            try {
                if (rec.getString("operation") == "add")
                    helper.addWaypoint(
                        RequestWaypointInfo(
                            latitude = RouteProbePolicy.waypoint.latitude,
                            longitude = RouteProbePolicy.waypoint.longitude,
                            waypointIndex = WaypointIndex.FIRST,
                            poiId = RouteProbePolicy.WAYPOINT_POI_ID,
                            poiName = "소프트웨어드림센터",
                            poiSubId = "0",
                            address = "경기도 성남시 수정구 창업로40번길 6",
                        )
                    )
                else helper.removeWaypoint(WaypointIndex.FIRST)
            } catch (_: Exception) {
                finish(rec, "unknown", null)
            }
        }
    }

    @Synchronized
    private fun finish(rec: JSONObject, outcome: String, e: JSONObject?) {
        if (
            rec.optJSONObject("report")?.optString("outcome") in
                listOf("applied", "removed", "not_dispatched")
        )
            return
        if (outcome == "unknown" && rec.has("report")) return
        rec.put(
            "report",
            JSONObject()
                .put("reportId", UUID.randomUUID().toString())
                .put("attemptId", rec.getString("attemptId"))
                .put("executionRecordId", rec.getString("executionRecordId"))
                .put("outcome", outcome)
                .put("evidence", e ?: JSONObject.NULL),
        )
        save()
    }

    @Synchronized
    override fun abandonGrant() {
        active()
            ?.takeIf { it.getString("phase") == "awaiting_grant" }
            ?.let { finish(it, "not_dispatched", null) }
    }

    @Synchronized
    override fun acknowledge(reportId: String) {
        val r = active() ?: return
        if (r.optJSONObject("report")?.optString("reportId") == reportId) {
            r.put("acknowledged", true)
            save()
        }
    }

    @Synchronized
    private fun save() {
        var stream: java.io.FileOutputStream? = null
        try {
            stream = file.startWrite()
            stream.write(journal.toString(2).toByteArray())
            file.finishWrite(stream)
        } catch (e: Exception) {
            if (stream != null) file.failWrite(stream)
            healthy = false
            published = null
            message = "실행 기록 저장에 실패해 새 요청을 잠갔어요."
            throw e
        }
    }

    override fun resume() {
        foreground = true
    }

    override fun pause() {
        foreground = false
    }

    override fun close() {
        closed = true
        main.removeCallbacks(poll)
        helper.removeListener(listener)
        helper.release()
    }

    private fun point(p: JSONObject) =
        ProbePoint(
            p.getDouble("latitude"),
            p.getDouble("longitude"),
            p.getString("name"),
            p.getString("poiId"),
        )

    private fun ProbePoint.json() =
        JSONObject()
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("name", name)
            .put("poiId", poiId)

    private fun ProbeSnapshot.json() =
        JSONObject()
            .put("sessionId", sessionId)
            .put("querySeq", querySeq)
            .put("startedAt", startedAt)
            .put("completedAt", completedAt)
            .put("destination", destination.json())
            .put("waypoints", JSONArray(waypoints.map { it.json() }))
            .put("naviMode", naviMode)
            .put("isRouting", isRouting)

    private fun sameRoute(a: JSONObject, b: JSONObject) =
        point(a.getJSONObject("destination")).sameIdentity(point(b.getJSONObject("destination"))) &&
            a.getJSONArray("waypoints").let { w ->
                val v = b.getJSONArray("waypoints")
                w.length() == v.length() &&
                    (0 until w.length()).all {
                        point(w.getJSONObject(it)).sameIdentity(point(v.getJSONObject(it)))
                    }
            }
}
