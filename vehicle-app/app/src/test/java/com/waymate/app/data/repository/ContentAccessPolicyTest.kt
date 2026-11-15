package com.waymate.app.data.repository

import org.junit.Assert.*
import org.junit.Test

class ContentAccessPolicyTest {
    @Test
    fun onlyKnownFreshParkedForegroundStateMayDisplayLongDialogue() {
        assertFalse(ContentAccessPolicy.blocked(true, false, true, true, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, null, true, true, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, true, true, true, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, false, true, false, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, false, true, true, true, true, false))
    }

    @Test
    fun backgroundOrExpiredStatusCannotKeepLongCaptionsOpen() {
        assertTrue(ContentAccessPolicy.blocked(false, false, true, true, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, false, false, true, false, true, false))
        assertTrue(ContentAccessPolicy.blocked(true, false, true, true, false, false, false))
    }

    @Test
    fun operatorRestrictionOnlyAddsALock() {
        assertTrue(ContentAccessPolicy.blocked(true, false, true, true, false, true, true))
        assertTrue(ContentAccessPolicy.blocked(true, true, true, true, false, true, false))
    }
}
