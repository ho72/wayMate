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
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.theme.WayMateTheme

class MainActivity : ComponentActivity() {
    private var ui by mutableStateOf(HandoffUiState())
    private lateinit var speech: AgentSpeech
    private var speechState by mutableStateOf(SpeechState())
    private lateinit var repository: HandoffRepository
    private lateinit var restrictions: VehicleRestrictions

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        speech = AgentSpeech(applicationContext) { speechState = it }
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
                    )
            }
        restrictions =
            VehicleRestrictions(this) { value ->
                if (value != false) speech.interrupt()
                repository.restriction(value)
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
                    speech::speak,
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
        speech.allowPlayback(hasWindowFocus())
        repository.resume()
        restrictions.start()
    }

    override fun onPause() {
        speech.allowPlayback(false)
        repository.pause()
        restrictions.stop()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (::speech.isInitialized)
            speech.allowPlayback(
                hasFocus &&
                    lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)
            )
    }

    override fun onDestroy() {
        speech.close()
        repository.close()
        super.onDestroy()
    }
}
