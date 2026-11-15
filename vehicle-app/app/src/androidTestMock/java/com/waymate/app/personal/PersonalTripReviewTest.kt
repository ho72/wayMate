package com.waymate.app.personal

import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.waymate.app.ui.testing.WindowReviewActivity
import com.waymate.app.ui.theme.WayMateTheme
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class PersonalTripReviewTest {
    @get:Rule val ui = createAndroidComposeRule<WindowReviewActivity>()
    private val device = "00000000-0000-4000-8000-000000000001"
    private fun fixture(): JSONObject = InstrumentationRegistry.getInstrumentation().context.assets
        .open("personal-received.json").use { JSONObject(String(it.readBytes(), Charsets.UTF_8)) }
    private var state by mutableStateOf(PersonalVehicleState())
    private var connects = 0
    private var receipts = 0
    private var unpairs = 0
    private fun host() = ui.setContent { WayMateTheme { PersonalTripScreen(state,
        {}, { if (it) connects++ }, { receipts++ }, { unpairs++ }, {}, {}) } }
    private fun received(): PersonalVehicleState = decodePersonalState(fixture(), device).copy(localParked = true)
    @Test fun receiptRequiresReviewAndExplicitConfirmation() {
        val received = received()
        state = received.copy(delivery = received.delivery!!.copy(acknowledgedAt = null)); host()
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertExists()
        ui.onNodeWithText("이 여행 받기").performScrollTo().performClick()
        ui.onNodeWithText("이 여행을 받을까요?").assertIsDisplayed()
        ui.runOnIdle { assertEquals(0, receipts) }
        ui.onNodeWithText("돌아가기").performClick()
        ui.runOnIdle { assertEquals(0, receipts) }
        ui.onNodeWithText("이 여행 받기").performScrollTo().performClick()
        ui.onNodeWithText("확인").performClick()
        ui.runOnIdle { assertEquals(1, receipts) }
    }
    @Test fun drivingClosesReviewAndReturningDoesNotAutoAcceptOrExposeOldIdentity() {
        val received = received()
        state = received.copy(delivery = received.delivery!!.copy(acknowledgedAt = null)); host()
        ui.onNodeWithText("이 여행 받기").performScrollTo().performClick()
        ui.runOnIdle { state = PersonalVehicleState(phase = "blocked") }
        ui.onNodeWithText("이 여행을 받을까요?").assertDoesNotExist()
        ui.onNodeWithText("내 바다 여행").assertDoesNotExist()
        ui.onNodeWithText("검수친구 · 연결됨").assertDoesNotExist()
        ui.runOnIdle { state = received }
        ui.onNodeWithText("이 여행을 받을까요?").assertDoesNotExist()
        ui.runOnIdle { assertEquals(0, receipts) }
    }
    @Test fun pairingRequiresItsOwnConfirmationAndOfflineHidesIdentity() {
        state = PersonalVehicleState(phase="requested", pairingId="pair", accountName="검수친구", allowed=true, localParked=true); host()
        ui.onNodeWithText("이 계정과 연결").performScrollTo().performClick()
        ui.runOnIdle { assertEquals(0, connects) }
        ui.onNodeWithText("확인").performClick()
        ui.runOnIdle { assertEquals(1, connects); state=PersonalVehicleState(phase="offline",localParked=true) }
        ui.onNodeWithText("검수친구").assertDoesNotExist()
        ui.onNodeWithText("내 바다 여행").assertDoesNotExist()
    }
    @Test fun changingDeliveryInvalidatesOpenReviewAndUnpairNeedsConfirmation() {
        val received = received()
        state = received.copy(delivery = received.delivery!!.copy(acknowledgedAt = null)); host()
        ui.onNodeWithText("이 여행 받기").performScrollTo().performClick()
        ui.runOnIdle { state=received.copy(delivery=received.delivery!!.copy(id="new-delivery",revision=2)) }
        ui.onNodeWithText("이 여행을 받을까요?").assertDoesNotExist()
        ui.onNodeWithText("계정 연결 해제").performScrollTo().performClick()
        ui.runOnIdle { assertEquals(0, unpairs); assertEquals(0, receipts) }
        ui.onNodeWithText("확인").performClick()
        ui.runOnIdle { assertEquals(1, unpairs) }
    }
    @Test fun receivedTripUsesSharedContractAndRejectsOtherDeviceOrPairing() {
        val valid = fixture(); val parsed=decodePersonalState(valid,device)
        assertEquals("내 바다 여행",parsed.delivery!!.title)
        assertEquals("bear",parsed.delivery.avatar)
        assertEquals("海🌊".repeat(40), decodePersonalState(fixture().apply {
            getJSONObject("delivery").getJSONObject("snapshot").getJSONObject("trip").getJSONObject("plan").put("title","海🌊".repeat(40))
        },device).delivery!!.title)
        for (bad in listOf(
            fixture().put("scope","waymate-demo-v4"),
            fixture().apply {getJSONObject("device").put("id","00000000-0000-4000-8000-000000000009")},
            fixture().apply {getJSONObject("delivery").put("pairingId","00000000-0000-4000-8000-000000000009")},
            fixture().apply {getJSONObject("delivery").put("revision",0)},
            fixture().apply {getJSONObject("delivery").getJSONObject("snapshot").getJSONObject("trip").getJSONObject("plan").put("days",org.json.JSONArray())},
        )) {
            try { decodePersonalState(bad,device); fail("Malformed personal state was accepted") } catch (_: IllegalArgumentException) {}
        }
    }
    @Test fun reviewedTripKeepsItsOwnAliasAndCharacterAndShowsNotes() {
        val received=received()
        state=received.copy(accountName="바뀐 별명",accountAvatar="bear",delivery=received.delivery!!.copy(displayName="확인 별명",avatar="dragon"));host()
        ui.onNodeWithText("확인 별명 · 연결됨").assertExists()
        ui.onNodeWithContentDescription("따뜻한 곰 여행 친구").assertDoesNotExist()
        ui.onNodeWithText("• 지도에서 확인해요").performScrollTo().assertIsDisplayed()
        ui.runOnIdle {assertEquals(0,receipts)}
    }

    @Test fun pendingCodeIdentifiesTheVehicleWithoutImplyingAnApprovedConnection() {
        state=PersonalVehicleState(phase="pending",deviceName="내 차 · A1B2C3",pairingId="pending",code="12345678",localParked=true);host()
        ui.onNodeWithText("내 차 · A1B2C3").assertIsDisplayed()
        ui.onNodeWithTag("personal-pair-code").assertTextEquals("1234 5678")
        ui.onNodeWithText("이 계정과 연결").assertDoesNotExist()
        ui.onNodeWithText("이 여행 받기").assertDoesNotExist()
        ui.runOnIdle {assertEquals(0,connects);assertEquals(0,receipts)}
    }

}
