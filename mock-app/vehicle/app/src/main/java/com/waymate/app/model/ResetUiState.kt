package com.waymate.app.model

data class ResetUiState(
    val visible: Boolean = false,
    val status: String = "초기화 상태를 확인하고 있어요.",
    val destination: String = "미확인",
    val canRemove: Boolean = false,
    val canCancel: Boolean = false,
    val canRetry: Boolean = false,
    val reviewed: String? = null,
)
