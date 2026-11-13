package com.waymate.app.platform.restrictions

data class UxObservation(val requiresDo: Boolean, val activeRestrictions: Int) {
    val restricted: Boolean get() = requiresDo || activeRestrictions != 0
}

enum class InteractionMode { PARKED, DRIVING_LIMITED, BLOCKED }

object DrivingModePolicy {
    fun select(ux: UxObservation?): InteractionMode = when {
        ux == null -> InteractionMode.BLOCKED
        !ux.requiresDo && ux.activeRestrictions == 0 -> InteractionMode.PARKED
        ux.requiresDo && ux.activeRestrictions in DrivingProfiles.allowedMasks -> InteractionMode.DRIVING_LIMITED
        else -> InteractionMode.BLOCKED
    }
}
