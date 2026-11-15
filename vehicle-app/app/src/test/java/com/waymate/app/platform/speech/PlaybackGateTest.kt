package com.waymate.app.platform.speech

import org.junit.Assert.*
import org.junit.Test

class PlaybackGateTest {
    @Test
    fun callbackAfterLifecycleInterruptionCannotStartSpeech() {
        val gate = PlaybackGate()
        val token = gate.begin()
        gate.interrupt()
        assertFalse(gate.accepts(token))
        assertFalse(gate.finish(token))
    }

    @Test
    fun aNewUserUtteranceSupersedesAllPreviousCallbacks() {
        val gate = PlaybackGate()
        val old = gate.begin()
        val current = gate.begin()
        assertFalse(gate.accepts(old))
        assertFalse(gate.finish(old))
        assertTrue(gate.accepts(current))
    }

    @Test
    fun duplicateDoneOrErrorCannotFinishANewUtterance() {
        val gate = PlaybackGate()
        val old = gate.begin()
        assertTrue(gate.finish(old))
        val current = gate.begin()
        assertFalse(gate.finish(old))
        assertTrue(gate.accepts(current))
    }

    @Test
    fun completedSpeechHasNoImplicitResume() {
        val gate = PlaybackGate()
        val token = gate.begin()
        assertTrue(gate.accepts(token))
        assertTrue(gate.finish(token))
        assertFalse(gate.accepts(token))
    }

    @Test
    fun repeatedInterruptionsDoNotReuseCallbackIdentity() {
        val gate = PlaybackGate()
        val old = gate.begin()
        repeat(5) { gate.interrupt() }
        val current = gate.begin()
        assertNotEquals(old, current)
        assertFalse(gate.accepts(old))
        assertTrue(gate.accepts(current))
    }
}
