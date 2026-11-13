package com.waymate.app.ui.screens.handoff

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.waymate.app.model.Journey

@Composable
internal fun JourneySchedule(journey: Journey?) {
    journey?.let {
        Text(
            "내 일정 · 다음 방문 ${it.nextVisit} ${it.nextVisitLabel}\n복귀 ${it.returnPlaceLabel} · 도착 예상 ${it.returnEstimate} · 마감 ${it.returnDeadline}",
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
