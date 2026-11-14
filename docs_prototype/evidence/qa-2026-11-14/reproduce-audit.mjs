// Reproduce F1/F3 in fresh temporary coordinator stores. No live HTTP server or device is used.
import { fixture } from "../../../mock-app/tests/helpers/v4-fixture.mjs";
import { profileAnswer } from "../../../mock-app/shared/config/content-v4.mjs";
import { peer } from "../../../mock-app/server/v4/social.mjs";

const cleanups = [];
const testContext = { after: (cleanup) => cleanups.push(cleanup) };
const cases = [];

try {
  for (const kind of ["A_cancel", "B_reject", "B_cancel", "A_decline"]) {
    const instance = await fixture(testContext);
    try {
      await instance.connect();
      await instance.activate("connected", "mock");
      if (kind !== "A_decline") await instance.act("MEETING_PROPOSE", "car");
      if (kind === "A_cancel") await instance.act("MEETING_CANCEL", "car");
      if (kind === "B_reject") await instance.respond("meeting", "reject");
      if (kind === "B_cancel") await instance.respond("meeting", "cancel");
      if (kind === "A_decline") await instance.act("MEETING_DECLINE", "car");
      const state = await instance.read("car");
      cases.push({
        kind,
        meetingStatus: state.social.meeting.status,
        connectionStatus: state.social.connection.status,
        peer: state.social.peer?.alias,
        content: state.content,
        phase: state.journey.phase,
        canWithdraw: Boolean(state.actionBindings.PROFILE_PRIVATE),
      });
    } finally {
      await instance.close();
    }
  }
  const result = {
    cases,
    q2WithOwnInterests: profileAnswer("Q2", peer, ["sea_walk", "cafe"]),
    q2WithoutOwnInterests: profileAnswer("Q2", peer, []),
  };
  const json = JSON.stringify(result, null, 2) + "\n";
  process.stdout.write(json);
} finally {
  for (const cleanup of cleanups) await cleanup();
}
