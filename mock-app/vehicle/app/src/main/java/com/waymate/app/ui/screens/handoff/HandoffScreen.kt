package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R
import com.waymate.app.ui.components.AgentCharacter
import com.waymate.app.ui.theme.*

@Composable
fun HandoffScreen(
    state: HandoffUiState,
    onLoadJourney: () -> Unit,
    onStartTrip: (com.waymate.app.model.Journey?) -> Unit,
) {
    var confirmStart by remember { mutableStateOf(false) }
    var startPreview by remember { mutableStateOf<com.waymate.app.model.Journey?>(null) }
    val journey = state.journey
    Surface(Modifier.fillMaxSize(), color = Canvas) {
        BoxWithConstraints {
            val wide = maxWidth >= 840.dp
            val bodyMinHeight = (maxHeight - 160.dp).coerceAtLeast(0.dp)
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(if (wide) 40.dp else 24.dp)
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        stringResource(R.string.home_brand),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = Forest,
                    )
                    Text(
                        if (journey == null) stringResource(R.string.home_start_badge)
                        else stringResource(R.string.home_private_badge),
                        Modifier.background(Mint, RoundedCornerShape(30.dp)).padding(14.dp),
                        color = Forest,
                    )
                }
                Spacer(Modifier.height(28.dp))
                if (wide)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = bodyMinHeight),
                        horizontalArrangement = Arrangement.spacedBy(32.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CharacterPanel(state, Modifier.weight(1f), true)
                        JourneyPanel(
                            state,
                            onLoadJourney,
                            {
                                startPreview = state.preparation
                                confirmStart = true
                            },
                            Modifier.weight(1f),
                        )
                    }
                else {
                    CharacterPanel(state, Modifier.fillMaxWidth())
                    JourneyPanel(
                        state,
                        onLoadJourney,
                        {
                            startPreview = state.preparation
                            confirmStart = true
                        },
                        Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
    if (confirmStart)
        AlertDialog(
            onDismissRequest = { confirmStart = false },
            title = { Text(stringResource(R.string.home_start_title)) },
            text = {
                Text(
                    startPreview?.let {
                        stringResource(
                            R.string.home_review_plan,
                            it.alias,
                            it.date,
                            it.nextVisit,
                            it.nextVisitLabel,
                            it.returnPlaceLabel,
                            it.returnDeadline,
                        )
                    } ?: stringResource(R.string.home_default_plan)
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmStart = false
                        onStartTrip(startPreview)
                    },
                    enabled = state.startEnabled && !state.isLoading,
                ) {
                    Text(stringResource(R.string.home_confirm_start))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmStart = false }) {
                    Text(stringResource(R.string.home_back))
                }
            },
        )
}

@Composable
private fun CharacterPanel(state: HandoffUiState, modifier: Modifier, wide: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            state.journey?.let { stringResource(R.string.home_greeting, it.alias) }
                ?: stringResource(R.string.home_welcome),
            fontSize = 28.sp,
            lineHeight = 38.sp,
            fontWeight = FontWeight.Bold,
            color = Ink,
        )
        AgentCharacter(
            state.journey?.avatarId ?: state.preparation?.avatarId ?: "a-01",
            Modifier.fillMaxWidth().height(if (wide) 440.dp else 300.dp),
        )
        Text(
            if (state.journey != null) stringResource(R.string.home_companion)
            else stringResource(R.string.home_prepare_help),
            color = Muted,
            fontSize = 17.sp,
        )
    }
}

@Composable
private fun JourneyPanel(
    state: HandoffUiState,
    onLoad: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier,
) {
    Surface(modifier, shape = RoundedCornerShape(28.dp), color = Color.White) {
        Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            val j = state.journey
            Text(
                if (j == null) stringResource(R.string.home_start_trip)
                else stringResource(R.string.home_today_trip),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = Ink,
            )
            if (j == null) {
                Text(
                    state.preparation?.let {
                        stringResource(
                            R.string.home_stored_preview,
                            it.alias,
                            it.date,
                            it.nextVisitLabel,
                        )
                    } ?: stringResource(R.string.home_web_help),
                    color = Muted,
                    fontSize = 18.sp,
                    lineHeight = 28.sp,
                )
                Button(
                    onClick = onLoad,
                    enabled = state.loadEnabled && !state.isLoading,
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                ) {
                    Text(
                        if (state.retryPending) stringResource(R.string.home_retry)
                        else stringResource(R.string.home_load),
                        fontSize = 18.sp,
                    )
                }
                OutlinedButton(
                    onClick = onStart,
                    enabled = state.startEnabled && !state.isLoading,
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                ) {
                    Text(
                        if (state.preparation != null) stringResource(R.string.home_start_stored)
                        else stringResource(R.string.home_start_default),
                        fontSize = 18.sp,
                    )
                }
            } else {
                Text(j.date, color = Forest, fontSize = 18.sp)
                Text(
                    stringResource(R.string.home_next_visit, j.nextVisit, j.nextVisitLabel),
                    color = Ink,
                    fontSize = 22.sp,
                    lineHeight = 32.sp,
                )
                HorizontalDivider(color = Mint)
                Text(
                    stringResource(
                        R.string.home_return_trip,
                        j.returnPlaceLabel,
                        j.returnEstimate,
                        j.returnDeadline,
                    ),
                    color = Ink,
                    fontSize = 20.sp,
                    lineHeight = 32.sp,
                )
                val cafeLabel = stringResource(R.string.home_cafe)
                val seaLabel = stringResource(R.string.home_sea)
                val interests =
                    j.interests
                        .map { if (it == "cafe") cafeLabel else seaLabel }
                        .joinToString(" · ")
                Text(
                    if (interests.isEmpty()) stringResource(R.string.home_no_interests)
                    else stringResource(R.string.home_interests, interests),
                    color = Forest,
                    fontSize = 17.sp,
                )
                val preferences =
                    listOfNotNull(
                            if (j.activityPreference != null) stringResource(R.string.home_activity)
                            else null,
                            if (j.pace != null) stringResource(R.string.home_pace) else null,
                            if (j.conversationStyle != null)
                                stringResource(R.string.home_conversation)
                            else null,
                            if (j.expressionPresetIds.isNotEmpty())
                                stringResource(R.string.home_expression)
                            else null,
                        )
                        .joinToString(" · ")
                if (preferences.isNotEmpty())
                    Text(preferences, color = Muted, fontSize = 16.sp, lineHeight = 24.sp)
                Text(
                    when (j.style) {
                        "calm" -> stringResource(R.string.home_calm)
                        "light_humor" -> stringResource(R.string.home_humor)
                        else -> stringResource(R.string.home_neutral)
                    },
                    color = Muted,
                )
                OutlinedButton(
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                ) {
                    Text(stringResource(R.string.home_recommendations_pending))
                }
            }
            Text(
                state.notice ?: stringResource(R.string.home_checking),
                color = Muted,
                fontSize = 15.sp,
                lineHeight = 23.sp,
            )
        }
    }
}
