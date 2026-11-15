package com.waymate.app.personal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.restrictions.DrivingModePolicy
import com.waymate.app.ui.theme.WayMateTheme
import com.waymate.app.platform.speech.*

/** Account trip entry. Deliberately never constructs a navigation driver/demo repository. */
class PersonalTripActivity : ComponentActivity() {
    private var state by mutableStateOf(PersonalVehicleState())
    private var mode by mutableStateOf(InteractionMode.BLOCKED)
    private var repository: PersonalTripRepository? = null
    private lateinit var restrictions: VehicleRestrictions
    private lateinit var speech: AgentSpeech
    private lateinit var voiceConsent: VoiceConsentGate
    private var speechState by mutableStateOf(SpeechState())
    private var speechApi: SpeechApi? = null
    private var voiceScope: String? = null
    private var serverVoice = false
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = AgentSpeech(this) { speechState = it }
        WindowPlaybackLifecycle(this, speech::allowPlayback)
        voiceConsent = VoiceConsentGate(this) { mode == InteractionMode.PARKED && state.allowed }
        try { repository = PersonalTripRepository(this, { next ->
            val scope = next.pairingId?.takeIf { next.phase == "active" }
            if (voiceScope != scope) {
                speech.interrupt(); voiceConsent.clear(); speechApi?.cancel()
                voiceScope = scope; serverVoice = false
                speechApi = if (scope != null) repository?.speechApi() else null
                speechApi?.let { api -> speech.checkServer(api) { ready -> if (speechApi === api) serverVoice = ready } }
            }
            if (!next.allowed || !next.localParked || next.delivery?.id != state.delivery?.id) speech.interrupt()
            state = next
        }) }
        catch (_: Exception) { state = PersonalVehicleState(phase = "error", notice = "차량 저장 정보를 확인해 주세요.") }
        restrictions = VehicleRestrictions(this, observed = {
            mode = DrivingModePolicy.select(it)
            if (mode != InteractionMode.PARKED) { speech.interrupt(); voiceConsent.clear() }
            repository?.restriction(it)
        }, changed = {})
        setContent { WayMateTheme {
            PersonalTripScreen(state, { repository?.enroll() }, { repository?.confirm(it) },
                { repository?.acceptTrip() }, { repository?.unpair() }, { repository?.refresh() }, { finish() }, mode = mode,
                speech = speechState, onSpeak = {
                    if (speechState.phase in listOf("preparing", "speaking")) speech.interrupt()
                    else {
                        val trip = state.delivery
                        val api = speechApi
                        val scope = voiceScope
                        val value = trip?.let { "${it.title}. ${it.destination}. ${it.summary}" }
                        if (trip != null && value != null && state.allowed && state.localParked && trip.acknowledgedAt != null) {
                            if (!serverVoice) speech.speak(value)
                            else if (api != null && scope != null && voiceConsent.permit(scope))
                                speech.speakFromServer(value, api, trip.avatar) {
                                    voiceScope == scope && state.delivery?.id == trip.id && state.allowed && state.localParked && mode == InteractionMode.PARKED
                                }
                        }
                    }
                })
        } }
    }
    override fun onResume() { super.onResume(); repository?.resume(); restrictions.start() }
    override fun onPause() { voiceConsent.clear(); speech.interrupt(); repository?.pause(); restrictions.stop(); super.onPause() }
    override fun onDestroy() { voiceConsent.clear(); speechApi?.cancel(); speech.close(); repository?.close(); super.onDestroy() }
}
