package com.waymate.app.platform.restrictions

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.os.Handler
import android.os.Looper

/** Unknown is blocked. Subscribe and re-read on every foreground entry. */
class VehicleRestrictions(private val context: Context, private val changed: (Boolean?) -> Unit) {
    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null
    private var active = false
    private var generation = 0

    fun start() {
        val token = ++generation
        active = true
        changed(null)
        try {
            car =
                Car.createCar(
                    context,
                    Handler(Looper.getMainLooper()),
                    Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT,
                ) { connected, ready ->
                    if (!active || token != generation) return@createCar
                    if (!ready) {
                        changed(null)
                        return@createCar
                    }
                    try {
                        manager =
                            connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE)
                                as CarUxRestrictionsManager
                        manager?.registerListener { restrictions ->
                            if (active && token == generation) publish(restrictions)
                        }
                        manager?.currentCarUxRestrictions?.let(::publish) ?: changed(null)
                    } catch (_: Exception) {
                        changed(null)
                    }
                }
        } catch (_: Exception) {
            changed(null)
        }
    }

    private fun publish(r: CarUxRestrictions) {
        changed(
            r.isRequiresDistractionOptimization ||
                r.activeRestrictions != CarUxRestrictions.UX_RESTRICTIONS_BASELINE
        )
    }

    fun stop() {
        generation++
        active = false
        changed(null)
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
