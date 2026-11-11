package com.waymate.app.platform.navigation

import org.junit.Assert.*
import org.junit.Test

class RouteProbePolicyTest {
    private fun sample(
        seq: Long = 1,
        start: Long = 101,
        end: Long = 200,
        points: List<ProbePoint> = emptyList(),
        d: ProbePoint = RouteProbePolicy.destination,
        mode: String = "ROUTE_GUIDING",
        routing: Boolean = false,
        session: String = "s",
    ) = ProbeSnapshot(session, seq, start, end, d, points, mode, routing)

    @Test
    fun sameNameAndIdCannotMaskCoordinateMismatch() {
        assertFalse(
            RouteProbePolicy.destination.matches(
                ProbePoint(37.41289678, 127.09383464, "42dot", "36khp37hh8gqcm5nqhe5")
            )
        )
        assertFalse(RouteProbePolicy.destination.matches(ProbePoint(127.03636666, 37.48544722)))
    }

    @Test
    fun prepareAddRemoveRequireMatchingDestinationAndExactlyOwnedSlot() {
        for (op in listOf("prepare", "remove")) assertTrue(
            RouteProbePolicy.verified(op, sample(), sample(2, 1200, 1300), 100)
        )
        val m = listOf(RouteProbePolicy.waypoint)
        assertTrue(
            RouteProbePolicy.verified("add", sample(points = m), sample(2, 1200, 1300, m), 100)
        )
        assertFalse(RouteProbePolicy.target("add", sample(points = m + m)))
        assertFalse(
            RouteProbePolicy.target(
                "add",
                sample(points = listOf(ProbePoint(37.0, 127.0, "소프트웨어드림센터"))),
            )
        )
        assertFalse(RouteProbePolicy.target("remove", sample(points = m)))
        assertFalse(RouteProbePolicy.target("add", sample(points = m, d = ProbePoint(38.0, 128.0))))
    }

    @Test
    fun callbacksOrOneMatchingReadAreNotSuccess() {
        assertFalse(RouteProbePolicy.verified("prepare", null, sample(), 100))
        assertFalse(RouteProbePolicy.verified("prepare", sample(), sample(2, 201, 300), 100))
        assertFalse(
            RouteProbePolicy.verified(
                "prepare",
                sample(),
                sample(2, 1200, 1300, mode = "SAFE_GUIDING"),
                100,
            )
        )
        assertFalse(
            RouteProbePolicy.verified(
                "prepare",
                sample(),
                sample(2, 1200, 1300, routing = true),
                100,
            )
        )
    }

    @Test
    fun preDispatchOldSessionAndDuplicateQueryEvidenceAreRejected() {
        assertFalse(RouteProbePolicy.verified("prepare", sample(), sample(2, 1200, 1300), 101))
        assertFalse(RouteProbePolicy.verified("prepare", sample(), sample(1, 1200, 1300), 100))
        assertFalse(
            RouteProbePolicy.verified(
                "prepare",
                sample(),
                sample(2, 1200, 1300, session = "old"),
                100,
            )
        )
    }

    @Test
    fun unknownIsRecoverableOnlyAfterActualRebootAndDoubleEmptyBaseline() {
        val empty = ProbePoint(0.0, 0.0)
        val a = sample(d = empty, mode = "SAFE_GUIDING")
        val b = sample(2, 1200, 1300, d = empty, mode = "SAFE_GUIDING")
        assertTrue(RouteProbePolicy.recoverable("prepare", 1, 2, a, b))
        for (op in listOf("add", "remove")) assertFalse(
            RouteProbePolicy.recoverable(op, 1, 2, a, b)
        )
        assertFalse(RouteProbePolicy.recoverable("prepare", 2, 2, a, b))
        assertFalse(RouteProbePolicy.recoverable("prepare", -1, 2, a, b))
        assertFalse(RouteProbePolicy.recoverable("prepare", 1, 2, null, b))
        assertFalse(RouteProbePolicy.recoverable("prepare", 1, 2, a, sample(2, 1200, 1300)))
    }

    @Test
    fun missingWaypointCoordinatesNeedIndependentFreshPoiLookup() {
        val id = RouteProbePolicy.WAYPOINT_POI_ID
        val poi = VerifiedWaypointPoi(id, RouteProbePolicy.waypoint.copy(poiId = id), "s", 90)
        val raw = ProbePoint(0.0, 0.0, "소프트웨어드림센터", id)
        val a = sample(points = listOf(raw))
        val b = sample(2, 1200, 1300, listOf(raw))
        assertTrue(RouteProbePolicy.verified("add", a, b, 100, poi))
        assertFalse(RouteProbePolicy.verified("add", a, b, 100, null))
        assertFalse(RouteProbePolicy.verified("add", a, b, 100, poi.copy(sessionId = "old")))
        assertFalse(RouteProbePolicy.verified("add", a, b, 100, poi.copy(receivedAt = -600001)))
        assertFalse(
            RouteProbePolicy.verified(
                "add",
                a,
                b,
                100,
                poi.copy(point = ProbePoint(38.0, 128.0, "소프트웨어드림센터", id)),
            )
        )
        assertFalse(RouteProbePolicy.verified("add", a, b, 100, poi.copy(poiId = "other")))
        assertFalse(
            RouteProbePolicy.target("add", sample(points = listOf(raw.copy(poiId = ""))), poi)
        )
        assertFalse(
            RouteProbePolicy.target("add", sample(points = listOf(raw.copy(name = "다른 곳"))), poi)
        )
        assertFalse(
            RouteProbePolicy.target(
                "add",
                sample(points = listOf(raw.copy(latitude = 36.0, longitude = 126.0))),
                poi,
            )
        )
    }

    @Test
    fun unknownAddCannotBeRecoveredWithoutKnownOwnershipAndNewBoot() {
        val a = sample(d = ProbePoint(0.0, 0.0), mode = "SAFE_GUIDING")
        val b = sample(2, 1200, 1300, d = ProbePoint(0.0, 0.0), mode = "SAFE_GUIDING")
        assertTrue(RouteProbePolicy.recoverable("add", 1, 2, a, b, ownedEmptyTrial = true))
        assertFalse(RouteProbePolicy.recoverable("add", 1, 1, a, b, ownedEmptyTrial = true))
        assertFalse(RouteProbePolicy.recoverable("remove", 1, 2, a, b, ownedEmptyTrial = true))
    }

    @Test
    fun currentRouteOwnershipIncludesNameAndPoiId() {
        val m = ProbePoint(0.0, 0.0, "소프트웨어드림센터", RouteProbePolicy.WAYPOINT_POI_ID)
        assertTrue(m.sameIdentity(m.copy()))
        assertFalse(m.sameIdentity(m.copy(name = "다른 경유지")))
        assertFalse(m.sameIdentity(m.copy(poiId = "other")))
    }

    @Test
    fun slowSdkReadsStillProduceTwoIndependentObservations() {
        val a = sample(start = 100, end = 1200)
        assertFalse(RouteProbePolicy.queryReady(a, 1500))
        assertTrue(RouteProbePolicy.queryReady(a, 3000))
        assertTrue(RouteProbePolicy.verified("prepare", a, sample(2, 3000, 4100), 50))
    }
}
