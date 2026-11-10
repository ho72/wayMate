package com.waymate.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.waymate.app.app.WayMateApp
import com.waymate.app.ui.theme.WayMateTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WayMateTheme {
                WayMateApp()
            }
        }
    }
}
