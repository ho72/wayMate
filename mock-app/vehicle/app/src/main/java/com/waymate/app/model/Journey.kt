package com.waymate.app.model

data class Journey(
    val handoffId: String?,
    val handoffVersion: Int,
    val alias: String,
    val avatarId: String,
    val style: String?,
    val interests: List<String>,
    val date: String,
    val nextVisit: String,
    val nextVisitLabel: String,
    val returnPlaceLabel: String,
    val returnEstimate: String,
    val returnDeadline: String,
    val profileVersion: Int = 0,
    val tripVersion: Int = 0,
    val activityPreference: String? = null,
    val pace: String? = null,
    val conversationStyle: String? = null,
    val expressionPresetIds: List<String> = emptyList(),
) {}
