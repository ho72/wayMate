package com.waymate.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

internal val Forest = Color(0xFF246A55)
internal val Ink = Color(0xFF203B32)
internal val Muted = Color(0xFF65756C)
internal val Canvas = Color(0xFFF5F6F1)
internal val Mint = Color(0xFFE4EDDD)

private val WayMateColors = lightColorScheme(
    primary = Forest,
    onPrimary = Color.White,
    primaryContainer = Mint,
    onPrimaryContainer = Ink,
    background = Canvas,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    onSurfaceVariant = Muted,
)

@Composable
fun WayMateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WayMateColors,
        typography = Typography(),
        content = content,
    )
}
