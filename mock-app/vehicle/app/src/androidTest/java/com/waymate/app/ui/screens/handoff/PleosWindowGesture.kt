package com.waymate.app.ui.screens.handoff

import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.platform.app.InstrumentationRegistry

/** Pleos' documented horizontal three-finger gesture moves a portrait window to the other slot. */
internal fun movePortraitWindowRight() {
    val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
    val down = SystemClock.uptimeMillis()
    val properties =
        Array(3) { index ->
            MotionEvent.PointerProperties().apply {
                id = index
                toolType = MotionEvent.TOOL_TYPE_FINGER
            }
        }
    fun send(action: Int, count: Int, x: Float) {
        val coordinates =
            Array(count) { index ->
                MotionEvent.PointerCoords().apply {
                    this.x = x
                    y = 300f + index * 100f
                    pressure = 1f
                    size = 1f
                }
            }
        val event =
            MotionEvent.obtain(
                down,
                SystemClock.uptimeMillis(),
                action,
                count,
                properties,
                coordinates,
                0,
                0,
                1f,
                1f,
                0,
                0,
                InputDevice.SOURCE_TOUCHSCREEN,
                0,
            )
        try {
            check(automation.injectInputEvent(event, true))
        } finally {
            event.recycle()
        }
    }
    send(MotionEvent.ACTION_DOWN, 1, 1250f)
    send(
        MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),
        2,
        1250f,
    )
    send(
        MotionEvent.ACTION_POINTER_DOWN or (2 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT),
        3,
        1250f,
    )
    for (step in 1..10) {
        SystemClock.sleep(30)
        send(MotionEvent.ACTION_MOVE, 3, 1250f + 85f * step)
    }
    send(MotionEvent.ACTION_POINTER_UP or (2 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 3, 2100f)
    send(MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, 2100f)
    send(MotionEvent.ACTION_UP, 1, 2100f)
}
