package com.waymate.app.data.api

import com.waymate.app.model.Journey
import org.json.JSONObject

object JourneyParser {
    fun parse(json: JSONObject): Journey {
        require(
            json.getInt("schemaVersion") == 3 &&
                json.getString("mode") == "prepared_trip" &&
                json.isNull("peer")
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
        require(owner.getString("avatarId") in listOf("a-01", "a-02"))
        require(style == null || style in listOf("calm", "light_humor"))
        require(
            alias == java.text.Normalizer.normalize(alias, java.text.Normalizer.Form.NFC).trim() &&
                alias.codePointCount(0, alias.length) in 1..10 &&
                !alias.contains('\n') &&
                !alias.contains('\r')
        )
        require(
            interests.distinct().size == interests.size &&
                interests.all { it in listOf("sea_walk", "cafe") }
        )
        require(summary.getString("summarySource") == "user_confirmed_demo")
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
        )
    }
}
