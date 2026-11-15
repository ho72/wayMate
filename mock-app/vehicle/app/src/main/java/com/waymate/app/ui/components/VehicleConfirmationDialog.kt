package com.waymate.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.waymate.app.ui.theme.*

/** App-branded confirmation panel. Existing confirmation callbacks and permission gates stay at callers. */
@Composable
internal fun VehicleConfirmationDialog(
    onDismissRequest: () -> Unit,
    title: @Composable () -> Unit,
    text: @Composable () -> Unit,
    confirmButton: @Composable () -> Unit,
    dismissButton: (@Composable () -> Unit)? = null,
) {
    Dialog(onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false,
        dismissOnClickOutside = false)) {
        BoxWithConstraints(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
            Surface(Modifier.widthIn(max = 840.dp).fillMaxWidth().heightIn(max = maxHeight)
                .testTag("vehicle-confirmation"), color = Canvas,
                shape = RoundedCornerShape(24.dp), border = BorderStroke(1.dp, SkyLine)) {
                Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    ProvideTextStyle(MaterialTheme.typography.headlineMedium.copy(fontSize = 32.sp,
                        lineHeight = 44.sp, fontWeight = FontWeight.Bold, color = Ink)) { title() }
                    Box(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                        ProvideTextStyle(MaterialTheme.typography.bodyLarge.copy(fontSize = 24.sp,
                            lineHeight = 36.sp, color = Ink)) { text() }
                    }
                    HorizontalDivider(color = SkyLine)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        dismissButton?.let { dismiss -> Box(Modifier.weight(1f)) { dismiss() } }
                        Box(Modifier.weight(1f)) { confirmButton() }
                    }
                }
            }
        }
    }
}

/** Place and preserved destination are separate visual decisions instead of a paragraph of instructions. */
@Composable
internal fun VehicleRouteChangeSummary(place: String, destination: String, remove: Boolean = false,
                                       simulated: Boolean = false) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (remove) "제거할 경유지" else "추가할 경유지", color = Muted,
                fontSize = 20.sp, lineHeight = 28.sp)
            Text(place, color = Forest, fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold)
        }
        VehicleInfoCard(Modifier.fillMaxWidth()) {
            Text("유지되는 목적지", color = Muted, fontSize = 20.sp, lineHeight = 28.sp)
            Text(destination, color = Ink, fontSize = 26.sp, lineHeight = 36.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(if (remove) "현재 목적지는 유지하고, 두루밋이 추가한 경유지만 제거해요."
            else "현재 목적지는 유지하고, 이 장소에 먼저 들러요.",
            color = Ink, fontSize = 24.sp, lineHeight = 36.sp)
        if (simulated) Text("모의 경로 · 실제 내비는 변경하지 않아요.", color = Muted,
            fontSize = 20.sp, lineHeight = 28.sp)
    }
}
