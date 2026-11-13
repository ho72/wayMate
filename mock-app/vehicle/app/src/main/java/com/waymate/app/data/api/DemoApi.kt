package com.waymate.app.data.api

import com.waymate.app.BuildConfig
import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject

class ApiException(val status: Int, val body: JSONObject) :
    Exception(body.optJSONObject("error")?.optString("message") ?: "서버 오류")

/** Blocking transport. Call only from the repository's single background executor. */
class DemoApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    fun request(path: String, body: JSONObject? = null): JSONObject {
        val connection = URI(baseUrl + path).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            connection.setRequestProperty("X-Demo-Actor", "car")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use {
                    it.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val result = JSONObject(stream.bufferedReader(Charsets.UTF_8).use { it.readText() })
            if (code !in 200..299) throw ApiException(code, result)
            return result
        } finally {
            connection.disconnect()
        }
    }
}
