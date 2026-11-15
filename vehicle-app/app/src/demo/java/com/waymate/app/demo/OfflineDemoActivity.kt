package com.waymate.app.demo

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.waymate.app.app.WayMateApp
import com.waymate.app.model.DrivingUiState
import com.waymate.app.platform.restrictions.*
import com.waymate.app.platform.speech.*
import com.waymate.app.ui.components.*
import com.waymate.app.ui.theme.WayMateTheme

class OfflineDemoActivity : ComponentActivity() {
    internal lateinit var session: OfflineDemoSession
    internal var drivingNarrations = 0
    internal var refresh by mutableIntStateOf(0)
    private var mode by mutableStateOf(InteractionMode.BLOCKED)
    private var foreground by mutableStateOf(false)
    internal var speechState by mutableStateOf(SpeechState())
    private lateinit var speech: AgentSpeech
    private lateinit var restrictions: VehicleRestrictions
    internal var showIndex by mutableStateOf(false)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = OfflineDemoSession(savedInstanceState?.getBundle("offline"))
        showIndex = savedInstanceState?.getBoolean("index") ?: false
        speech = AgentSpeech(applicationContext) { speechState = it }
        WindowPlaybackLifecycle(this, speech::allowPlayback)
        restrictions = VehicleRestrictions(this, observed = {
            val next = DrivingModePolicy.select(it)
            if (next != mode) speech.interrupt()
            mode = next
        }) {}
        setContent { WayMateTheme {
            @Suppress("UNUSED_VARIABLE") val tick = refresh
            val base = session.state()
            val driving = remember(mode, foreground) { DrivingUiState(mode, foreground && mode == InteractionMode.DRIVING_LIMITED,
                "오프라인 여행 시연", if (foreground) SystemClock.elapsedRealtime() + 24 * 60 * 60 * 1000 else 0) }
            val ui = base.copy(driving = driving)
            fun update(block: () -> Unit) { block(); refresh++ }
            BackHandler(enabled = mode != InteractionMode.PARKED) {}
            BackHandler(enabled = mode == InteractionMode.PARKED && !showIndex) { showIndex = true; speech.interrupt() }
            if (showIndex && mode == InteractionMode.PARKED) {
                BackHandler { showIndex = false }
                VehicleBackground(pageTag = "오프라인 시연") {
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("시연할 화면을 골라 주세요", style = MaterialTheme.typography.headlineMedium)
                        Text("백엔드 없이 준비된 데이터로 진행해요. 차량 상태는 실제 에뮬레이터 신호를 따라요.")
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            VehicleOutlineButton(onClick = { showIndex = false }, modifier = Modifier.weight(1f)) { Text("보던 화면으로") }
                            VehicleOutlineButton(onClick = { nextScene(); showIndex = false }, modifier = Modifier.weight(1f)) { Text("다음 시연 장면") }
                        }
                        OfflineDemoSession.scenes.forEach { (id, title) ->
                            VehicleOutlineButton(onClick = { selectScene(id); showIndex = false }, modifier = Modifier.testTag("demo-scene-$id")) { Text(title) }
                        }
                    }
                }
            } else Box(Modifier.fillMaxSize()) {
              key(session.revision) {
                WayMateApp(ui,
                    onLoadJourney = { update { session.load() } }, onStartTrip = { update { session.load() } },
                    onOpenNavigation = { update { session.open("navigation") } }, onCloseNavigation = { update { session.home() } },
                    onApproveNavigation = { _, _ -> update { session.act("MOCK_NAV_ADD", "route") } }, onCancelNavigation = { update { session.home() } },
                    onOpenMeeting = { update { session.open("meeting-proposal") } }, onCloseMeeting = { update { session.home() } },
                    onSocialAction = { type, binding ->
                        if (mode == InteractionMode.PARKED || type in listOf("CALL_END", "CALL_CANCEL")) update { session.act(type, binding) }
                    }, onRetry = { refresh++ }, onOpenContent = { update { session.open("content-friend") } },
                    onCloseContent = { update { session.home() } }, onMessageRead = {},
                    speech = speechState, onSpeak = { if (mode == InteractionMode.PARKED) speech.speak(it) }, onStopSpeech = speech::interrupt,
                    onOpenEnding = { update { session.open("ending-pending") } }, onCloseEnding = { update { session.home() } }, onProfileCue = {},
                    onOpenPagePreview = { showIndex = true; speech.interrupt() },
                    onNarrate = { if (mode == InteractionMode.PARKED) speech.speak(it.text) },
                    onSpeakDriving = { if (foreground && mode == InteractionMode.DRIVING_LIMITED) { drivingNarrations++; speech.speak(it) } },
                    contentInitialPage = if (session.contentPage == "waiting") "messages" else session.contentPage,
                    initialExtra = session.extra(),
                )
              }
              if (mode == InteractionMode.PARKED) TextButton(
                  onClick = { speech.interrupt(); showIndex = true },
                  modifier = Modifier.align(Alignment.TopStart).padding(start = 244.dp, top = 16.dp).width(112.dp).heightIn(min = 80.dp),
              ) { Text("시연", style = MaterialTheme.typography.titleMedium) }
            }
        } }
    }
    private fun nextScene() {
        val sequence = listOf("home", "content-friend", "content-intro", "content-list", "content-answer", "content-draft", "content-messages", "call-waiting", "call-active", "meeting-proposal", "meeting-agreed", "extra-WAYPOINT_REVIEW", "extra-NAV_PENDING", "extra-WAYPOINT_DONE", "ending-travel", "ending-meeting", "ending-pending", "ending-together", "ending-my_agent")
        selectScene(sequence[(sequence.indexOf(session.scene) + 1).coerceAtLeast(0) % sequence.size])
    }
    /** Local scene selection only, used by the parked menu and instrumentation. */
    internal fun selectScene(id: String) {
        if (mode != InteractionMode.PARKED) return
        speech.interrupt(); session.select(id); refresh++
    }
    override fun onSaveInstanceState(outState: Bundle) { outState.putBundle("offline", session.save()); outState.putBoolean("index", showIndex); super.onSaveInstanceState(outState) }
    override fun onResume() { super.onResume(); foreground = true; restrictions.start() }
    override fun onPause() { foreground = false; speech.interrupt(); restrictions.stop(); super.onPause() }
    override fun onDestroy() { restrictions.stop(); speech.close(); super.onDestroy() }
}
