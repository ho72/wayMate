package com.waymate.app.ui.testing

import android.os.SystemClock
import android.view.ViewTreeObserver
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.waymate.app.model.DrivingRecommendations
import com.waymate.app.model.DrivingUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.AgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.handoff.DrivingScreen

/** Only hosted while the real vehicle is parked. Real local output; no microphone or business SDK. */
@Composable
internal fun DrivingRecommendationPreview(query: String, journey: Journey) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    var speech by remember { mutableStateOf(SpeechState()) }
    val player = remember { AgentSpeech(context) { speech = it } }
    val expiresAt = remember { SystemClock.elapsedRealtime() + 300_000L }
    val requestId = "preview:$query"
    var handledLocally by rememberSaveable(query) { mutableStateOf(false) }
    val host = activity as? VehiclePagesPreviewActivity
    val handled = handledLocally || host?.handledRecommendationNarration == requestId
    DisposableEffect(player, activity) {
        fun update() {
            player.allowPlayback(activity?.hasWindowFocus() == true &&
                (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true)
        }
        val focus = ViewTreeObserver.OnWindowFocusChangeListener { update() }
        val observer = object : DefaultLifecycleObserver {
            override fun onPause(owner: LifecycleOwner) { player.allowPlayback(false) }
            override fun onResume(owner: LifecycleOwner) { update() }
        }
        activity?.window?.decorView?.viewTreeObserver?.addOnWindowFocusChangeListener(focus)
        (activity as? LifecycleOwner)?.lifecycle?.addObserver(observer)
        update()
        onDispose {
            activity?.window?.decorView?.viewTreeObserver?.removeOnWindowFocusChangeListener(focus)
            (activity as? LifecycleOwner)?.lifecycle?.removeObserver(observer)
            player.close()
        }
    }
    DrivingScreen(DrivingUiState(mode = InteractionMode.DRIVING_LIMITED, canPlayPreparedAudio = true,
        audioValidUntil = expiresAt), journey, speech,
        onSpeak = { if (DrivingUiState.allowsPreparedNarration(it)) player.speak(it) },
        onStop = player::interrupt,
        recommendation = DrivingRecommendations.forQuery(query),
        narrationRequestId = requestId.takeUnless { handled },
        onNarrationHandled = {
            handledLocally = true
            host?.handledRecommendationNarration = it
        })
}
