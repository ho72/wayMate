package com.waymate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.waymate.app.ui.theme.*

/** Presentation only: no route, SDK, owner or driving-state changes. */
@Composable
internal fun VehicleBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    CompositionLocalProvider(LocalContentColor provides Ink) {
        Box(modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Sky, Color(0xFFEDF9FD), Color(0xFFE3F8F1)))), content = content)
    }
}

@Composable
internal fun VehicleButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                           content: @Composable RowScope.() -> Unit) {
    Button(onClick, modifier.fillMaxWidth().heightIn(min = 76.dp), enabled = enabled,
        shape = RoundedCornerShape(22.dp), contentPadding = PaddingValues(20.dp), content = content)
}

@Composable
internal fun VehicleOutlineButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                                  content: @Composable RowScope.() -> Unit) {
    OutlinedButton(onClick, modifier.fillMaxWidth().heightIn(min = 76.dp), enabled = enabled,
        shape = RoundedCornerShape(22.dp), contentPadding = PaddingValues(20.dp),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White.copy(alpha = .8f)), content = content)
}

@Composable
internal fun VehicleHeader(status: String, onBack: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().heightIn(min = 88.dp).padding(horizontal = 28.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text("말이통행", color = Forest, style = MaterialTheme.typography.headlineLarge)
        if (onBack == null) {
            Surface(color = Color.White.copy(alpha = .72f), shape = RoundedCornerShape(30.dp)) {
                Text(status, Modifier.padding(horizontal = 18.dp, vertical = 10.dp), color = Forest,
                    style = MaterialTheme.typography.labelMedium)
            }
        } else TextButton(onClick = onBack) { Text("내 친구 홈으로") }
    }
}

@Composable
internal fun SpeechBubble(text: String, modifier: Modifier = Modifier) {
    Surface(modifier, color = Color.White, shape = RoundedCornerShape(28.dp), shadowElevation = 2.dp) {
        Text(text, Modifier.padding(horizontal = 26.dp, vertical = 18.dp), color = Forest,
            style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun VehicleInfoCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, color = Color.White.copy(alpha = .86f), shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, SkyLine)) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
internal fun VehicleAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier,
                           enabled: Boolean = true, secondary: Boolean = false) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 88.dp),
        shape = RoundedCornerShape(22.dp), contentPadding = PaddingValues(horizontal = 22.dp, vertical = 18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = if (secondary) Mint else Forest,
            contentColor = if (secondary) Forest else Color.White)) {
        Text(label, Modifier.fillMaxWidth(), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center,
            fontWeight = FontWeight.SemiBold)
    }
}
