package com.waymate.app.platform.restrictions

import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class RestrictionSnapshotTest {
    private val parked = UxObservation(false, 0)
    private val moving = UxObservation(true, 80)

    @Test fun oneCapturedSnapshotRetainsAllReportFieldsAcrossEveryTransition() {
        var published = RestrictionSnapshot(parked)
        val parkedReport = published
        published = RestrictionSnapshot(moving)
        val movingReport = published
        published = RestrictionSnapshot.UNKNOWN
        assertEquals(RestrictionReport(true, false, parked), parkedReport.reportFields())
        assertEquals(RestrictionReport(true, true, moving), movingReport.reportFields())
        assertEquals(RestrictionReport(false, true, null), published.reportFields())
        published = RestrictionSnapshot(parked)
        assertEquals(RestrictionReport(true, false, parked), published.reportFields())
        assertNull(RestrictionSnapshot.UNKNOWN.restricted)
    }

    @Test fun concurrentPublicationCannotMixKnownBooleanAndRawObservation() {
        val published = AtomicReference(RestrictionSnapshot.UNKNOWN)
        val start = CountDownLatch(1)
        val writer = Thread {
            start.await()
            repeat(100000) { i ->
                published.set(when (i % 3) {
                    0 -> RestrictionSnapshot(parked)
                    1 -> RestrictionSnapshot(moving)
                    else -> RestrictionSnapshot.UNKNOWN
                })
            }
        }
        writer.start(); start.countDown()
        try {
            repeat(100000) {
                val fields = published.get().reportFields()
                assertEquals(fields.ux != null, fields.restrictionKnown)
                assertEquals(fields.ux?.restricted != false, fields.restricted)
            }
        } finally { writer.join(5000) }
        assertFalse("Publisher completed", writer.isAlive)
    }
}
