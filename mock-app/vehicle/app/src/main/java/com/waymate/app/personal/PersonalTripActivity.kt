package com.waymate.app.personal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.ui.theme.WayMateTheme

/** Account trip entry. Deliberately never constructs a navigation driver/demo repository. */
class PersonalTripActivity : ComponentActivity() {
    private var state by mutableStateOf(PersonalVehicleState())
    private var repository: PersonalTripRepository? = null
    private lateinit var restrictions: VehicleRestrictions
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try { repository = PersonalTripRepository(this, { state = it }) }
        catch (_: Exception) { state = PersonalVehicleState(phase = "error", notice = "차량 저장 정보를 확인해 주세요.") }
        restrictions = VehicleRestrictions(this, observed = { repository?.restriction(it) }, changed = {})
        setContent { WayMateTheme {
            PersonalTripScreen(state, { repository?.enroll() }, { repository?.confirm(it) },
                { repository?.acceptTrip() }, { repository?.unpair() }, { repository?.refresh() }, { finish() })
        } }
    }
    override fun onResume() { super.onResume(); repository?.resume(); restrictions.start() }
    override fun onPause() { repository?.pause(); restrictions.stop(); super.onPause() }
    override fun onDestroy() { repository?.close(); super.onDestroy() }
}
