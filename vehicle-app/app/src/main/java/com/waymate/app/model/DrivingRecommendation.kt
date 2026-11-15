package com.waymate.app.model

/** A fixed local sample; not a live POI result or a navigation command. */
data class DrivingRecommendation(
    val id: String,
    val query: String,
    val placeName: String,
    val summary: String,
    val total: String,
    val reason: String,
    val narration: String,
)
