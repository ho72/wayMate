package com.waymate.app.ui.testing

import android.content.Context
import android.content.res.Configuration
import androidx.activity.ComponentActivity

/** Debug mock hosts only; no repository, vehicle connection, SDK driver, or audio engine. */
open class WindowReviewActivity : ComponentActivity()

class LargeFontReviewActivity : WindowReviewActivity() {
    override fun attachBaseContext(base: Context) {
        val configuration = Configuration(base.resources.configuration).apply { fontScale = 1.3f }
        super.attachBaseContext(base.createConfigurationContext(configuration))
    }
}
