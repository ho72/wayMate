package com.waymate.app.personal

import org.json.JSONObject
import java.util.UUID

/** Separate authenticated personal-trip contract. Never a v4 handoff or navigation command. */
data class PersonalStop(val time: String?, val title: String, val description: String)
data class PersonalDay(val number: Int, val date: String?, val stops: List<PersonalStop>)
data class PersonalDelivery(
    val id: String, val pairingId: String, val revision: Int, val acknowledgedAt: Long?,
    val displayName: String, val avatar: String, val tripId: String, val title: String,
    val destination: String, val summary: String, val days: List<PersonalDay>, val notes: List<String>,
)
data class PersonalVehicleState(
    val phase: String = "loading", val deviceName: String = "내 차", val pairingId: String? = null,
    val code: String? = null, val expiresAt: Long? = null, val accountName: String? = null,
    val accountAvatar: String = "dragon", val delivery: PersonalDelivery? = null,
    val allowed: Boolean = false, val localParked: Boolean = false, val busy: Boolean = false, val notice: String? = null,
)
internal fun JSONObject.requiredText(key: String, max: Int = 100): String =
    (get(key) as? String)?.takeIf { it.isNotBlank() && it.codePointCount(0, it.length) <= max }
        ?: throw IllegalArgumentException("Invalid personal trip text")
private fun JSONObject.identifier(key: String): String = requiredText(key, 36).also { UUID.fromString(it) }
private fun JSONObject.nullableText(key: String): String? = if (isNull(key)) null else requiredText(key, 500)
fun decodePersonalState(json: JSONObject, expectedDevice: String): PersonalVehicleState {
    require(json.getInt("schemaVersion") == 1 && json.getString("scope") == "account-trip-v1")
    val phase = json.requiredText("status")
    require(phase in listOf("pending", "requested", "active", "revoked"))
    val device = json.getJSONObject("device")
    require(device.identifier("id") == expectedDevice)
    val pairing = json.optJSONObject("pairing")
    val pairingId = pairing?.identifier("id")
    require((phase == "revoked") == (pairingId == null))
    val account = pairing?.optJSONObject("account")
    val rawDelivery = json.optJSONObject("delivery")
    val delivery = rawDelivery?.let { d ->
        require(phase == "active" && d.identifier("pairingId") == pairingId)
        val snapshot = d.getJSONObject("snapshot")
        val owner = snapshot.getJSONObject("owner")
        val trip = snapshot.getJSONObject("trip")
        val plan = trip.getJSONObject("plan")
        require(snapshot.getInt("profileVersion") > 0 && d.getInt("revision") > 0)
        val avatar = owner.requiredText("avatar").also { require(it in listOf("dragon", "bear", "mocha")) }
        val days = plan.getJSONArray("days")
        require(days.length() in 1..14)
        val parsedDays = (0 until days.length()).map { i ->
            val day = days.getJSONObject(i)
            val stops = day.getJSONArray("stops")
            require(day.getInt("dayNumber") == i + 1 && stops.length() in 1..12)
            PersonalDay(i + 1, day.nullableText("date"), (0 until stops.length()).map { n ->
                val stop = stops.getJSONObject(n)
                PersonalStop(stop.nullableText("time"), stop.requiredText("title"), stop.requiredText("description", 500))
            })
        }
        val notes = plan.getJSONArray("notes")
        require(notes.length() <= 12)
        PersonalDelivery(d.identifier("id"), checkNotNull(pairingId), d.getInt("revision"),
            if (d.isNull("acknowledgedAt")) null else d.getLong("acknowledgedAt"),
            owner.requiredText("displayName", 30), avatar, trip.identifier("id"), plan.requiredText("title", 80),
            plan.requiredText("destination"), plan.requiredText("summary", 800), parsedDays,
            (0 until notes.length()).map { notes.getString(it).also { value -> require(value.codePointCount(0, value.length) <= 300) } })
    }
    val code = pairing?.nullableText("code")?.also { require(it.matches(Regex("[0-9]{8}"))) }
    return PersonalVehicleState(phase, device.requiredText("name", 30), pairingId, code,
        pairing?.let { if (it.isNull("expiresAt")) null else it.getLong("expiresAt") },
        account?.requiredText("displayName", 30), account?.requiredText("avatar") ?: "dragon", delivery,
        allowed = json.getBoolean("canInteract"))
}
