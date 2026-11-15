package com.waymate.app.platform.speech

import android.app.Activity
import android.app.AlertDialog
import android.widget.Toast

/** Consent lasts for this foreground session and exact trip/pairing scope. */
class VoiceConsentGate(private val activity: Activity, private val isParked: () -> Boolean) {
    private var accepted: String? = null
    private var dialog: AlertDialog? = null
    fun accepted(scope: String) = accepted == scope
    fun permit(scope: String): Boolean {
        if (accepted == scope) return true
        if (!isParked() || dialog != null) return false
        dialog = AlertDialog.Builder(activity)
            .setTitle("친구의 목소리를 켤까요?")
            .setMessage("듣기를 누른 안내 문장을 ElevenLabs에 보내 음성으로 만들어요. 다른 대화와 계정 정보는 보내지 않아요. 화면을 나가면 동의를 해제해요.")
            .setPositiveButton("동의하고 음성 켜기") { _, _ ->
                if (isParked()) {
                    accepted = scope
                    Toast.makeText(activity, "음성을 켰어요. 듣기를 다시 눌러 주세요.", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("나중에", null)
            .create().also { it.setOnDismissListener { dialog = null }; it.show() }
        return false
    }
    fun dismiss() { dialog?.dismiss(); dialog = null }
    fun clear() { accepted = null; dismiss() }
}
