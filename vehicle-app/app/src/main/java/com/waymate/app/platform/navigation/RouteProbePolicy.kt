package com.waymate.app.platform.navigation

import kotlin.math.*

/**
 * Coordinates identify the requested point. A matching label or POI ID never excuses a mismatch.
 */
data class ProbePoint(
    val latitude: Double,
    val longitude: Double,
    val name: String = "",
    val poiId: String = "",
) {
    fun matches(other: ProbePoint): Boolean =
        latitude.isFinite() &&
            longitude.isFinite() &&
            other.latitude.isFinite() &&
            other.longitude.isFinite() &&
            abs(latitude - other.latitude) <= 0.00001 &&
            abs(longitude - other.longitude) <= 0.00001

    fun sameIdentity(other: ProbePoint): Boolean =
        matches(other) && name == other.name && poiId == other.poiId

    val empty: Boolean
        get() = latitude == 0.0 && longitude == 0.0 && name.isBlank() && poiId.isBlank()
}

data class ProbeSnapshot(
    val sessionId: String,
    val querySeq: Long,
    val startedAt: Long,
    val completedAt: Long,
    val destination: ProbePoint,
    val waypoints: List<ProbePoint>,
    val naviMode: String,
    val isRouting: Boolean,
) {
    val emptyBaseline: Boolean
        get() = destination.empty && waypoints.isEmpty() && naviMode == "SAFE_GUIDING" && !isRouting
}

data class VerifiedWaypointPoi(
    val poiId: String,
    val point: ProbePoint,
    val sessionId: String,
    val receivedAt: Long,
)

object RouteProbePolicy {
    val destination = ProbePoint(37.48544722, 127.03636666, "42dot")
    val waypoint = ProbePoint(37.41275833, 127.09481944, "소프트웨어드림센터")
    const val FIXTURE_ID = "coordinate-no-poi-v2"
    const val WAYPOINT_POI_ID = "36khp2hdj2cfcm5nqhe3"
    const val QUERY_QUIET_MS = 1000L

    fun queryReady(last: ProbeSnapshot?, now: Long) =
        last == null || now >= last.completedAt + QUERY_QUIET_MS

    const val RECOVERY_ID = "guest-reboot-double-empty-v1"

    fun target(operation: String, s: ProbeSnapshot, poi: VerifiedWaypointPoi? = null): Boolean =
        s.destination.matches(destination) &&
            !s.isRouting &&
            s.naviMode == "ROUTE_GUIDING" &&
            when (operation) {
                "prepare",
                "remove" -> s.waypoints.isEmpty()
                "add" -> s.waypoints.size == 1 && waypointMatches(s.waypoints[0], s, poi)
                else -> false
            }

    fun validLookup(poi: VerifiedWaypointPoi?, session: String, now: Long): Boolean =
        poi != null &&
            poi.poiId == WAYPOINT_POI_ID &&
            poi.point.poiId == WAYPOINT_POI_ID &&
            poi.point.latitude in -90.0..90.0 &&
            poi.point.longitude in -180.0..180.0 &&
            poi.sessionId == session &&
            now >= poi.receivedAt &&
            now - poi.receivedAt < 600000 &&
            distanceMeters(waypoint, poi.point) <= 30.0

    private fun distanceMeters(a: ProbePoint, b: ProbePoint): Double {
        if (
            !a.latitude.isFinite() ||
                !a.longitude.isFinite() ||
                !b.latitude.isFinite() ||
                !b.longitude.isFinite()
        )
            return Double.POSITIVE_INFINITY
        val x = Math.toRadians(b.latitude - a.latitude)
        val y = Math.toRadians(b.longitude - a.longitude)
        val h =
            sin(x / 2).pow(2) +
                cos(Math.toRadians(a.latitude)) *
                    cos(Math.toRadians(b.latitude)) *
                    sin(y / 2).pow(2)
        return 6371000.0 * 2 * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }

    fun waypointMatches(actual: ProbePoint, s: ProbeSnapshot, poi: VerifiedWaypointPoi?): Boolean {
        if (actual.matches(waypoint)) return true
        if (
            !validLookup(poi, s.sessionId, s.completedAt) ||
                actual.poiId != poi!!.poiId ||
                actual.name != waypoint.name
        )
            return false
        // Keep raw 0,0. Identity is independently checked using the current waypoint POI ID and a
        // fresh SDK lookup.
        return (actual.latitude == 0.0 && actual.longitude == 0.0) || actual.matches(poi.point)
    }

    fun consistentPair(a: ProbeSnapshot?, b: ProbeSnapshot, after: Long): Boolean =
        a != null &&
            a.sessionId == b.sessionId &&
            a.querySeq < b.querySeq &&
            a.startedAt > after &&
            b.startedAt >= a.completedAt + QUERY_QUIET_MS &&
            a.destination.matches(b.destination) &&
            a.waypoints.size == b.waypoints.size &&
            a.waypoints.zip(b.waypoints).all { (x, y) -> x.matches(y) } &&
            a.naviMode == b.naviMode &&
            a.isRouting == b.isRouting

    fun verified(
        operation: String,
        a: ProbeSnapshot?,
        b: ProbeSnapshot,
        dispatchAt: Long,
        poi: VerifiedWaypointPoi? = null,
    ): Boolean =
        consistentPair(a, b, dispatchAt) && target(operation, a!!, poi) && target(operation, b, poi)

    // A guest reboot ends the previous executor processes; two fresh empty observations confirm the
    // baseline.
    // Recovery of an add is limited to a trial whose D was created by this probe from an empty
    // route.
    // The caller verifies that ownership history; an arbitrary add or unknown removal is never
    // cleared.
    fun recoverable(
        operation: String,
        oldBoot: Int,
        currentBoot: Int,
        a: ProbeSnapshot?,
        b: ProbeSnapshot,
        ownedEmptyTrial: Boolean = false,
    ): Boolean =
        (operation == "prepare" || operation == "add" && ownedEmptyTrial) &&
            oldBoot >= 0 &&
            currentBoot > oldBoot &&
            consistentPair(a, b, -1) &&
            a!!.emptyBaseline &&
            b.emptyBaseline
}
