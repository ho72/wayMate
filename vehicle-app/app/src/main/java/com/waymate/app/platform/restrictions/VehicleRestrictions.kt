package com.waymate.app.platform.restrictions

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.os.Handler
import android.os.Looper

/** Unknown is blocked. Subscribe and re-read on every foreground entry. */
class VehicleRestrictions(
    private val context: Context,
    private val observed: (UxObservation?) -> Unit = {},
    private val changed: (Boolean?) -> Unit,
) {
    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null
    private var active = false
    private var generation = 0

    fun start() {
        val token = ++generation
        active = true
        unknown()
        try {
            car =
                Car.createCar(
                    context,
                    Handler(Looper.getMainLooper()),
                    Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT,
                ) { connected, ready ->
                    if (!active || token != generation) return@createCar
                    if (!ready) {
                        unknown()
                        return@createCar
                    }
                    try {
                        manager =
                            connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE)
                                as CarUxRestrictionsManager
                        manager?.registerListener { restrictions ->
                            if (active && token == generation) publish(restrictions)
                        }
                        manager?.currentCarUxRestrictions?.let(::publish) ?: unknown()
                    } catch (_: Exception) {
                        unknown()
                    }
                }
        } catch (_: Exception) {
            unknown()
        }
    }

    private fun publish(r: CarUxRestrictions) {
        val value = UxObservation(r.isRequiresDistractionOptimization, r.activeRestrictions)
        observed(value)
        changed(value.restricted)
    }

    private fun unknown() { observed(null); changed(null) }

    fun stop() {
        generation++
        active = false
        unknown()
        try {
            manager?.unregisterListener()
        } catch (_: Exception) {
            /* Disconnected: remain blocked. */
        }
        manager = null
        try {
            car?.disconnect()
        } catch (_: Exception) {
            /* Remain blocked after disconnect failures. */
        }
        car = null
    }
}
