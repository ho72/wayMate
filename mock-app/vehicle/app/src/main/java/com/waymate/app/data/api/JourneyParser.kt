package com.waymate.app.data.api

import com.waymate.app.model.Journey
import org.json.JSONObject

object JourneyParser {
    fun parse(json: JSONObject): Journey {
        require(
            json.getInt("schemaVersion") == 2 &&
                json.getString("mode") == "my_trip" &&
                json.isNull("peer")
        )
        val owner = json.getJSONObject("owner")
        val summary = owner.getJSONObject("summary")
        val trip = json.getJSONObject("ownerTrip")
        val interests =
            summary.getJSONArray("interests").let { a -> List(a.length()) { a.getString(it) } }
        require(owner.getString("avatarId") in listOf("a-01", "a-02"))
        require(owner.getString("speakingStyle") in listOf("calm", "light_humor"))
        require(interests.isNotEmpty() && interests.all { it in listOf("sea_walk", "cafe") })
        require(
            summary.getString("activityPreference") == "walk_first_photos_occasional" &&
                summary.getString("pace") == "relaxed" &&
                summary.getString("conversationStyle") == "quiet"
        )
        return Journey(
            json.getString("handoffId"),
            json.getInt("handoffVersion"),
            owner.getString("alias"),
            owner.getString("avatarId"),
            owner.getString("speakingStyle"),
            interests,
            trip.getString("date"),
            trip.getString("nextVisit"),
            trip.getString("nextVisitLabel"),
            trip.getString("returnPlaceLabel"),
            trip.getString("returnEstimate"),
            trip.getString("returnDeadline"),
        )
    }
}
