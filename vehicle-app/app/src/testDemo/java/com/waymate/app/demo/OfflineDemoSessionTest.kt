package com.waymate.app.demo
import org.junit.Assert.*
import org.junit.Test
class OfflineDemoSessionTest {
    @Test fun callAndReviewScenesHaveTheirRequiredLocalPrerequisites() {
        val session = OfflineDemoSession()
        session.select("extra-MC")
        assertEquals("active", session.state().content.call?.status)
        session.select("extra-REVIEW")
        assertEquals("together", session.state().ending.phase)
    }
    @Test fun replyUsesTheSelectedPreparedAnswer() {
        val session = OfflineDemoSession()
        session.select("content-messages")
        session.act("MESSAGE_REPLY", "R2")
        assertEquals("replied", session.state().content.threads.single().status)
        assertEquals("저는 조용한 카페도 좋아해요.", session.state().content.threads.single().reply)
    }
    @Test fun drivingProjectionCannotDispatchAnythingAndPreparedMeetingContinues() {
        val session = OfflineDemoSession()
        session.select("meeting-proposal")
        val before = session.state()
        com.waymate.app.model.DrivingContexts.home(before.journey)
        assertEquals(before, session.state())
        session.act("MEETING_PROPOSE", "meeting")
        assertEquals("confirmed", session.state().social.meetingStatus)
    }
}
