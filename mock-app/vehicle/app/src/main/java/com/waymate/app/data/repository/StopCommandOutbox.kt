package com.waymate.app.data.repository

/** A durable stop lane, independent of the ordinary command and the physical SDK journal. */
internal class StopCommandOutbox<C : Any, S : Any>(
    private val pending: () -> C?,
    private val persist: (C) -> Unit,
    private val clear: () -> Unit,
    private val receipt: (C) -> S?,
    private val submit: (C) -> S,
    private val applied: (C, S) -> Unit,
    private val httpStatus: (Exception) -> Int?,
) {
    fun send(create: () -> C) {
        // Resolve the durable earlier stop before assigning a new ID or replacing it.
        recover()
        persist(create())
        recover()
    }

    fun recover() {
        val command = pending() ?: return
        // A failed GET says nothing about whether the POST was applied.
        val known = receipt(command)
        val state =
            known
                ?: try {
                    submit(command)
                } catch (e: Exception) {
                    // Only a definitive rejection of this POST closes the stop request.
                    if (httpStatus(e)?.let { it in 400..500 } == true) clear()
                    throw e
                }
        applied(command, state)
        clear()
    }
}
