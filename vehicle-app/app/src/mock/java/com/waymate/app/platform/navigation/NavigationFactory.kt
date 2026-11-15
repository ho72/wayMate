package com.waymate.app.platform.navigation

import android.content.Context
import org.json.JSONObject

fun createNavigationDriver(context: Context): NavigationDriver =
    object : NavigationDriver {
        override val source = "mock"
        override val message = "모의 내비 · 운전자 승인 후 시연자가 결과를 지정해요. 실제 SDK는 호출하지 않아요."

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
