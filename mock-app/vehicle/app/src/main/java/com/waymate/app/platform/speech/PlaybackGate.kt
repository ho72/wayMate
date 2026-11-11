package com.waymate.app.platform.speech

/** Late platform callbacks must never restart an interrupted or superseded utterance. */
internal class PlaybackGate {
    private var generation = 0L
    private var active: Long? = null

    fun begin(): Long = (++generation).also { active = it }

    fun accepts(token: Long): Boolean = active == token

    fun finish(token: Long): Boolean = accepts(token).also { if (it) active = null }

    fun interrupt() {
        generation++
        active = null
    }
}
