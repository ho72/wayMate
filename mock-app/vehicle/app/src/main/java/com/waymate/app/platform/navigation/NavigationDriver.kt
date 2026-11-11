package com.waymate.app.platform.navigation

import org.json.JSONObject

/** Platform boundary: mock builds cannot manufacture a real navigation result. */
interface NavigationDriver {
    val source: String
    val message: String

    fun resume()

    fun pause()

    fun evidence(): JSONObject?

    fun record(): JSONObject?

    fun owns(scope: String, attemptId: String): Boolean

    fun reserve(scope: String, attempt: JSONObject, executionId: String)

    fun dispatch(executionId: String, deadline: Long, allowed: () -> Boolean)

    fun abandonGrant()

    fun acknowledge(reportId: String)

    fun hasWork(): Boolean

    fun close()
}
