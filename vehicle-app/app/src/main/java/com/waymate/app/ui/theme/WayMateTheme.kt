package com.waymate.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.material3.LocalMinimumInteractiveComponentSize

// Shared v5 palette. Keep names stable for existing presentation-only consumers.
internal val Forest = CompanionPalette.Primary
internal val Ink = CompanionPalette.Ink
internal val Muted = CompanionPalette.Muted
internal val Canvas = CompanionPalette.SceneMiddle
internal val Mint = CompanionPalette.Mint
internal val Sky = CompanionPalette.SceneTop
internal val SkyLine = CompanionPalette.Outline
internal val OceanBlue = Color(0xFF226EEB)

private val WayMateColors = lightColorScheme(
    primary = Forest,
    onPrimary = Color.White,
    primaryContainer = Mint,
    onPrimaryContainer = Ink,
    background = Canvas,
    onBackground = Ink,
    surface = CompanionPalette.Surface,
    onSurface = Ink,
    onSurfaceVariant = Muted,
    secondary = Forest,
    secondaryContainer = Mint,
    onSecondaryContainer = Forest,
    surfaceVariant = Color(0xFFF4FBFE),
    surfaceContainerLow = Color(0xFFF8FCFF),
    surfaceContainer = Color(0xFFF4FAFD),
    surfaceContainerHigh = Color(0xFFEDF7FC),
    surfaceContainerHighest = Color(0xFFE7F3FA),
    outline = Color(0xFF82ADB9),
    outlineVariant = SkyLine,
)

@Composable
fun WayMateTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 64.dp) {
      MaterialTheme(
        colorScheme = WayMateColors,
        typography = Typography(
            headlineLarge = TextStyle(fontSize = 40.sp, lineHeight = 50.sp, fontWeight = FontWeight.Bold),
            headlineMedium = TextStyle(fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold),
            headlineSmall = TextStyle(fontSize = 26.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold),
            titleLarge = TextStyle(fontSize = 28.sp, lineHeight = 38.sp, fontWeight = FontWeight.SemiBold),
            titleMedium = TextStyle(fontSize = 26.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold),
            bodyLarge = TextStyle(fontSize = 26.sp, lineHeight = 38.sp),
            bodyMedium = TextStyle(fontSize = 24.sp, lineHeight = 34.sp),
            bodySmall = TextStyle(fontSize = 22.sp, lineHeight = 32.sp),
            labelLarge = TextStyle(fontSize = 24.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold),
            labelMedium = TextStyle(fontSize = 22.sp, lineHeight = 32.sp, fontWeight = FontWeight.Medium),
            labelSmall = TextStyle(fontSize = 15.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium),
        ),
        shapes = Shapes(
            small = RoundedCornerShape(16.dp),
            medium = RoundedCornerShape(22.dp),
            large = RoundedCornerShape(28.dp),
            extraLarge = RoundedCornerShape(32.dp),
        ),
        content = content,
      )
    }
}
