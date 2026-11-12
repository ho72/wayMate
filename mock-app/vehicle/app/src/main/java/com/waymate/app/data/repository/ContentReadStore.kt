package com.waymate.app.data.repository

/** Read markers are disposable UI state. Only server-confirmed completed runs may be removed. */
class ContentReadStore(
    private val keys: () -> Set<String>,
    private val read: (String) -> Boolean,
    private val write: (String) -> Unit,
    private val remove: (Set<String>) -> Unit,
) {
    private var reconciled: Pair<String, Set<String>>? = null

    fun isRead(runId: String, threadId: String): Boolean = read("content.read.$runId.$threadId")

    fun markRead(runId: String, threadId: String) = write("content.read.$runId.$threadId")

    fun clearCompleted(currentRunId: String, completedRunIds: Set<String>) {
        val scope = currentRunId to completedRunIds.toSet()
        if (scope == reconciled) return
        val prefixes = (completedRunIds - currentRunId).map { "content.read.$it." }
        val obsolete = keys().filter { key -> prefixes.any { key.startsWith(it) } }.toSet()
        if (obsolete.isNotEmpty()) remove(obsolete)
        reconciled = scope
    }
}
