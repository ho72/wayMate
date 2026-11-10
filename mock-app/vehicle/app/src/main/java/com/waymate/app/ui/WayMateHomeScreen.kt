package com.waymate.app.ui

import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.R

@Composable
fun WayMateHomeScreen() {
    Surface(modifier = Modifier.fillMaxSize(), color = Canvas) {
        BoxWithConstraints {
            val wide = maxWidth >= 840.dp
            val margin = if (wide) 56.dp else 28.dp

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = margin, vertical = 28.dp),
            ) {
                BrandHeader(wide)
                Spacer(Modifier.height(if (wide) 52.dp else 32.dp))

                if (wide) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(48.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Welcome(Modifier.weight(1f), wide = true)
                        JourneyCard(Modifier.weight(1f))
                    }
                } else {
                    Welcome(Modifier.fillMaxWidth(), wide = false)
                    Spacer(Modifier.height(32.dp))
                    JourneyCard(Modifier.fillMaxWidth())
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
                modifier = Modifier
                    .size(48.dp)
                    .background(Forest, RoundedCornerShape(16.dp)),
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
            modifier = Modifier
                .background(Mint, RoundedCornerShape(50))
                .padding(horizontal = 16.dp, vertical = 10.dp),
            color = Forest,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun Welcome(modifier: Modifier, wide: Boolean) {
    Column(modifier = modifier, horizontalAlignment = Alignment.Start) {
        Text(
            stringResource(R.string.welcome_eyebrow),
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
        TravelFriend(Modifier.size(if (wide) 176.dp else 124.dp))
    }
}

@Composable
private fun JourneyCard(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(32.dp),
        color = Color.White,
        tonalElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(32.dp)) {
            Text(
                stringResource(R.string.journey_title),
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
            JourneyStep("01", stringResource(R.string.journey_step_one))
            Spacer(Modifier.height(20.dp))
            JourneyStep("02", stringResource(R.string.journey_step_two))
            Spacer(Modifier.height(32.dp))

            // Enable only after real handoff and vehicle restriction checks are implemented.
            Button(
                onClick = {},
                enabled = false,
                modifier = Modifier.fillMaxWidth().height(64.dp),
                shape = RoundedCornerShape(20.dp),
                colors = ButtonDefaults.buttonColors(
                    disabledContainerColor = Mint,
                    disabledContentColor = Forest,
                ),
            ) {
                Text(
                    stringResource(R.string.load_journey),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(16.dp))
            Text(
                stringResource(R.string.preview_notice),
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

@Composable
private fun TravelFriend(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.clip(CircleShape).background(Mint)) {
        val w = size.width
        val h = size.height
        val face = Color(0xFFFCF7E8)
        drawOval(face, topLeft = Offset(w * .19f, h * .27f), size = Size(w * .62f, h * .58f))
        drawOval(Forest, topLeft = Offset(w * .46f, h * .12f), size = Size(w * .22f, h * .14f))
        drawLine(Forest, Offset(w * .5f, h * .31f), Offset(w * .54f, h * .2f), w * .025f, StrokeCap.Round)
        drawCircle(Ink, w * .022f, Offset(w * .39f, h * .52f))
        drawCircle(Ink, w * .022f, Offset(w * .61f, h * .52f))
        drawCircle(Color(0xFFEABFA5), w * .044f, Offset(w * .3f, h * .61f))
        drawCircle(Color(0xFFEABFA5), w * .044f, Offset(w * .7f, h * .61f))
        val smile = Path().apply {
            moveTo(w * .43f, h * .62f)
            quadraticTo(w * .5f, h * .7f, w * .57f, h * .62f)
        }
        drawPath(smile, Ink, style = Stroke(width = w * .018f, cap = StrokeCap.Round))
    }
}

@Preview(name = "Pleos wide", widthDp = 1280, heightDp = 800, showBackground = true)
@Preview(name = "Pleos compact", widthDp = 480, heightDp = 800, showBackground = true)
@Composable
private fun HomePreview() {
    WayMateTheme {
        WayMateHomeScreen()
    }
}
