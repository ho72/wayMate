package com.waymate.app.model

/** Reviewed route is an immutable snapshot captured when opening the approval dialog. */
data class NavigationUiState(
    val visible: Boolean = false,
    val status: String = "내비 연결을 확인하고 있어요.",
    val destination: String = "미확인",
    val canAdd: Boolean = false,
    val canRemove: Boolean = false,
    val canCancel: Boolean = false,
    val reviewed: String? = null,
    val busy: Boolean = false,
)
