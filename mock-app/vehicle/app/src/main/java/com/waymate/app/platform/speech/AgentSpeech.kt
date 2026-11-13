package com.waymate.app.platform.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale
import org.json.JSONObject

data class SpeechState(
    val phase: String = "initializing",
    val available: Boolean = false,
    val text: String? = null,
    val source: String = "none",
)

/** One local playback at a time. Prepared audio never represents a microphone or live peer. */
class AgentSpeech(context: Context, private val changed: (SpeechState) -> Unit) {
    private val context = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val audio = context.getSystemService(AudioManager::class.java)
    private val gate = PlaybackGate()
    private var ttsReady = false
    private var closed = false
    private var allowed = true
    private var phase = "initializing"
    private var text: String? = null
    private var source = "none"
    private var player: MediaPlayer? = null
    private val clips =
        runCatching {
                val index =
                    JSONObject(
                            this.context.assets.open("speech/index.json").bufferedReader().use {
                                it.readText()
                            }
                        )
                        .getJSONArray("entries")
                (0 until index.length()).associate {
                    val entry = index.getJSONObject(it)
                    entry.getString("sha256Text") to entry.getString("file")
                }
            }
            .getOrDefault(emptyMap())
    private val attributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
    private val focus =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(
                { value -> if (value != AudioManager.AUDIOFOCUS_GAIN) interrupt() },
                main,
            )
            .build()
    private var tts: TextToSpeech? = null

    init {
        tts =
            TextToSpeech(this.context) { result ->
                main.post {
                    if (!closed) {
                        val language =
                            if (result == TextToSpeech.SUCCESS) tts?.setLanguage(Locale.KOREAN)
                            else null
                        ttsReady = language != null && language >= TextToSpeech.LANG_AVAILABLE
                        if (phase == "initializing")
                            publish(if (ttsReady || clips.isNotEmpty()) "idle" else "unavailable")
                    }
                }
            }
        tts?.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(id: String?) = callback(id, "speaking", false)

                override fun onDone(id: String?) = callback(id, "finished", true)

                @Deprecated("Platform legacy callback")
                override fun onError(id: String?) = callback(id, "unavailable", true)

                override fun onError(id: String?, code: Int) = callback(id, "unavailable", true)
            }
        )
        if (clips.isNotEmpty()) publish("idle")
    }

    private fun publish(value: String) {
        phase = value
        changed(SpeechState(value, ttsReady || clips.isNotEmpty(), text, source))
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

    fun speak(value: String) {
        interrupt()
        if (closed) return
        if (!allowed) {
            publish("interrupted")
            return
        }
        text = value
        val normalized = Normalizer.normalize(value, Normalizer.Form.NFC)
        val hash =
            MessageDigest.getInstance("SHA-256")
                .digest(normalized.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it.toInt() and 255) }
        val clip = clips[hash]
        val granted =
            (clip != null || ttsReady) &&
                runCatching {
                        audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                    }
                    .getOrDefault(false)
        if (!granted) {
            publish("unavailable")
            return
        }
        val token = gate.begin()
        source = if (clip != null) "prepared_sample" else "android_tts"
        publish("preparing")
        if (clip == null) {
            tts?.setAudioAttributes(attributes)
            if (
                tts?.speak(value, TextToSpeech.QUEUE_FLUSH, null, token.toString()) !=
                    TextToSpeech.SUCCESS
            ) {
                gate.interrupt()
                audio.abandonAudioFocusRequest(focus)
                publish("unavailable")
            }
            return
        }
        try {
            val current = MediaPlayer()
            player = current
            current.setAudioAttributes(attributes)
            context.assets.openFd("speech/$clip").use {
                current.setDataSource(it.fileDescriptor, it.startOffset, it.length)
            }
            current.setOnPreparedListener {
                if (!closed && gate.accepts(token) && player === current) {
                    val started =
                        runCatching {
                                current.start()
                                current.isPlaying
                            }
                            .getOrDefault(false)
                    if (started) {
                        Log.i("WayMateAudio", "prepared_start token=$token asset=$clip")
                        publish("speaking")
                    } else finish(current, token, "unavailable")
                }
            }
            current.setOnCompletionListener { finish(current, token, "finished") }
            current.setOnErrorListener { _, _, _ ->
                finish(current, token, "unavailable")
                true
            }
            current.prepareAsync()
        } catch (_: Exception) {
            gate.interrupt()
            releasePlayer()
            audio.abandonAudioFocusRequest(focus)
            publish("unavailable")
        }
    }

    private fun finish(current: MediaPlayer, token: Long, result: String) {
        if (closed || !gate.accepts(token) || player !== current) return
        gate.finish(token)
        releasePlayer()
        audio.abandonAudioFocusRequest(focus)
        Log.i("WayMateAudio", "prepared_end token=$token result=$result")
        publish(result)
    }

    private fun releasePlayer() {
        player?.let { p ->
            p.setOnPreparedListener(null)
            p.setOnCompletionListener(null)
            p.setOnErrorListener(null)
            runCatching { p.release() }
        }
        player = null
    }

    fun interrupt() {
        gate.interrupt()
        tts?.stop()
        releasePlayer()
        audio.abandonAudioFocusRequest(focus)
        if (!closed && phase in listOf("preparing", "speaking")) {
            Log.i("WayMateAudio", "playback_interrupted")
            publish("interrupted")
        }
    }

    fun allowPlayback(value: Boolean) {
        allowed = value
        if (!value) interrupt()
    }

    fun close() {
        interrupt()
        closed = true
        tts?.shutdown()
        tts = null
    }
}
