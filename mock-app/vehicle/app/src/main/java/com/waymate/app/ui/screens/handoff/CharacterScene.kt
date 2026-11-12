package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun CharacterScene(
    resetKey: Any,
    character: @Composable (Modifier, Boolean) -> Unit,
    content: @Composable (Modifier) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
        val scroll = rememberScrollState()
        LaunchedEffect(resetKey, wide) { scroll.scrollTo(0) }
        if (wide) {
            Row(
                Modifier.fillMaxSize().padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                character(Modifier.weight(.7f).widthIn(max = 280.dp), true)
                content(Modifier.weight(1.7f).verticalScroll(scroll))
            }
        } else {
            Column(
                Modifier.fillMaxSize().verticalScroll(scroll).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                character(Modifier.fillMaxWidth(), false)
                content(Modifier.fillMaxWidth())
            }
        }
    }
}
