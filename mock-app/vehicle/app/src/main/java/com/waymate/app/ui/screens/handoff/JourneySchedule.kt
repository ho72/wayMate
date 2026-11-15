package com.waymate.app.ui.screens.handoff

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.waymate.app.model.Journey
import com.waymate.app.ui.theme.*

/** Display saved plan times; never imply a live ETA or change navigation. */
@Composable
internal fun JourneySchedule(journey: Journey?) {
    if (journey == null) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            CalendarDate(journey.date)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(journey.planTitle ?: "내 여행 일정", style = MaterialTheme.typography.titleLarge)
                Surface(color = Mint.copy(alpha = .65f), shape = RoundedCornerShape(16.dp)) {
                    Text(if (journey.plannedDays.isNotEmpty()) journey.destination ?: "내 여행 계획" else "${journey.returnDeadline}까지 복귀", Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.titleMedium, color = Forest)
                }
            }
        }
        if (journey.plannedDays.isNotEmpty()) {
            journey.plannedDays.forEach { day ->
                Text("DAY ${day.number}" + (day.date?.let { " · $it" } ?: ""), color = Muted, style = MaterialTheme.typography.titleMedium)
                day.stops.forEach { stop -> ScheduleEvent(stop.time ?: "시간 미정", stop.description, stop.title) }
                HorizontalDivider(color = SkyLine)
            }
        } else {
            ScheduleEvent(journey.nextVisit, "다음 방문", journey.nextVisitLabel)
            HorizontalDivider(color = SkyLine)
            ScheduleEvent(journey.returnEstimate, "복귀 도착 예상", journey.returnPlaceLabel)
        }

    }
}

@Composable
private fun CalendarDate(value: String) {
    val date = Regex("(?:\\d{4}[-./])?(\\d{1,2})[-./](\\d{1,2})").find(value)
    val korean = Regex("(\\d{1,2})월\\s*(\\d{1,2})일").find(value)
    val match = date ?: korean
    Surface(color = Forest, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.width(108.dp).heightIn(min = 104.dp).padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text(match?.let { "${it.groupValues[1]}월" } ?: "내 여행", color = androidx.compose.ui.graphics.Color.White, fontSize = 22.sp)
            Text(match?.groupValues?.get(2) ?: "일정", color = androidx.compose.ui.graphics.Color.White,
                fontSize = 34.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
internal fun ScheduleEvent(time: String, label: String, place: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
        Text(time, Modifier.widthIn(min = 100.dp), color = Forest, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Box(Modifier.width(4.dp).height(68.dp).background(Mint, RoundedCornerShape(2.dp)))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = Muted)
            Text(place, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable
internal fun MeetingTimeCard(date: String = "2026-12-14", start: String = "14:15", end: String = "14:35", minutes: Long? = 20) {
    val label = runCatching { java.time.LocalDate.parse(date).let { "${it.monthValue}월 ${it.dayOfMonth}일" } }.getOrDefault("12월 14일")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
        CalendarDate(label)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("$start–$end", fontSize = 32.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold, color = Forest)
            Text(minutes?.let { "${it}분 동안 가볍게 만나요" } ?: "합의할 만남 시간을 확인해요", style = MaterialTheme.typography.bodyMedium)
        }
    }
}
