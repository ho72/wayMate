package com.waymate.app.model

data class ContentQuestion(
    val id: String,
    val text: String,
    val answer: String,
    val known: Boolean,
)

data class ContentPreset(val id: String, val text: String)

data class ContentThread(
    val id: String,
    val status: String,
    val text: String,
    val response: String?,
    val followup: String?,
    val reply: String?,
    val unread: Boolean,
)

data class ContentUiState(
    val visible: Boolean = false,
    val blocked: Boolean = true,
    val scope: String = "",
    val peerAlias: String? = null,
    val questions: List<ContentQuestion> = emptyList(),
    val messages: List<ContentPreset> = emptyList(),
    val replies: List<ContentPreset> = emptyList(),
    val threads: List<ContentThread> = emptyList(),
    val actions: Map<String, String> = emptyMap(),
    val canInteract: Boolean = false,
    val notice: String? = null,
    val pendingType: String? = null,
    val canRetry: Boolean = false,
    val replyDone: String = "",
)
