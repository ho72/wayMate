package com.waymate.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.waymate.app.R

/** Animated presentation of the approved rendered still. No 3D rig or precise lip sync. */
@Composable
fun AgentCharacter(
    avatarId: String,
    modifier: Modifier = Modifier,
    speechPhase: String = "idle",
    motionEnabled: Boolean = true,
) {
    val mode =
        CharacterMotionPolicy.select(
            speechPhase,
            motionEnabled,
            LocalWindowInfo.current.isWindowFocused,
        )
    val movement =
        if (mode != CharacterMotion.STILL) {
            rememberInfiniteTransition(label = "character-motion")
                .animateFloat(
                    initialValue = 0f,
                    targetValue = 1f,
                    animationSpec =
                        infiniteRepeatable(
                            tween(
                                if (mode == CharacterMotion.SPEAKING) 280 else 2200,
                                easing = FastOutSlowInEasing,
                            ),
                            RepeatMode.Reverse,
                        ),
                    label = "character-breath",
                )
        } else null
    val animated =
        modifier.graphicsLayer {
            val value = movement?.value ?: 0f
            scaleX = 1f + value * if (mode == CharacterMotion.SPEAKING) 0.015f else 0.008f
            scaleY = scaleX
            rotationZ = if (mode == CharacterMotion.SPEAKING) (value - 0.5f) * 1.2f else 0f
        }
    Image(
        painterResource(if (avatarId == "a-01") R.drawable.blue_dragon else R.drawable.travel_bear),
        if (avatarId == "a-01") stringResource(R.string.character_blue_dragon) else "따뜻한 곰 여행 친구",
        animated,
        contentScale = ContentScale.Fit,
    )
}
