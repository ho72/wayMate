package com.waymate.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import com.waymate.app.ui.theme.Forest
import com.waymate.app.ui.theme.Ink
import com.waymate.app.ui.theme.Mint

@Composable
fun TravelFriend(modifier: Modifier = Modifier) {
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
