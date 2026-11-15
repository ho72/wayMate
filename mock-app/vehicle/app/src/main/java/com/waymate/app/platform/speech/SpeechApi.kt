package com.waymate.app.platform.speech

import java.io.File
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import java.security.MessageDigest
import org.json.JSONObject

/** App-to-WayMate transport only. No ElevenLabs credential exists on the device. */
class SpeechApi(private val endpoint: String, private val headers: Map<String, String>) {
    @Volatile private var scope = "session"
    fun setScope(value: String) { scope = value }
    @Volatile private var connection: HttpURLConnection? = null
    fun cancel() { connection?.disconnect() }
    private fun open(path: String): HttpURLConnection =
        (URI(endpoint + path).toURL().openConnection() as HttpURLConnection).apply {
            connectTimeout = 4000; readTimeout = 30000; instanceFollowRedirects = false
            headers.forEach { (key, value) -> setRequestProperty(key, value) }
            connection = this
        }
    fun available(): Boolean {
        val current = open("/config")
        return try {
            if (current.responseCode != 200) false else {
                val bytes = current.inputStream.use { input ->
                    val output = ByteArrayOutputStream(); val buffer = ByteArray(1024)
                    while (true) {
                        val n = input.read(buffer); if (n < 0) break
                        require(output.size() + n <= 16384); output.write(buffer, 0, n)
                    }
                    output.toByteArray()
                }
                JSONObject(String(bytes, Charsets.UTF_8)).getBoolean("available")
            }
        } finally { current.disconnect(); connection = null }
    }
    fun download(text: String, voice: String, cacheDirectory: File): File {
        if (Thread.currentThread().isInterrupted) throw InterruptedException()
        require(text.isNotBlank() && text.codePointCount(0, text.length) <= 2000)
        val file = File.createTempFile("waymate-voice-", ".mp3", cacheDirectory)
        val key = MessageDigest.getInstance("SHA-256").digest(
            (endpoint + "\u0000" + scope + "\u0000" + voice + "\u0000" + text).toByteArray(Charsets.UTF_8)
        ).joinToString("") { "%02x".format(it) }
        val directory = File(cacheDirectory, "waymate-speech").apply { mkdirs() }
        val recorded = File(directory, "$key.mp3")
        if (recorded.isFile && recorded.length() in 1..(8 * 1024 * 1024).toLong()) {
            recorded.setLastModified(System.currentTimeMillis())
            recorded.copyTo(file, overwrite = true)
            return file
        }
        val current = open("")
        try {
            current.requestMethod = "POST"; current.doOutput = true
            current.setRequestProperty("Content-Type", "application/json")
            current.setRequestProperty("Accept", "audio/mpeg")
            val body = JSONObject().put("requestId", UUID.nameUUIDFromBytes(key.toByteArray(Charsets.UTF_8)).toString())
                .put("text", text).put("voice", voice).put("consent", true)
            if (Thread.currentThread().isInterrupted) throw InterruptedException()
            current.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            check(current.responseCode == 200) { "음성 서버에 연결하지 못했어요. 설정과 연결 상태를 확인해 주세요." }
            check(current.contentType?.substringBefore(';') == "audio/mpeg")
            current.inputStream.use { input -> file.outputStream().use { output ->
                val buffer = ByteArray(8192); var bytes = 0
                while (true) {
                    if (Thread.currentThread().isInterrupted) throw InterruptedException()
                    val n = input.read(buffer); if (n < 0) break
                    bytes += n; require(bytes <= 8 * 1024 * 1024)
                    output.write(buffer, 0, n)
                }
                require(bytes > 0)
            } }
            // The player deletes its temporary input. Keep a separate private copy so
            // replaying the same character/text does not spend ElevenLabs credits again.
            file.copyTo(recorded, overwrite = true)
            var total = directory.listFiles()?.sumOf { it.length() } ?: 0L
            val oldest = directory.listFiles()?.sortedBy { it.lastModified() }.orEmpty()
            var count = oldest.size
            for (old in oldest) {
                if (total <= 32L * 1024 * 1024 && count <= 24) break
                if (old != recorded) { val size = old.length(); if (old.delete()) { total -= size; count-- } }
            }
            return file
        } catch (e: Exception) { file.delete(); throw e }
        finally { current.disconnect(); connection = null }
    }
}
