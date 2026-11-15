package com.waymate.app.platform.dialogue

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.staticCompositionLocalOf
import com.waymate.app.BuildConfig
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors
import org.json.JSONObject

data class ScenarioDialogue(
    val source: String = "fallback",
    val lines: Map<String, String> = emptyMap(),
    val loading: Boolean = false,
    val fallbackSlots: Set<String> = emptySet(),
    val contextKey: String? = null,
) {
    fun line(key: String, fallback: String): String = lines[key] ?: fallback
    fun isGenerated(key: String): Boolean = source == "openai" && key in lines && key !in fallbackSlots
    fun permitsDriving(text: String): Boolean = source == "openai" &&
        text.codePointCount(0, text.length) <= 70 &&
        listOf("drive.rest", "drive.lunch").any { lines[it] == text }
}

val LocalScenarioDialogue = staticCompositionLocalOf { ScenarioDialogue() }

/** Separate executor: a slow LLM must never delay vehicle heartbeats or commands. */
class ScenarioDialogueController(
    private val display: (ScenarioDialogue) -> Unit,
    private val endpoint: String = BuildConfig.API_BASE_URL + "/api/agent/dialogue",
) {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var identity: String? = null
    private var attempted = false
    private var requesting = false
    @Volatile private var requestAllowed = false
    @Volatile private var generation = 0L
    @Volatile private var closed = false
    @Volatile private var connection: HttpURLConnection? = null

    fun synchronize(scope: String?, revision: String?, parkedAndActive: Boolean) {
        requestAllowed = parkedAndActive
        val nextIdentity = if (scope != null && revision != null) "$scope|$revision" else null
        if (identity != nextIdentity) {
            generation++; identity = nextIdentity; attempted = false; requesting = false
            connection?.disconnect()
            display(ScenarioDialogue())
        }
        if (!parkedAndActive && requesting) {
            generation++; connection?.disconnect(); requesting = false; attempted = false
            display(ScenarioDialogue())
        }
        if (closed || attempted || scope == null || revision == null || !parkedAndActive) return
        attempted = true
        requesting = true
        val token = generation
        display(ScenarioDialogue(loading = true))
        worker.execute {
            if (closed || token != generation || !requestAllowed) return@execute
            val result = runCatching {
                val current = URI(endpoint).toURL().openConnection() as HttpURLConnection
                connection = current
                try {
                    current.connectTimeout = 3000; current.readTimeout = 28000
                    current.instanceFollowRedirects = false
                    current.requestMethod = "POST"; current.doOutput = true
                    current.setRequestProperty("X-Demo-Actor", "car")
                    current.setRequestProperty("Content-Type", "application/json")
                    check(!closed && token == generation && requestAllowed)
                    current.outputStream.use { it.write(JSONObject().put("scope", scope).toString().toByteArray(Charsets.UTF_8)) }
                    check(current.responseCode == 200)
                    val bytes = current.inputStream.use { input ->
                        val output = ByteArrayOutputStream(); val buffer = ByteArray(4096)
                        while (true) {
                            val n = input.read(buffer); if (n < 0) break
                            require(output.size() + n <= 32768); output.write(buffer, 0, n)
                        }; output.toByteArray()
                    }
                    val body = JSONObject(String(bytes, Charsets.UTF_8))
                    require(body.getString("scope") == scope)
                    val source = body.getString("source")
                    require(source in setOf("openai", "fallback"))
                    val fallbacks = body.optJSONArray("fallbackSlots")
                    val fallbackSlots = (0 until (fallbacks?.length() ?: 0)).map { fallbacks!!.getString(it) }.toSet()
                    val lines = body.getJSONObject("lines")
                    val parsed = lines.keys().asSequence().associateWith { key ->
                        lines.getString(key).also { text ->
                            require(text.isNotBlank() && text.codePointCount(0, text.length) <= if (key.startsWith("drive.")) 70 else 140)
                            require(!text.contains('\n') && !text.contains('\r'))
                        }
                    }
                    ScenarioDialogue(source, parsed, fallbackSlots = fallbackSlots, contextKey = body.optString("contextKey").takeIf { it.isNotBlank() })
                } finally { current.disconnect(); if (connection === current) connection = null }
            }.getOrElse { ScenarioDialogue() }
            main.post { if (!closed && token == generation && requestAllowed) { requesting = false; display(result) } }
        }
    }

    // Pausing prevents late screen updates and automatic retries. The server's saved
    // packet remains reusable on the next Activity; failure does not spend again.
    fun pause() {
        requestAllowed = false; generation++; connection?.disconnect()
        if (requesting) { requesting = false; attempted = false; display(ScenarioDialogue()) }
    }
    fun close() { closed = true; pause(); worker.shutdownNow() }
}
