package com.waymate.app

import android.os.Bundle
import android.content.Intent
import com.waymate.app.personal.PersonalTripActivity
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.waymate.app.app.WayMateApp
import com.waymate.app.data.repository.HandoffRepository
import com.waymate.app.platform.navigation.createNavigationDriver
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.platform.restrictions.UxObservation
import com.waymate.app.platform.restrictions.DrivingModePolicy
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.model.DrivingUiState
import com.waymate.app.platform.speech.AgentNarration
import com.waymate.app.platform.speech.AgentNarrationPolicy
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.speech.WindowPlaybackLifecycle
import com.waymate.app.platform.speech.SpeechApi
import com.waymate.app.platform.speech.VoiceConsentGate
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.theme.WayMateTheme
import com.waymate.app.platform.dialogue.ScenarioDialogue
import com.waymate.app.platform.dialogue.ScenarioDialogueController

class MainActivity : ComponentActivity() {
    private var ui by mutableStateOf(HandoffUiState(driving = DrivingUiState(mode = InteractionMode.BLOCKED)))
    private lateinit var speech: AgentSpeech
    private var speechState by mutableStateOf(SpeechState())
    private lateinit var repository: HandoffRepository
    private lateinit var restrictions: VehicleRestrictions
    private var ux: UxObservation? = null
    private lateinit var voiceConsent: VoiceConsentGate
    private val speechApi = SpeechApi(BuildConfig.API_BASE_URL + "/api/tts", mapOf("X-Demo-Actor" to "car"))
    private var serverVoice = false
    private var voiceScope: String? = null
    private var voiceRevision: String? = null
    private var dialogue by mutableStateOf(ScenarioDialogue())
    private lateinit var dialogueController: ScenarioDialogueController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = AgentSpeech(applicationContext) { speechState = it }
        voiceConsent = VoiceConsentGate(this) { DrivingModePolicy.select(ux) == InteractionMode.PARKED }
        speech.checkServer(speechApi) { serverVoice = it }
        WindowPlaybackLifecycle(this, speech::allowPlayback)
        dialogueController = ScenarioDialogueController({ packet ->
            if (dialogue.lines != packet.lines) speech.interrupt()
            dialogue = packet
        })
        repository =
            HandoffRepository(applicationContext, createNavigationDriver(applicationContext)) {
                val scope = repository.speechScope()
                val revision = repository.dialogueRevision()
                if (voiceScope != scope || voiceRevision != revision || it.reset.visible) {
                    speech.interrupt(); voiceConsent.clear(); voiceScope = scope; voiceRevision = revision
                }
                ui =
                    HandoffUiState(
                        it.ending,
                        it.content,
                        it.loadEnabled,
                        it.isLoading,
                        it.notice,
                        it.journey,
                        it.retryPending,
                        it.startEnabled,
                        it.preparation,
                        it.social,
                        it.navigation,
                        it.reset,
                        it.driving,
                    )
                dialogueController.synchronize(scope, revision,
                    it.journey != null && !it.reset.visible && it.driving.mode == InteractionMode.PARKED &&
                        lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED))
            }
        restrictions =
            VehicleRestrictions(this, observed = { next ->
                if (ux != next) speech.interrupt()
                if (DrivingModePolicy.select(next) != InteractionMode.PARKED) voiceConsent.dismiss()
                ux = next
                repository.restriction(next)
            }) { value ->
                if (value == null) speech.interrupt()
            }
        setContent {
            WayMateTheme {
                WayMateApp(
                    ui,
                    repository::load,
                    repository::startTrip,
                    repository::openNavigation,
                    repository::closeNavigation,
                    repository::approveNavigation,
                    repository::cancelNavigation,
                    repository::openMeeting,
                    repository::closeMeeting,
                    repository::socialAction,
                    repository::retryCurrent,
                    repository::openContent,
                    repository::closeContent,
                    repository::markMessageRead,
                    speechState,
                    { text -> narrate(AgentNarration(text, (ui.journey ?: ui.preparation)?.avatarId ?: "a-01")) },
                    speech::interrupt,
                    repository::openEnding,
                    repository::closeEnding,
                    repository::markProfileCue,
                    { startActivity(Intent(this, PersonalTripActivity::class.java)) },
                    if (BuildConfig.DEBUG) ({
                        startActivity(Intent().setClassName(this, "com.waymate.app.ui.testing.VehiclePagesPreviewActivity"))
                    }) else null,
                    dialogue = dialogue,
                    onNarrate = ::narrate,
                )
            }
        }
    }

    private fun narrate(request: AgentNarration) {
        val text = request.text
        fun permitted(): Boolean {
            val mode = DrivingModePolicy.select(ux)
            return !ui.reset.visible && (mode == InteractionMode.PARKED ||
                mode == InteractionMode.DRIVING_LIMITED &&
                (DrivingUiState.allowsPreparedNarration(text) || dialogue.permitsDriving(text)) && repository.mayPlayDrivingAudio())
        }
        val scope = repository.speechScope()
        if (!permitted()) speech.interrupt()
        // Automatic prompts use prepared/device output. They never open provider consent or spend credits.
        else if (request.automatic || !serverVoice || (scope != null && !voiceConsent.accepted(scope) &&
            DrivingModePolicy.select(ux) == InteractionMode.DRIVING_LIMITED)) speech.speak(text)
        else if (scope != null && voiceConsent.permit(scope)) {
            speechApi.setScope(scope)
            speech.speakFromServer(text, speechApi, AgentNarrationPolicy.voice(request.avatarId)) {
                permitted() && repository.speechScope() == scope
            }
        }
    }

    override fun onResume() {
        super.onResume()
        repository.resume()
        restrictions.start()
    }

    override fun onPause() {
        dialogueController.pause()
        voiceConsent.clear()
        speech.interrupt()
        repository.pause()
        restrictions.stop()
        super.onPause()
    }

    override fun onDestroy() {
        dialogueController.close()
        voiceConsent.clear()
        speechApi.cancel()
        speech.close()
        repository.close()
        super.onDestroy()
    }
}
