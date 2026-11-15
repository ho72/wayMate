package com.waymate.app.platform.restrictions

/** A single immutable observation is published across the main/worker boundary. */
data class RestrictionSnapshot(val ux: UxObservation?) {
    val restricted: Boolean? get() = ux?.restricted

    fun reportFields() = RestrictionReport(
        restrictionKnown = ux != null,
        restricted = ux?.restricted != false,
        ux = ux,
    )

    companion object { val UNKNOWN = RestrictionSnapshot(null) }
}

data class RestrictionReport(
    val restrictionKnown: Boolean,
    val restricted: Boolean,
    val ux: UxObservation?,
)
