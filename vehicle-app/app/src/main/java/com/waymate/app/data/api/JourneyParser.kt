package com.waymate.app.data.api

import com.waymate.app.model.Journey
import com.waymate.app.model.PlannedDay
import com.waymate.app.model.PlannedStop
import org.json.JSONObject

object JourneyParser {
    fun parse(json: JSONObject): Journey {
        require(
            json.getInt("schemaVersion") == 4 &&
                json.getString("mode") in listOf("connected", "my_trip") &&
                (if (json.getString("mode") == "my_trip")
                    json.isNull("peer") && json.isNull("connection")
                else
                    json.getJSONObject("peer").getString("alias").isNotBlank() &&
                        json.getJSONObject("connection").getString("status") == "linked")
        )
        return preparation(json)
            .copy(
                handoffId = json.getString("handoffId"),
                handoffVersion = json.getInt("handoffVersion"),
            )
    }

    fun preparation(json: JSONObject): Journey {
        val owner = json.getJSONObject("owner")
        val summary = owner.getJSONObject("summary")
        val trip = json.getJSONObject("ownerTrip")
        val alias = owner.getString("alias")
        val interests =
            summary.getJSONArray("interests").let { a -> List(a.length()) { a.getString(it) } }
        val style =
            if (summary.isNull("speakingStyle")) null else summary.getString("speakingStyle")
        require(owner.getString("avatarId") in listOf("a-01", "a-02", "a-03"))
        require(style == null || style in listOf("calm", "light_humor"))
        require(
            alias == java.text.Normalizer.normalize(alias, java.text.Normalizer.Form.NFC).trim() &&
                alias.codePointCount(0, alias.length) in 1..30 &&
                !alias.contains('\n') &&
                !alias.contains('\r')
        )
        require(
            interests.distinct().size == interests.size &&
                interests.all { it in listOf("sea_walk", "cafe") }
        )
        require(summary.getString("summarySource") in listOf("user_confirmed_demo", "user_confirmed_ai"))
        for ((key, allowed) in
            listOf(
                "activityPreference" to "walk_first_photos_occasional",
                "pace" to "relaxed",
                "conversationStyle" to "quiet",
            )) {
            require(summary.isNull(key) || summary.getString(key) == allowed)
        }
        val expressions =
            summary.getJSONArray("expressionPresetIds").let { a ->
                List(a.length()) { a.getString(it) }
            }
        require(
            expressions.distinct().size == expressions.size &&
                expressions.all { it == "quiet-companion" }
        )
        require(
            (if (owner.isNull("speakingStyle")) null else owner.getString("speakingStyle")) == style
        )
        val versions = json.getJSONObject("sourceVersions")
        val plan = trip.optJSONObject("plan")
        val days = plan?.getJSONArray("days")
        if (days != null) require(days.length() in 1..14)
        val plannedDays = if (days == null) emptyList() else List(days.length()) { index ->
            val day = days.getJSONObject(index)
            require(day.getInt("dayNumber") == index + 1)
            val stops = day.getJSONArray("stops")
            require(stops.length() in 1..12)
            PlannedDay(index + 1, if (day.isNull("date")) null else day.getString("date"), List(stops.length()) { i ->
                val stop = stops.getJSONObject(i)
                val time = if (stop.isNull("time")) null else stop.getString("time")
                require(time == null || Regex("([01]\\d|2[0-3]):[0-5]\\d").matches(time))
                require(stop.getString("title").isNotBlank() && stop.getString("title").length <= 100)
                PlannedStop(time, stop.getString("title"), stop.getString("description"))
            })
        }
        require(versions.getInt("profile") > 0 && versions.getInt("trip") > 0)
        return Journey(
            null,
            0,
            alias,
            owner.getString("avatarId"),
            style,
            interests,
            trip.getString("date"),
            trip.getString("nextVisit"),
            trip.getString("nextVisitLabel"),
            trip.getString("returnPlaceLabel"),
            trip.getString("returnEstimate"),
            trip.getString("returnDeadline"),
            versions.getInt("profile"),
            versions.getInt("trip"),
            if (summary.isNull("activityPreference")) null
            else summary.getString("activityPreference"),
            if (summary.isNull("pace")) null else summary.getString("pace"),
            if (summary.isNull("conversationStyle")) null
            else summary.getString("conversationStyle"),
            expressions,
            planTitle = plan?.getString("title"),
            destination = plan?.getString("destination"),
            plannedDays = plannedDays,
            introduction = if (owner.isNull("introduction")) null else owner.getString("introduction"),
        )
    }
}
