package com.waymate.app.data.repository

/**
 * Platform/unknown restrictions also hide long dialogue; disabling buttons alone is insufficient.
 */
internal object ContentAccessPolicy {
    fun blocked(
        foreground: Boolean,
        platformRestricted: Boolean?,
        statusFresh: Boolean,
        restrictionKnown: Boolean,
        serverRestricted: Boolean,
        serverForeground: Boolean,
        testRestricted: Boolean,
    ): Boolean =
        !foreground ||
            platformRestricted != false ||
            !statusFresh ||
            !restrictionKnown ||
            serverRestricted ||
            !serverForeground ||
            testRestricted
}
