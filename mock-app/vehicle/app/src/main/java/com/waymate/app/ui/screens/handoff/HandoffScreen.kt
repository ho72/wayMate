package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.ui.components.TravelFriend
import com.waymate.app.ui.theme.Canvas
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Ink
import com.waymate.app.ui.theme.Mint
import com.waymate.app.ui.theme.Muted
import com.waymate.app.ui.theme.WayMateTheme

@Composable
fun HandoffScreen(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = Canvas) {
        BoxWithConstraints {
            val wide = maxWidth >= 840.dp
            val margin = if (wide) 56.dp else 28.dp

            Column(
                modifier =
                    Modifier.fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = margin, vertical = 28.dp)
            ) {
                BrandHeader(wide)
                Spacer(Modifier.height(if (wide) 52.dp else 32.dp))

                if (wide) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(48.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Welcome(Modifier.weight(1f), wide = true, state = state)
                        JourneyCard(state, onLoadJourney, Modifier.weight(1f))
                    }
                } else {
                    Welcome(Modifier.fillMaxWidth(), wide = false, state = state)
                    Spacer(Modifier.height(32.dp))
                    JourneyCard(state, onLoadJourney, Modifier.fillMaxWidth())
                }

                Spacer(Modifier.height(36.dp))
                Text(
                    text = stringResource(R.string.travel_message),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Muted,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
        }
    }
}

@Composable
private fun BrandHeader(wide: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(48.dp).background(Forest, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text("w", color = Mint, fontSize = 32.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text(
                    stringResource(R.string.app_name),
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = Ink,
                )
                if (wide) {
                    Text(
                        stringResource(R.string.brand_tagline),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Muted,
                    )
                }
            }
        }

        Text(
            text = stringResource(R.string.preview_label),
            modifier =
                Modifier.background(Mint, RoundedCornerShape(50))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            color = Forest,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun Welcome(modifier: Modifier, wide: Boolean, state: HandoffUiState) {
    Column(modifier = modifier, horizontalAlignment = Alignment.Start) {
        Text(
            state.journey?.let { stringResource(R.string.loaded_greeting, it.alias) }
                ?: stringResource(R.string.welcome_eyebrow),
            color = Forest,
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            stringResource(R.string.welcome_title),
            fontSize = if (wide) 48.sp else 36.sp,
            lineHeight = if (wide) 66.sp else 50.sp,
            fontWeight = FontWeight.Bold,
            color = Ink,
        )
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.welcome_description),
            color = Muted,
            fontSize = 20.sp,
            lineHeight = 32.sp,
        )
        Spacer(Modifier.height(30.dp))
        TravelFriend(
            Modifier.size(if (wide) 176.dp else 124.dp),
            sunny = state.journey?.avatarId == "a-02",
        )
    }
}

@Composable
private fun JourneyCard(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(32.dp),
        color = Color.White,
        tonalElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(32.dp)) {
            Text(
                if (state.journey != null) stringResource(R.string.loaded_title)
                else stringResource(R.string.journey_title),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Ink,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.journey_description),
                fontSize = 18.sp,
                lineHeight = 28.sp,
                color = Muted,
            )
            Spacer(Modifier.height(30.dp))
            val journey = state.journey
            if (journey == null) {
                JourneyStep("01", stringResource(R.string.journey_step_one))
                Spacer(Modifier.height(20.dp))
                JourneyStep("02", stringResource(R.string.journey_step_two))
            } else {
                Text(
                    stringResource(
                        R.string.loaded_profile,
                        journey.alias,
                        stringResource(
                            if (journey.avatarId == "a-02") R.string.avatar_sun
                            else R.string.avatar_sprout
                        ),
                        stringResource(
                            if (journey.style == "calm") R.string.style_calm
                            else R.string.style_humor
                        ),
                    ),
                    color = Ink,
                    fontSize = 20.sp,
                    lineHeight = 32.sp,
                )
                Spacer(Modifier.height(14.dp))
                val cafe = stringResource(R.string.interest_cafe)
                val sea = stringResource(R.string.interest_sea)
                Text(
                    journey.interests.joinToString(" · ") { if (it == "cafe") cafe else sea },
                    color = Forest,
                    fontSize = 18.sp,
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    stringResource(
                        R.string.loaded_trip,
                        journey.date,
                        journey.nextVisit,
                        journey.nextVisitLabel,
                        journey.returnPlaceLabel,
                        journey.returnEstimate,
                        journey.returnDeadline,
                    ),
                    color = Muted,
                    fontSize = 18.sp,
                    lineHeight = 30.sp,
                )
            }
            Spacer(Modifier.height(32.dp))

            Button(
                onClick = onLoadJourney,
                enabled = state.loadEnabled && !state.isLoading,
                modifier = Modifier.fillMaxWidth().height(64.dp),
                shape = RoundedCornerShape(20.dp),
                colors =
                    ButtonDefaults.buttonColors(
                        disabledContainerColor = Mint,
                        disabledContentColor = Forest,
                    ),
            ) {
                Text(
                    stringResource(
                        when {
                            state.isLoading -> R.string.loading_journey
                            state.retryPending -> R.string.retry_pending
                            else -> R.string.load_journey
                        }
                    ),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                state.notice ?: stringResource(R.string.preview_notice),
                fontSize = 15.sp,
                lineHeight = 24.sp,
                color = Muted,
            )
        }
    }
}

@Composable
private fun JourneyStep(number: String, description: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.size(36.dp).background(Canvas, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(number, color = Forest, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        }
        Spacer(Modifier.width(14.dp))
        Text(description, fontSize = 18.sp, lineHeight = 28.sp, color = Ink)
    }
}

@Preview(name = "Pleos wide", widthDp = 1280, heightDp = 800, showBackground = true)
@Preview(name = "Pleos compact", widthDp = 480, heightDp = 800, showBackground = true)
@Composable
private fun HomePreview() {
    WayMateTheme {
        HandoffScreen(state = HandoffUiState(), onLoadJourney = {})
    }
}
