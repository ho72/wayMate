package com.waymate.app.platform.speech

import android.view.ViewTreeObserver
import androidx.activity.ComponentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner

/** Window focus is required even while all three Pleos panes remain resumed and visible. */
internal class WindowPlaybackLifecycle(
    private val activity: ComponentActivity,
    private val allowPlayback: (Boolean) -> Unit,
) : DefaultLifecycleObserver, ViewTreeObserver.OnWindowFocusChangeListener {
    init {
        allowPlayback(false)
        activity.window.decorView.viewTreeObserver.addOnWindowFocusChangeListener(this)
        activity.lifecycle.addObserver(this)
    }

    override fun onResume(owner: LifecycleOwner) {
        onWindowFocusChanged(activity.hasWindowFocus())
    }

    override fun onPause(owner: LifecycleOwner) {
        allowPlayback(false)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        // Gaining focus only permits a new explicit start; AgentSpeech never resumes playback.
        allowPlayback(hasFocus && activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
    }

    override fun onDestroy(owner: LifecycleOwner) {
        allowPlayback(false)
        activity.window.decorView.viewTreeObserver.removeOnWindowFocusChangeListener(this)
        activity.lifecycle.removeObserver(this)
    }
}
