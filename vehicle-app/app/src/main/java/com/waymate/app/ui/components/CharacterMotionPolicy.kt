package com.waymate.app.ui.components

internal enum class CharacterMotion {
    STILL,
    BREATHING,
    SPEAKING,
}

internal object CharacterMotionPolicy {
    fun select(phase: String, enabled: Boolean, focused: Boolean): CharacterMotion =
        when {
            !enabled || !focused -> CharacterMotion.STILL
            phase == "speaking" -> CharacterMotion.SPEAKING
            phase in listOf("idle", "finished") -> CharacterMotion.BREATHING
            else -> CharacterMotion.STILL
        }
}
