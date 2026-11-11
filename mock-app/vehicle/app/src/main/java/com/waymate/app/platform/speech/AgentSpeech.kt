package com.waymate.app.platform.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

data class SpeechState(val phase: String = "initializing", val available: Boolean = false)

/** Local platform narration only. No microphone, live peer voice, or driving capability. */
class AgentSpeech(context: Context, private val changed: (SpeechState) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val audio = context.getSystemService(AudioManager::class.java)
    private val gate = PlaybackGate()
    private var ready = false
    private var closed = false
    private var phase = "initializing"
    private val focus =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setOnAudioFocusChangeListener(
                { value -> if (value != AudioManager.AUDIOFOCUS_GAIN) interrupt() },
                main,
            )
            .build()
    private var tts: TextToSpeech? = null

    init {
        tts =
            TextToSpeech(context.applicationContext) { result ->
                main.post {
                    if (!closed) {
                        val language =
                            if (result == TextToSpeech.SUCCESS) tts?.setLanguage(Locale.KOREAN)
                            else null
                        ready = language != null && language >= TextToSpeech.LANG_AVAILABLE
                        publish(if (ready) "idle" else "unavailable")
                    }
                }
            }
        tts?.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(id: String?) {
                    callback(id, "speaking", false)
                }

                override fun onDone(id: String?) {
                    callback(id, "finished", true)
                }

                @Deprecated("Platform legacy callback")
                override fun onError(id: String?) {
                    callback(id, "unavailable", true)
                }

                override fun onError(id: String?, code: Int) {
                    callback(id, "unavailable", true)
                }
            }
        )
    }

    private fun publish(value: String) {
        phase = value
        changed(SpeechState(value, ready))
    }

    private fun callback(id: String?, value: String, terminal: Boolean) {
        main.post {
            val token = id?.toLongOrNull()
            if (!closed && token != null && gate.accepts(token)) {
                if (terminal) {
                    gate.finish(token)
                    audio.abandonAudioFocusRequest(focus)
                }
                publish(value)
            }
        }
    }

    fun speak(text: String) {
        interrupt()
        if (
            closed ||
                !ready ||
                audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        ) {
            publish("unavailable")
            return
        }
        val token = gate.begin()
        publish("preparing")
        if (
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, token.toString()) !=
                TextToSpeech.SUCCESS
        ) {
            gate.interrupt()
            audio.abandonAudioFocusRequest(focus)
            publish("unavailable")
        }
    }

    fun interrupt() {
        gate.interrupt()
        tts?.stop()
        audio.abandonAudioFocusRequest(focus)
        if (!closed && phase in listOf("preparing", "speaking")) publish("interrupted")
    }

    fun close() {
        interrupt()
        closed = true
        tts?.shutdown()
        tts = null
    }
}
