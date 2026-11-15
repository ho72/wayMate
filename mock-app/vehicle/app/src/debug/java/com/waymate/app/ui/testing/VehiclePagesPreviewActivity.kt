package com.waymate.app.ui.testing

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.waymate.app.model.DrivingUiState
import com.waymate.app.model.Journey
import com.waymate.app.platform.restrictions.*
import com.waymate.app.platform.speech.SpeechState
import com.waymate.app.ui.components.*
import com.waymate.app.ui.screens.extras.*
import com.waymate.app.ui.screens.handoff.DrivingScreen
import com.waymate.app.ui.theme.WayMateTheme

/** Debug-only offline gallery. Recommendation scenes support local speech; no account repository or SDK. */
class VehiclePagesPreviewActivity : ComponentActivity() {
    private var mode by mutableStateOf(InteractionMode.BLOCKED)
    private var previewScene by mutableStateOf<String?>(null)
    internal var handledRecommendationNarration by mutableStateOf<String?>(null)
    private lateinit var restrictions: VehicleRestrictions
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handledRecommendationNarration = savedInstanceState?.getString("handledRecommendationNarration")
        previewScene = intent.getStringExtra("headerScene")
        restrictions = VehicleRestrictions(this, observed = { mode = DrivingModePolicy.select(it) }) {}
        setContent { WayMateTheme {
            if (mode == InteractionMode.PARKED) {
                val headerScene = previewScene
                if (headerScene?.startsWith("batch-") == true || headerScene in listOf("home", "friend", "request", "driving", "driving-places", "driving-lunch", "buttons", "button-dialog", "places", "lunch-places", "place-detail", "lunch-detail")) CurrentHeaderPreview(headerScene!!)
                else VehiclePagesGallery { finish() }
            }
            else DrivingScreen(DrivingUiState(mode = mode), null, SpeechState(), {}, {})
        } }
        scheduleCapture()
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        previewScene = intent.getStringExtra("headerScene")
        scheduleCapture()
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("handledRecommendationNarration", handledRecommendationNarration)
        super.onSaveInstanceState(outState)
    }
    private fun scheduleCapture() {
        previewScene?.takeIf { it.startsWith("batch-") || it in listOf("home", "friend", "request", "driving", "driving-places", "driving-lunch", "buttons", "places", "lunch-places", "place-detail", "lunch-detail") }?.let { scene ->
            window.decorView.postDelayed({ captureHeaderPreview(this, scene) }, 1500)
        }
    }
    override fun onResume() { super.onResume(); restrictions.start() }
    override fun onPause() { mode = InteractionMode.BLOCKED; restrictions.stop(); super.onPause() }
    override fun onDestroy() { restrictions.stop(); super.onDestroy() }
}

private val galleryJourney = Journey("page-preview", 1, "여행자", "a-01", null, emptyList(),
    "시연 일정", "15:20", "기존 개인 방문지", "내 숙소", "15:45", "16:00")
private val titles = linkedMapOf(
    VehiclePage.REQUEST to "장소 물어보기",
    VehiclePage.REST_LIST to "휴식 장소 목록",
    VehiclePage.REST_DETAIL to "휴식 장소 상세",
    VehiclePage.WAYPOINT_REVIEW to "기존 목적지 유지·경유 승인",
    VehiclePage.DESTINATION_REVIEW to "새 목적지 설정 승인",
    VehiclePage.ITINERARY to "내 일정·안내 확인",
    VehiclePage.MC to "MC 참여·동의·통화",
    VehiclePage.REVIEW to "여행 후 기록·장식",
    VehiclePage.LUNCH_LIST to "식사 장소 목록",
    VehiclePage.LUNCH_DETAIL to "식사 장소 상세",
    VehiclePage.NAV_PENDING to "개인 안내 요청 중",
    VehiclePage.WAYPOINT_DONE to "개인 경유지 반영 확인",
    VehiclePage.DESTINATION_DONE to "새 목적지 반영 확인",
    VehiclePage.NAV_FAILED to "개인 안내 실패",
    VehiclePage.NAV_UNKNOWN to "개인 안내 결과 미확인",
    VehiclePage.VOICE to "주행 음성 대화·정차 미리보기",
)

@Composable
private fun VehiclePagesGallery(onExit: () -> Unit) {
    var index by rememberSaveable { mutableStateOf(true) }
    var flow by rememberSaveable(stateSaver = listSaver<VehiclePageFlow, String>(
        save = { it.save() }, restore = { VehiclePageFlow.restore(it) },
    )) { mutableStateOf(VehiclePageFlow(page = VehiclePage.REQUEST)) }
    BackHandler { if (index) onExit() else index = true }
    if (index) VehicleBackground(pageTag = "화면 미리보기") {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("추가 차량 화면 16개", style = MaterialTheme.typography.headlineMedium)
            Text("화면 설계서의 페이지를 바로 열어볼 수 있어요. 서버 연결 없이 가상 데이터로 전환해요.")
            VehicleButton(onClick = { flow = previewFor(VehiclePage.REQUEST); index = false }) { Text("장소 질문부터 흐름 시작") }
            titles.forEach { (page, title) ->
                VehicleOutlineButton(onClick = { flow = previewFor(page); index = false }) { Text("WF-${page.wf} · $title") }
            }
            VehicleOutlineButton(onClick = onExit) { Text("차량 앱으로 돌아가기") }
        }
    } else Column {
        if (flow.page == VehiclePage.NAV_PENDING) TextButton(onClick = {
            flow = flow.complete(flow.request?.id ?: -1, flow.request?.outcome ?: PreviewOutcome.SUCCESS)
        }) { Text("다음 모의 결과 화면 보기") }
        if (flow.page == VehiclePage.MC && flow.mcPhase == "waiting") Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            VehicleOutlineButton(onClick = { flow = flow.copy(mcPhase = "active") }, modifier = Modifier.weight(1f)) { Text("Debug · 상대 MC 동의") }
            VehicleOutlineButton(onClick = { flow = flow.copy(mcPhase = "declined") }, modifier = Modifier.weight(1f)) { Text("Debug · 상대 MC 거절") }
        }
        if (flow.page == VehiclePage.NAV_UNKNOWN) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            VehicleOutlineButton(onClick = { flow = flow.complete(flow.request?.id ?: -1, PreviewOutcome.SUCCESS) }, modifier = Modifier.weight(1f)) { Text("Debug · 같은 요청 성공") }
            VehicleOutlineButton(onClick = { flow = flow.complete(flow.request?.id ?: -1, PreviewOutcome.FAILED) }, modifier = Modifier.weight(1f)) { Text("Debug · 같은 요청 실패") }
        }
        Box(Modifier.weight(1f)) {
            VehicleExtraScreen(flow, galleryJourney, true, {
                if (it.page == VehiclePage.HOME) index = true else flow = it
            }, { index = true },
                { index = true }, { index = true }, { index = true }, onOpenIndex = { index = true }, autoAdvance = false)
        }
    }
}

internal fun previewFor(page: VehiclePage): VehiclePageFlow {
    val base = VehiclePageFlow(page = VehiclePage.REQUEST)
    val rest = base.chooseQuery(false).select("rest-1")
    val pending = rest.reviewRoute().approve()
    return when (page) {
        VehiclePage.REST_LIST -> base.chooseQuery(false)
        VehiclePage.REST_DETAIL -> rest
        VehiclePage.WAYPOINT_REVIEW -> rest.reviewRoute()
        VehiclePage.DESTINATION_REVIEW -> rest.copy(destination = null).reviewRoute()
        VehiclePage.ITINERARY -> base.reviewSchedule()
        VehiclePage.LUNCH_LIST -> base.chooseQuery(true)
        VehiclePage.LUNCH_DETAIL -> base.chooseQuery(true).select("lunch-1")
        VehiclePage.NAV_PENDING -> pending
        VehiclePage.WAYPOINT_DONE -> pending.complete(1, PreviewOutcome.SUCCESS)
        VehiclePage.DESTINATION_DONE -> rest.copy(destination = null).reviewRoute().approve().complete(1, PreviewOutcome.SUCCESS)
        VehiclePage.NAV_FAILED -> pending.complete(1, PreviewOutcome.FAILED)
        VehiclePage.NAV_UNKNOWN -> pending.complete(1, PreviewOutcome.UNKNOWN)
        else -> base.copy(page = page)
    }
}
