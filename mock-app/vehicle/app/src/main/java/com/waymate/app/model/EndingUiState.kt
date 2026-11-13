package com.waymate.app.model

data class EndingLine(val speaker: String, val text: String)

data class EndingAnswer(val id: String, val text: String, val reply: String)

data class EndingUiState(
    val visible: Boolean = false,
    val scope: String = "",
    val phase: String = "none",
    val replay: Boolean = false,
    val round: Int = 0,
    val myChoice: String? = null,
    val lines: List<EndingLine> = emptyList(),
    val prompt: String? = null,
    val answers: List<EndingAnswer> = emptyList(),
    val closing: String = "",
    val canInteract: Boolean = false,
    val blocked: Boolean = true,
    val mockNavigation: Boolean = false,
    val cleanupRequired: Boolean = false,
    val actions: Map<String, String> = emptyMap(),
    val notice: String? = null,
    val pending: Boolean = false,
    val canRetry: Boolean = false,
)
