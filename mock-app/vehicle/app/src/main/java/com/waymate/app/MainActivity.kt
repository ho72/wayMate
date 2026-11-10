package com.waymate.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.waymate.app.ui.WayMateHomeScreen
import com.waymate.app.ui.WayMateTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WayMateTheme {
                WayMateHomeScreen()
            }
        }
    }
}
