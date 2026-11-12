package com.waymate.app.ui.screens.handoff

import org.junit.Assert.*
import org.junit.Test

class WindowLayoutPolicyTest {
    @Test
    fun pleosSingleSlotStaysSingleColumnEvenAbove840Dp() {
        assertFalse(useSideBySideLayout(841f, 1210f))
        assertFalse(useSideBySideLayout(1000f, 1300f))
    }

    @Test
    fun expandedWindowUsesTwoColumnsOnlyWhenThereIsEnoughWidth() {
        assertTrue(useSideBySideLayout(1682f, 1210f))
        assertFalse(useSideBySideLayout(839f, 600f))
        assertFalse(useSideBySideLayout(840f, 840f))
    }
}
