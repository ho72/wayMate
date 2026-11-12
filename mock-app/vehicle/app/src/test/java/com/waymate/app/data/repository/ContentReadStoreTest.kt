package com.waymate.app.data.repository

import org.junit.Assert.*
import org.junit.Test

class ContentReadStoreTest {
    private fun store(data: MutableMap<String, Any>, enumerate: () -> Unit = {}) =
        ContentReadStore(
            keys = {
                enumerate()
                data.keys.toSet()
            },
            read = { data[it] == true },
            write = { data[it] = true },
            remove = { keys -> keys.forEach { data.remove(it) } },
        )

    @Test
    fun readingPersistsAcrossStoreRecreationAndIsScopedToRunAndThread() {
        val data = mutableMapOf<String, Any>()
        store(data).markRead("run1", "thread1")
        val restored = store(data)
        assertTrue(restored.isRead("run1", "thread1"))
        assertFalse(restored.isRead("run2", "thread1"))
        assertFalse(restored.isRead("run1", "thread2"))
    }

    @Test
    fun cleanupRequiresCompletedEvidenceAndPreservesCurrentAndDurableState() {
        val data =
            mutableMapOf<String, Any>(
                "content.read.run1.t" to true,
                "content.read.run10.t" to true,
                "content.read.current.t" to true,
                "deviceId" to "device",
                "pending" to "unresolved command",
                "stopPending" to "stop command",
                "navigation-journal" to "audit",
            )
        val reads = store(data)
        reads.clearCompleted("current", emptySet())
        assertTrue(reads.isRead("run1", "t"))
        reads.clearCompleted("current", setOf("run1", "current"))
        assertFalse(reads.isRead("run1", "t"))
        assertTrue(reads.isRead("run10", "t"))
        assertTrue(reads.isRead("current", "t"))
        assertEquals("device", data["deviceId"])
        assertEquals("unresolved command", data["pending"])
        assertEquals("stop command", data["stopPending"])
        assertEquals("audit", data["navigation-journal"])
    }

    @Test
    fun startupSweepsAllConfirmedOldRunsButRepeatedPollsDoNotRescan() {
        val data = mutableMapOf<String, Any>("content.read.old.t" to true)
        var scans = 0
        val reads = store(data) { scans++ }
        reads.clearCompleted("current", setOf("old"))
        repeat(5) { reads.clearCompleted("current", setOf("old")) }
        assertEquals(1, scans)
        reads.markRead("current", "t")
        reads.clearCompleted("next", setOf("old", "current"))
        assertFalse(reads.isRead("current", "t"))
        assertEquals(2, scans)
    }

    @Test
    fun completedDisplayCuesAreRemovedWithoutTouchingCurrentOrUnknownRunCues() {
        val data =
            mutableMapOf<String, Any>(
                "content.q1.old.connection" to "old cue",
                "content.q1.current.connection" to "current cue",
                "content.q1.older.connection" to "unconfirmed cue",
                "content.read.old.thread" to true,
                "pending" to "pending command",
                "deviceId" to "same device",
            )
        val reads = store(data)
        reads.clearCompleted("current", emptySet())
        assertEquals("old cue", data["content.q1.old.connection"])
        reads.clearCompleted("current", setOf("old", "current"))
        assertFalse(data.containsKey("content.q1.old.connection"))
        assertFalse(reads.isRead("old", "thread"))
        assertEquals("current cue", data["content.q1.current.connection"])
        assertEquals("unconfirmed cue", data["content.q1.older.connection"])
        assertEquals("pending command", data["pending"])
        assertEquals("same device", data["deviceId"])
    }
}
