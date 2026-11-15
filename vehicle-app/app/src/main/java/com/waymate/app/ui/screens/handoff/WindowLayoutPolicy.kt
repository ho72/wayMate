package com.waymate.app.ui.screens.handoff

internal fun useSideBySideLayout(widthDp: Float, heightDp: Float): Boolean =
    widthDp >= 840f && widthDp > heightDp
