package com.waymate.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.ui.theme.*

/** Presentation only: no route, SDK, owner or driving-state changes. */
@Composable
internal fun VehicleBackground(
    modifier: Modifier = Modifier,
    pageTag: String? = null,
    mode: InteractionMode = InteractionMode.PARKED,
    onBack: (() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    CompositionLocalProvider(LocalContentColor provides Ink, LocalVehicleInteractionMode provides mode) {
        Box(modifier.fillMaxSize().background(Brush.verticalGradient(listOf(
            CompanionPalette.SceneTop, CompanionPalette.SceneMiddle, CompanionPalette.SceneBottom,
        )))) {
            if (pageTag == null) content()
            else Column(Modifier.fillMaxSize()) {
                VehicleHeader(pageTag, mode)
                onBack?.let { back ->
                    Row(Modifier.fillMaxWidth().background(Sky).padding(horizontal = 28.dp, vertical = 8.dp)) {
                        VehicleBackButton(back)
                    }
                }
                Box(Modifier.weight(1f).fillMaxWidth().clipToBounds(), content = content)
            }
        }
    }
}

@Composable
internal fun VehicleBackButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = onClick, modifier = modifier.testTag("vehicle-back").width(196.dp).heightIn(min = 96.dp),
        colors = ButtonDefaults.textButtonColors(contentColor = Forest),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 20.dp)) {
        Text("‹  이전", fontSize = 34.sp, lineHeight = 44.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun VehicleButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                           content: @Composable RowScope.() -> Unit) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Button(onClick, Modifier.widthIn(min = 240.dp, max = 440.dp).fillMaxWidth().heightIn(min = 104.dp), enabled = enabled,
            shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(horizontal = 28.dp, vertical = 24.dp)) {
            ProvideTextStyle(MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp, lineHeight = 32.sp,
                fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)) { content() }
        }
    }
}

@Composable
internal fun VehicleOutlineButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
                                  content: @Composable RowScope.() -> Unit) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        OutlinedButton(onClick, Modifier.widthIn(min = 240.dp, max = 440.dp).fillMaxWidth().heightIn(min = 104.dp), enabled = enabled,
            shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(horizontal = 28.dp, vertical = 24.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White.copy(alpha = .8f))) {
            ProvideTextStyle(MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp, lineHeight = 32.sp,
                fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)) { content() }
        }
    }
}

@Composable
internal fun VehicleDialogButton(onClick: () -> Unit, enabled: Boolean = true, secondary: Boolean = false,
                                 content: @Composable RowScope.() -> Unit) {
    val dimensions = Modifier.fillMaxWidth().heightIn(min = 112.dp)
    val style = MaterialTheme.typography.titleLarge.copy(fontSize = 26.sp, lineHeight = 36.sp,
        fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    if (secondary) OutlinedButton(onClick, dimensions, enabled = enabled, shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 20.dp)) {
        ProvideTextStyle(style) { content() }
    } else Button(onClick, dimensions, enabled = enabled, shape = RoundedCornerShape(22.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 20.dp)) {
        ProvideTextStyle(style) { content() }
    }
}

@Composable
internal fun VehicleHeader(pageTag: String, mode: InteractionMode = InteractionMode.PARKED) {
    Row(Modifier.fillMaxWidth().height(112.dp).background(Sky).testTag("vehicle-header")
        .padding(horizontal = 28.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) { DurumitLogo() }
        Column(Modifier.weight(1f).testTag("vehicle-mode").semantics(mergeDescendants = true) {},
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(when (mode) {
                InteractionMode.PARKED -> "정차 중"
                InteractionMode.DRIVING_LIMITED -> "주행 중"
                InteractionMode.BLOCKED -> "상태 확인 중"
            }, color = Forest, fontSize = 26.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (mode == InteractionMode.DRIVING_LIMITED)
                Text("간편 모드", color = Forest, fontSize = 22.sp, lineHeight = 30.sp,
                    fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, maxLines = 1)
        }
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            Surface(Modifier.heightIn(min = 64.dp), color = Color.White.copy(alpha = .72f), shape = RoundedCornerShape(32.dp)) {
                Box(Modifier.widthIn(max = 244.dp).padding(horizontal = 20.dp, vertical = 14.dp),
                    contentAlignment = Alignment.Center) {
                    Text(pageTag, Modifier.testTag("vehicle-page-tag"), color = Forest,
                        fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun DurumitLogo() {
    val approved = ImageBitmap.imageResource(R.drawable.durumit_wordmark)
    Canvas(Modifier.width(198.dp).aspectRatio(1977f / 405f).testTag("durumit-logo")
        .semantics { contentDescription = "두루밋" }) {
        // Use the same transparent B wordmark as mobile; crop only empty alpha margins.
        drawImage(approved, srcOffset = IntOffset(97, 165), srcSize = IntSize(1977, 405),
            dstSize = IntSize(size.width.toInt(), size.height.toInt()))
    }
}

@Composable
internal fun SpeechBubble(text: String, modifier: Modifier = Modifier) {
    Surface(modifier, color = CompanionPalette.Surface.copy(alpha = CompanionPalette.SurfaceOpacity), shape = RoundedCornerShape(28.dp), shadowElevation = 2.dp) {
        Text(text, Modifier.padding(horizontal = 26.dp, vertical = 18.dp), color = Forest,
            style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun VehicleInfoCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, color = CompanionPalette.Surface.copy(alpha = CompanionPalette.SurfaceOpacity), shape = RoundedCornerShape(28.dp),
        border = BorderStroke(1.dp, SkyLine)) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
internal fun VehicleAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier,
                           enabled: Boolean = true, secondary: Boolean = false) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Button(onClick = onClick, enabled = enabled,
            modifier = Modifier.widthIn(min = 240.dp, max = 440.dp).fillMaxWidth().heightIn(min = 128.dp),
            shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(horizontal = 28.dp, vertical = 24.dp),
            colors = ButtonDefaults.buttonColors(containerColor = if (secondary) Mint else Forest,
                contentColor = if (secondary) Forest else Color.White)) {
            Text(label, Modifier.fillMaxWidth(), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center,
                fontWeight = FontWeight.SemiBold)
        }
    }
}
