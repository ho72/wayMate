package com.waymate.app.ui.testing

import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.Window
import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import com.waymate.app.model.*
import com.waymate.app.platform.restrictions.InteractionMode
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.components.*
import com.waymate.app.ui.screens.handoff.*
import java.io.File

/** Current production components rendered with offline fixtures; no layout or vehicle state changes. */
@Composable
internal fun CurrentHeaderPreview(scene: String) {
    if (scene.startsWith("batch-common-")) {
        val suffix = scene.removePrefix("batch-common-")
        val target = suffix.substringBeforeLast('-')
        val phase = when (suffix.substringAfterLast('-')) {
            "speaking" -> AgentVoicePhase.SPEAKING
            "listening" -> AgentVoicePhase.LISTENING
            "processing" -> AgentVoicePhase.PROCESSING
            "paused" -> AgentVoicePhase.PAUSED
            "unavailable" -> AgentVoicePhase.UNAVAILABLE
            "preparing" -> AgentVoicePhase.PREPARING
            "stopped" -> AgentVoicePhase.STOPPED
            else -> AgentVoicePhase.IDLE
        }
        CompositionLocalProvider(LocalAgentVoicePreview provides AgentVoicePresentation(phase, simulated = true)) {
            CurrentHeaderPreview(if (target in listOf("home", "friend", "request", "places", "place-detail", "driving", "driving-places", "driving-lunch")) target else "batch-$target")
        }
        return
    }
    val journey = Journey("header-preview", 1, "여행자", "a-01", null, emptyList(),
        "2026-12-14", "15:20", "기존 개인 방문지", "내 숙소", "15:45", "16:00")
    when (scene) {
        "batch-mocha-home" -> HandoffScreen(HandoffUiState(journey = journey.copy(avatarId = "a-03"), content = ContentUiState(blocked = false, canInteract = true)), {}, {}, {}, {}, { _, _ -> }, {}, {})
        "home" -> HandoffScreen(HandoffUiState(journey = journey), {}, {}, {}, {}, { _, _ -> }, {}, {})
        "friend" -> ContentScreen(
            state = ContentUiState(visible = true, blocked = false, scope = "friend-preview", canInteract = true),
            journey = journey,
            speech = SpeechState(),
            onSpeak = {}, onStop = {}, onAction = { _, _ -> }, onRead = {}, onProfileCue = {},
            onBack = {}, onMeeting = {}, onRetry = {},
            onOpenPlaces = {}, onOpenVoice = {}, onOpenMc = {}, onOpenItinerary = {},
        )
        "request" -> VehicleExtraScreen(VehiclePageFlow(page = VehiclePage.REQUEST), journey, true, {}, {}, {}, {}, {})
        "driving" -> DrivingScreen(DrivingUiState(mode = InteractionMode.DRIVING_LIMITED,
            status = "다음 일정 · 15:20 기존 개인 방문지"), journey, SpeechState(), {}, {})
        "driving-places", "driving-lunch" -> {
            if (LocalAgentVoicePreview.current != null) DrivingScreen(
                DrivingUiState(mode = InteractionMode.DRIVING_LIMITED), journey, SpeechState(), {}, {},
                recommendation = DrivingRecommendations.forQuery(if (scene == "driving-lunch") "lunch" else "nearby30"))
            else DrivingRecommendationPreview(if (scene == "driving-lunch") "lunch" else "nearby30", journey)
        }
        "buttons" -> CurrentButtonsPreview()
        "button-dialog" -> CurrentButtonDialogPreview()
        "places" -> CurrentPlaceListPreview(false, journey)
        "lunch-places" -> CurrentPlaceListPreview(true, journey)
        "place-detail" -> CurrentPlaceListPreview(false, journey, detail = true)
        "lunch-detail" -> CurrentPlaceListPreview(true, journey, detail = true)
        else -> if (scene.startsWith("batch-")) RemainingPagesPreview(scene, journey)
    }
}

@Composable
private fun CurrentPlaceListPreview(lunch: Boolean, journey: Journey, detail: Boolean = false) {
    var flow by rememberSaveable(lunch, detail, stateSaver = listSaver<VehiclePageFlow, String>(
        save = { it.save() }, restore = { VehiclePageFlow.restore(it) },
    )) { mutableStateOf(VehiclePageFlow().chooseQuery(lunch).let {
        if (detail) it.select(if (lunch) "lunch-1" else "rest-1") else it
    }) }
    VehicleExtraScreen(flow, journey, true, { flow = it },
        { flow = VehiclePageFlow(page = VehiclePage.REQUEST) }, {}, {}, {})
}

internal fun captureHeaderPreview(activity: ComponentActivity, scene: String) {
    capturePreviewWindow(activity, activity.window, scene)
}

internal fun capturePreviewWindow(activity: ComponentActivity, window: Window, scene: String) {
    val view = window.decorView
    if (view.width <= 0 || view.height <= 0 || activity.isFinishing) return
    val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
    PixelCopy.request(window, bitmap, { result ->
        if (result == PixelCopy.SUCCESS) File(activity.filesDir, "header-preview-$scene.png").outputStream().use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
    }, Handler(Looper.getMainLooper()))
}
