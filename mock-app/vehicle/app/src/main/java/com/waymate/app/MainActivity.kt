package com.waymate.app

import android.os.Bundle
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
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.speech.WindowPlaybackLifecycle
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.theme.WayMateTheme

class MainActivity : ComponentActivity() {
    private var ui by mutableStateOf(HandoffUiState(driving = DrivingUiState(mode = InteractionMode.BLOCKED)))
    private lateinit var speech: AgentSpeech
    private var speechState by mutableStateOf(SpeechState())
    private lateinit var repository: HandoffRepository
    private lateinit var restrictions: VehicleRestrictions
    private var ux: UxObservation? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = AgentSpeech(applicationContext) { speechState = it }
        WindowPlaybackLifecycle(this, speech::allowPlayback)
        repository =
            HandoffRepository(applicationContext, createNavigationDriver(applicationContext)) {
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
            }
        restrictions =
            VehicleRestrictions(this, observed = { next ->
                if (ux != next) speech.interrupt()
                ux = next
            }) { value ->
                if (value == null) speech.interrupt()
                repository.restriction(value, ux)
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
                    { text ->
                        val mode = DrivingModePolicy.select(ux)
                        if (mode == InteractionMode.PARKED ||
                            mode == InteractionMode.DRIVING_LIMITED &&
                            text == DrivingUiState.NARRATION && repository.mayPlayDrivingAudio())
                            speech.speak(text)
                        else speech.interrupt()
                    },
                    speech::interrupt,
                    repository::openEnding,
                    repository::closeEnding,
                    repository::markProfileCue,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        repository.resume()
        restrictions.start()
    }

    override fun onPause() {
        repository.pause()
        restrictions.stop()
        super.onPause()
    }

    override fun onDestroy() {
        speech.close()
        repository.close()
        super.onDestroy()
    }
}
