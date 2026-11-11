package com.waymate.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.waymate.app.app.WayMateApp
import com.waymate.app.data.repository.HandoffRepository
import com.waymate.app.platform.navigation.createNavigationDriver
import com.waymate.app.platform.restrictions.VehicleRestrictions
import com.waymate.app.ui.screens.handoff.HandoffUiState
import com.waymate.app.ui.theme.WayMateTheme

class MainActivity : ComponentActivity() {
    private var ui by mutableStateOf(HandoffUiState())
    private lateinit var repository: HandoffRepository
    private lateinit var restrictions: VehicleRestrictions

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository =
            HandoffRepository(applicationContext, createNavigationDriver(applicationContext)) {
                ui =
                    HandoffUiState(
                        it.loadEnabled,
                        it.isLoading,
                        it.notice,
                        it.journey,
                        it.retryPending,
                        it.startEnabled,
                        it.preparation,
                        it.navigation,
                    )
            }
        restrictions = VehicleRestrictions(this, repository::restriction)
        setContent {
            WayMateTheme {
                WayMateApp(
                    ui,
                    repository::load,
                    repository::startTrip,
                    repository::openNavigation,
                    repository::closeNavigation,
                    repository::approveNavigation,
                    repository::cancelNavigation,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        repository.resume()
        restrictions.start()
    }

    override fun onPause() {
        repository.pause()
        restrictions.stop()
        super.onPause()
    }

    override fun onDestroy() {
        repository.close()
        super.onDestroy()
    }
}
