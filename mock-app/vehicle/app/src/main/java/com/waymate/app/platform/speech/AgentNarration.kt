package com.waymate.app.platform.speech

import androidx.compose.runtime.staticCompositionLocalOf

/** Speaker identity travels with the utterance, independently of generated wording. */
data class AgentNarration(val text: String, val avatarId: String, val automatic: Boolean = false)
val LocalAgentNarrator = staticCompositionLocalOf<((AgentNarration) -> Unit)?> { null }

object AgentNarrationPolicy {
    fun voice(avatarId: String): String = if (avatarId == "a-01") "dragon" else "bear"
}
