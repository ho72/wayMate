package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.waymate.app.ui.components.VehicleAction
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Muted

internal data class CompanionActionItem(
    val label: String,
    val onClick: () -> Unit,
    val enabled: Boolean = true,
    val secondary: Boolean = false,
    val quiet: Boolean = false,
)

/** Consistent large action areas; extra actions continue in pairs below. */
@Composable
internal fun CompanionActionGrid(items: List<CompanionActionItem>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items.filterNot { it.quiet }.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally)) {
                pair.forEach { item ->
                    val area = if (pair.size == 1) Modifier.widthIn(max = 440.dp) else Modifier.weight(1f)
                    VehicleAction(item.label, item.onClick, area, item.enabled, item.secondary)
                }
            }
        }
        items.filter { it.quiet }.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterHorizontally)) {
                pair.forEach { item ->
                    TextButton(onClick = item.onClick, enabled = item.enabled,
                        modifier = if (pair.size == 1) Modifier.widthIn(max = 440.dp).fillMaxWidth().heightIn(min = 96.dp)
                            else Modifier.weight(1f).heightIn(min = 96.dp),
                        contentPadding = PaddingValues(20.dp)) {
                        Text(item.label, style = MaterialTheme.typography.titleMedium,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }
            }
        }
    }
}

/** Whole-row selection instead of small radio controls. */
@Composable
internal fun CompanionChoice(text: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Surface(color = if (selected) Forest.copy(alpha = .10f) else androidx.compose.ui.graphics.Color.Transparent,
        shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 96.dp).semantics { this.selected = selected }
            .clickable(enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(text, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else Muted)
            Box(Modifier.size(32.dp).border(2.dp, if (enabled) Forest else Muted, CircleShape), contentAlignment = Alignment.Center) {
                if (selected) Text("✓", color = Forest, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
