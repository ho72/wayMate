package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.waymate.app.ui.components.AgentVoicePresentation
import com.waymate.app.ui.components.agentName
import com.waymate.app.ui.components.AgentVoiceBadge
import com.waymate.app.ui.components.AgentVoicePortrait
import com.waymate.app.ui.components.currentAgentVoice
import com.waymate.app.ui.components.LocalAgentSpeech
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.ui.components.LocalVehicleInteractionMode
import com.waymate.app.ui.components.VehicleBackButton
import com.waymate.app.ui.theme.Ink
import com.waymate.app.ui.theme.Muted

/** Approved home composition shared by companion screens. */
@Composable
internal fun CompanionScene(
    avatarId: String,
    bubble: String,
    title: String,
    subtitle: String? = null,
    preparing: Boolean = false,
    speechPhase: String? = null,
    motionEnabled: Boolean,
    onBack: (() -> Unit)? = null,
    pinActions: Boolean = false,
    voicePresentation: AgentVoicePresentation? = null,
    supporting: @Composable () -> Unit = {},
    card: @Composable () -> Unit,
    actions: @Composable () -> Unit,
    footer: @Composable () -> Unit = {},
) {
    val voice = currentAgentVoice(speechPhase?.let { SpeechState(phase = it) } ?: LocalAgentSpeech.current, voicePresentation)
    val animateVoice = motionEnabled && LocalVehicleInteractionMode.current == InteractionMode.PARKED
    BoxWithConstraints {
        val wide = useSideBySideLayout(maxWidth.value, maxHeight.value)
        val backInset = if (onBack != null) 112.dp else 0.dp
        val viewportHeight = (maxHeight - backInset).coerceAtLeast(0.dp)
        val scroll = rememberScrollState()
        if (pinActions && !wide) {
            Column(Modifier.fillMaxSize().padding(top = backInset).clipToBounds()) {
                Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll)
                    .padding(horizontal = 32.dp, vertical = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    CompanionCharacter(avatarId, preparing, animateVoice, false, Modifier.fillMaxWidth(), compact = true, voice = voice)
                    CompanionHeading(title, subtitle, TextAlign.Center)
                    card()
                    supporting()
                    footer()
                }
                Surface(color = Color.White.copy(alpha = .32f)) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)) { actions() }
                }
            }
        } else Column(Modifier.fillMaxSize().padding(top = backInset).clipToBounds().verticalScroll(scroll)
            .heightIn(min = viewportHeight).height(IntrinsicSize.Min)
            .padding(start = 32.dp, end = 32.dp, top = (if (wide) 120.dp else 140.dp) - backInset, bottom = 40.dp)) {
            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 22.dp), contentAlignment = Alignment.Center) {
                if (wide) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                    CompanionCharacter(avatarId, preparing, animateVoice, true, Modifier.weight(1f), voice = voice)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                        CompanionHeading(title, subtitle, TextAlign.Start)
                        card()
                        actions()
                        supporting()
                    }
                } else Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    CompanionCharacter(avatarId, preparing, animateVoice, false, Modifier.fillMaxWidth(), voice = voice)
                    CompanionHeading(title, subtitle, TextAlign.Center)
                    card()
                    actions()
                    supporting()
                }
            }
            footer()
        }
        onBack?.let { back ->
            VehicleBackButton(back, Modifier.align(Alignment.TopStart).padding(start = 28.dp, top = 8.dp))
        }
    }
}

@Composable
private fun CompanionCharacter(avatarId: String, preparing: Boolean,
    motionEnabled: Boolean, wide: Boolean, modifier: Modifier, compact: Boolean = false, voice: AgentVoicePresentation) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AgentVoiceBadge(voice, agentName(avatarId))
        Spacer(Modifier.height(if (compact) 0.dp else 36.dp))
        val characterModifier = Modifier.fillMaxWidth().height(if (compact) 180.dp else if (!wide) 260.dp else if (preparing) 340.dp else 460.dp)
                .graphicsLayer {
                    translationY = (if (compact) 0.dp else if (wide) (-16).dp else (-36).dp).toPx()
                    if (!wide && !compact) { scaleX = 1.15f; scaleY = 1.15f }
                }
        AgentVoicePortrait(avatarId, voice, characterModifier, animate = motionEnabled)
    }
}

@Composable
private fun CompanionHeading(title: String, subtitle: String?, textAlign: TextAlign) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, Modifier.fillMaxWidth(), style = MaterialTheme.typography.headlineLarge,
            color = Ink, textAlign = textAlign)
        subtitle?.let {
            Text(it, Modifier.fillMaxWidth(), color = Muted, style = MaterialTheme.typography.bodyLarge,
                textAlign = textAlign)
        }
    }
}

@Composable
internal fun CompanionInfoCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxWidth(), color = Color.White.copy(alpha = .38f),
        shape = RoundedCornerShape(32.dp), border = BorderStroke(1.dp, Color.White.copy(alpha = .55f))) {
        Column(Modifier.padding(horizontal = 30.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
}
