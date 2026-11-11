package com.waymate.app.platform.navigation

import android.content.Context
import org.json.JSONObject

fun createNavigationDriver(context: Context): NavigationDriver =
    object : NavigationDriver {
        override val source = "unsupported"
        override val message = "실제 내비 연동은 Pleos용 real 앱에서 사용할 수 있어요."

        override fun resume() {}

        override fun pause() {}

        override fun evidence(): JSONObject? = null

        override fun record(): JSONObject? = null

        override fun owns(scope: String, attemptId: String) = false

        override fun reserve(scope: String, attempt: JSONObject, executionId: String) {
            error("Unsupported")
        }

        override fun dispatch(executionId: String, deadline: Long, allowed: () -> Boolean) {}

        override fun abandonGrant() {}

        override fun acknowledge(reportId: String) {}

        override fun hasWork() = false

        override fun close() {}
    }
