package com.waymate.app.data.repository

import java.io.IOException
import org.junit.Assert.*
import org.junit.Test

class StopCommandOutboxTest {
    private class HttpFailure(val status: Int) : Exception()

    private data class Command(val id: String, val type: String)

    private class Harness {
        var durable: Command? = null
        var receipt: String? = null
        var getFailure: Exception? = null
        var postFailure: Exception? = null
        val posts = mutableListOf<Command>()
        val applied = mutableListOf<Pair<Command, String>>()
        var lookups = 0
        var created = 0

        fun outbox() =
            StopCommandOutbox<Command, String>(
                pending = { durable },
                persist = { durable = it },
                clear = { durable = null },
                receipt = {
                    lookups++
                    getFailure?.let { throw it }
                    receipt
                },
                submit = { command ->
                    posts += command
                    postFailure?.let { throw it }
                    "saved"
                },
                applied = { command, state -> applied += command to state },
                httpStatus = { (it as? HttpFailure)?.status },
            )

        fun create(type: String): Command = Command("command-${++created}", type)
    }

    @Test
    fun definitivePostRejectionClosesStopAndNextRecoveryIsNotStuck() {
        for (status in listOf(403, 409, 423, 500)) {
            val h = Harness()
            val first = h.outbox()
            h.postFailure = HttpFailure(status)
            assertThrows(HttpFailure::class.java) { first.send { h.create("MEETING_CANCEL") } }
            assertNull(h.durable)
            val reads = h.lookups
            h.outbox().recover() // A reconstructed outbox must not repeat the rejected stop.
            assertEquals(reads, h.lookups)
            h.postFailure = null
            first.send { h.create("CONNECT_END") }
            assertEquals("CONNECT_END", h.applied.single().first.type)
        }
    }

    @Test
    fun failedReceiptLookupPreservesDurableStopEvenForDefinitiveHttpErrors() {
        for (status in listOf(403, 409, 500, 503)) {
            val h = Harness()
            val command = h.create("CANCEL_PENDING_COMMAND")
            h.durable = command
            h.getFailure = HttpFailure(status)
            assertThrows(HttpFailure::class.java) { h.outbox().recover() }
            assertEquals(command, h.durable)
            assertTrue(h.posts.isEmpty())
            h.getFailure = null
            h.receipt = "already-applied"
            h.outbox().recover()
            assertNull(h.durable)
            assertTrue(h.posts.isEmpty())
            assertEquals(command to "already-applied", h.applied.single())
        }
    }

    @Test
    fun lostPostResponseSurvivesRestartAndReceiptPreventsDuplicatePost() {
        val h = Harness()
        h.postFailure = IOException("response lost")
        assertThrows(IOException::class.java) { h.outbox().send { h.create("MEETING_CANCEL") } }
        val original = h.durable!!
        h.postFailure = null
        h.receipt = "applied-before-timeout"
        h.outbox().recover()
        assertNull(h.durable)
        assertEquals(listOf(original), h.posts)
        assertEquals(original to "applied-before-timeout", h.applied.single())
    }

    @Test
    fun unavailablePostRetriesExactlyTheSameCommandAfterRestart() {
        val h = Harness()
        h.postFailure = HttpFailure(503)
        assertThrows(HttpFailure::class.java) { h.outbox().send { h.create("CONNECT_END") } }
        val original = h.durable!!
        h.postFailure = null
        h.outbox().recover()
        assertEquals(listOf(original, original), h.posts)
        assertEquals(1, h.created)
        assertNull(h.durable)
    }

    @Test
    fun newStopCannotOverwriteAnUnresolvedEarlierStop() {
        val h = Harness()
        val original = h.create("MEETING_CANCEL")
        h.durable = original
        h.getFailure = IOException("offline")
        assertThrows(IOException::class.java) { h.outbox().send { h.create("CONNECT_END") } }
        assertEquals(original, h.durable)
        assertEquals(1, h.created)
        assertTrue(h.posts.isEmpty())
    }

    @Test
    fun earlierStopIsRecoveredBeforeAnotherStopGetsAnId() {
        val h = Harness()
        val original = h.create("MEETING_CANCEL")
        h.durable = original
        h.outbox().send { h.create("CONNECT_END") }
        assertEquals(listOf("MEETING_CANCEL", "CONNECT_END"), h.posts.map { it.type })
        assertEquals(original, h.applied.first().first)
        assertNull(h.durable)
    }
}
