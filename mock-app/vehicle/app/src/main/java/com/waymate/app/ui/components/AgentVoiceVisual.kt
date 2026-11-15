package com.waymate.app.ui.components

import android.animation.ValueAnimator
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import kotlin.math.sin
import kotlin.math.PI
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.graphicsLayer
import com.waymate.app.platform.restrictions.InteractionMode
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.waymate.app.R
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Muted
import com.waymate.app.platform.speech.SpeechState

/** Input states are presentation contracts only. Production has no microphone/STT adapter. */
internal enum class AgentVoicePhase(val label: String, val icon: Int) {
    IDLE("대화 대기", R.drawable.ic_voice_chat),
    SPEAKING("말하고 있어요", R.drawable.ic_voice_speaker),
    LISTENING("듣고 있어요", R.drawable.ic_voice_mic),
    PREPARING("음성 안내 준비 중", R.drawable.ic_voice_processing),
    STOPPED("안내를 멈췄어요", R.drawable.ic_pause),
    PROCESSING("말씀을 확인하고 있어요", R.drawable.ic_voice_processing),
    PAUSED("대화를 쉬고 있어요", R.drawable.ic_pause),
    UNAVAILABLE("음성 안내를 사용할 수 없어요", R.drawable.ic_voice_speaker),
}
internal data class AgentVoicePresentation(val phase: AgentVoicePhase, val simulated: Boolean = false, val inputNotice: String? = null, val labelOverride: String? = null) {
    companion object {
        fun playback(speech: SpeechState) = AgentVoicePresentation(when (speech.phase) {
            "speaking" -> AgentVoicePhase.SPEAKING
            "preparing" -> AgentVoicePhase.PREPARING
            "interrupted" -> AgentVoicePhase.STOPPED
            "unavailable" -> AgentVoicePhase.UNAVAILABLE
            else -> AgentVoicePhase.IDLE
        })
    }
}

/** The playback source is provided once at the app root; an input adapter is intentionally absent. */
internal val LocalAgentSpeech = compositionLocalOf { SpeechState(phase = "idle") }
internal val LocalAgentVoicePreview = compositionLocalOf<AgentVoicePresentation?> { null }
internal val LocalVehicleInteractionMode = compositionLocalOf { InteractionMode.PARKED }

@Composable
internal fun currentAgentVoice(speech: SpeechState = LocalAgentSpeech.current,
    explicit: AgentVoicePresentation? = null): AgentVoicePresentation {
    val voice = LocalAgentVoicePreview.current ?: explicit ?: AgentVoicePresentation.playback(speech)
    return if (LocalVehicleInteractionMode.current == InteractionMode.BLOCKED)
        AgentVoicePresentation(AgentVoicePhase.PAUSED, labelOverride = "상태 확인 후 이어가요") else voice
}

@Composable
internal fun AgentVoiceBadge(voice: AgentVoicePresentation, name: String? = null) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Surface(color = Color.White.copy(alpha = .92f), shape = RoundedCornerShape(32.dp)) {
            Row(Modifier.padding(horizontal = 24.dp, vertical = 16.dp).semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
            }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(painterResource(voice.phase.icon), null, Modifier.size(30.dp), tint = Forest)
                Text(listOfNotNull(name, voice.labelOverride ?: voice.phase.label).joinToString(" · "), color = Forest, style = MaterialTheme.typography.titleMedium)
            }
        }
        val notice = if (voice.simulated) "음성 UI 시연 · 마이크 꺼짐" else voice.inputNotice
        notice?.let { Text(it, color = Muted, style = MaterialTheme.typography.bodySmall) }
    }
}

/** Character stays still. Motion is confined to a small output meter or the listening halo.
 * Driving and reduced-motion presentations use distinct static geometry instead. */
@Composable
internal fun AgentVoicePortrait(avatarId: String, voice: AgentVoicePresentation, modifier: Modifier, animate: Boolean) {
    val moving = animate && LocalVehicleInteractionMode.current == InteractionMode.PARKED && LocalWindowInfo.current.isWindowFocused && ValueAnimator.areAnimatorsEnabled() &&
        voice.phase in listOf(AgentVoicePhase.SPEAKING, AgentVoicePhase.LISTENING, AgentVoicePhase.PROCESSING)
    val progress = if (moving) rememberInfiniteTransition(label = "voice-state").animateFloat(
        .2f, .8f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "voice-feedback").value else .5f
    val outputTravel = if (moving && voice.phase == AgentVoicePhase.SPEAKING)
        rememberInfiniteTransition(label = "speaking-ripples").animateFloat(
            0f, 1f, infiniteRepeatable(tween(1800, easing = LinearEasing), RepeatMode.Restart),
            label = "outward-sound").value else .5f
    BoxWithConstraints(modifier, contentAlignment = Alignment.Center) {
      val compact = maxHeight <= 200.dp
      Box(Modifier.fillMaxHeight().aspectRatio(1f), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxHeight().aspectRatio(1f).clearAndSetSemantics {}) {
            val w = size.width
            if (voice.phase == AgentVoicePhase.SPEAKING) {
                // A soft aura and short outward sound arcs make the still character feel active.
                // Unlike the long listening brackets, these marks radiate from beside the head.
                val breath = if (moving) (progress - .2f) / .6f else .35f
                val center = Offset(w * .5f, w * .52f)
                val radius = w * (.47f + .035f * breath)
                drawCircle(Brush.radialGradient(
                    listOf(Forest.copy(alpha = .09f + .035f * breath),
                        Forest.copy(alpha = .045f), Color.Transparent), center, radius),
                    radius = radius, center = center)
                repeat(3) { index ->
                    val travel = if (moving) (outputTravel + index / 3f) % 1f else .2f + index * .3f
                    val r = w * (.39f + .16f * travel)
                    val opacity = if (moving) sin(travel * PI).toFloat() * .43f else .25f - index * .055f
                    for (angle in listOf(-11f, 169f)) drawArc(Forest.copy(alpha = opacity), angle, 22f, false,
                        Offset(w * .5f - r, w * (if (compact) .20f else .26f) - r), Size(r * 2, r * 2),
                        style = Stroke((w * .009f).coerceAtLeast(1.5.dp.toPx()), cap = StrokeCap.Round))
                }
            } else if (voice.phase == AgentVoicePhase.LISTENING) {
                // Open side arcs indicate input, rather than a speaking/output waveform.
                // Pulse only the input halo, keeping the character and layout anchored.
                val haloScale = if (moving) 1f + (progress - .2f) * .08f else 1f
                val inset = w * (.5f - .425f * haloScale)
                for (start in listOf(140f, -40f)) drawArc(Forest.copy(alpha = .22f + progress * .12f), start, 80f, false,
                    Offset(inset, inset), Size(w - inset * 2, w - inset * 2), style = Stroke(w * .012f, cap = StrokeCap.Round))

            }
        }
        AgentCharacter(avatarId, Modifier.fillMaxSize(), motionEnabled = false)
        if (voice.phase == AgentVoicePhase.SPEAKING || voice.phase == AgentVoicePhase.LISTENING || voice.phase == AgentVoicePhase.PROCESSING) {
            Surface(Modifier.align(Alignment.CenterEnd).offset(x = if (!compact) 60.dp else if (avatarId == "a-01") 36.dp else 48.dp).size(if (compact) 48.dp else 64.dp)
                .graphicsLayer {
                    val pulse = if (moving && voice.phase in listOf(AgentVoicePhase.SPEAKING, AgentVoicePhase.LISTENING))
                        1f + (progress - .2f) * .1f else 1f
                    scaleX = pulse; scaleY = pulse
                }, shape = CircleShape,
                color = Color.White.copy(alpha = .94f)) {
                Box(contentAlignment = Alignment.Center) {
                    if (voice.phase == AgentVoicePhase.LISTENING)
                        Icon(painterResource(R.drawable.ic_voice_mic), null, Modifier.size(if (compact) 26.dp else 32.dp), tint = Forest)
                    else Canvas(Modifier.size(if (compact) 26.dp else 34.dp).clearAndSetSemantics {}) {
                        if (voice.phase == AgentVoicePhase.PROCESSING) repeat(3) { n ->
                            drawCircle(Forest.copy(alpha = if (n == 1) .4f + progress * .5f else .65f - progress * .4f),
                                3.dp.toPx(), Offset(size.width * (.15f + n * .35f), size.height / 2))
                        } else repeat(5) { n ->
                            val h = size.height * listOf(.3f, .65f, 1f, .65f, .3f)[n] * (.7f + progress * .3f)
                            val x = size.width * (.1f + n * .2f)
                            drawLine(Forest, Offset(x, (size.height-h)/2), Offset(x, (size.height+h)/2), 3.dp.toPx(), StrokeCap.Round)
                        }
                    }
                }
            }
        }
      }
    }
}
