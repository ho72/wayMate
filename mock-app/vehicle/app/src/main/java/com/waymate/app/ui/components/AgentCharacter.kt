package com.waymate.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.waymate.app.R

/** a-01 explicitly maps to the approved blue-dragon-v1 still. No 3D rig or lip sync is claimed. */
@Composable
fun AgentCharacter(avatarId: String, modifier: Modifier = Modifier) {
    if (avatarId == "a-01")
        Image(
            painterResource(R.drawable.blue_dragon),
            stringResource(R.string.character_blue_dragon),
            modifier,
            contentScale = ContentScale.Fit,
        )
    else
        Box(modifier, contentAlignment = Alignment.Center) {
            TravelFriend(Modifier.aspectRatio(1f), sunny = true)
        }
}
