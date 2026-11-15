package com.waymate.app.model

import com.waymate.app.platform.restrictions.InteractionMode

data class DrivingUiState(
    val mode: InteractionMode = InteractionMode.PARKED,
    val canPlayPreparedAudio: Boolean = false,
    val status: String = "차량 상태 확인 중",
    val audioValidUntil: Long = 0,
) {
    companion object {
        const val NARRATION = "천천히, 안전하게 가요. 일정이랑 다음 이야기는 정차한 뒤 함께 확인해요."
        fun allowsPreparedNarration(text: String): Boolean =
            text == NARRATION || DrivingRecommendations.allowsNarration(text)
    }
}
