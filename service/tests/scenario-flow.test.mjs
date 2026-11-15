import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { vehicleFixture } from "./helpers/vehicle-fixture.mjs";
import { DEFAULT_PLAN } from "../shared/travel.mjs";
import { scenarioDrafts } from "../../mock-app/server/ai/vehicle-dialogue.mjs";

const envelope = (s, type, payload = {}, target = {}) => ({ commandId: randomUUID(), runId: s.runId,
  runSeq: s.runSeq, expectedVersion: s.version, type, payload, target });

for (const [avatar, avatarId] of [["dragon", "a-01"], ["bear", "a-02"], ["mocha", "a-03"]]) {
  test(`${avatar}: saved mobile plan through identical Pleos handoff, dialogue, message, call, meeting, both endings and cleanup`, async t => {
    let dialogueCalls = 0, speechCalls = 0;
    const f = await vehicleFixture(t, { scenarioDemo: true,
      dialogueProvider: { async generate({ context }) { dialogueCalls++; return scenarioDrafts(context); } },
      speechProvider: { voices: ["default", "dragon", "bear", "mocha"], async synthesize() { speechCalls++; return Buffer.from("ID3-scenario-fixture"); } },
    });
    const u = await f.register(), repo = f.repo(), account = repo.getUser(u.id);
    repo.profile(u.id, { ...account.profile, avatar, displayName: "파도" }, account.profileVersion);
    const tripId = f.saveTrip(u, structuredClone(DEFAULT_PLAN));
    const mobileRead = async () => (await f.request(u, `/api/journey?tripId=${tripId}`)).data.state;
    const opRead = async () => (await f.request(u, `/api/journey/operator?tripId=${tripId}`)).data.state;
    const checked = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
    const mobile = async (type, payload, target) => {
      const s = await mobileRead(), b = s.actionBindings[type];
      return checked(await f.request(u, "/api/journey/command", { tripId, ...envelope(s, type, payload ?? b?.payload, target ?? b?.target) }));
    };
    const native = async (path, body, extra = {}) => {
      const r = await fetch(f.base() + path, { method: body ? "POST" : "GET", headers: { "X-Demo-Actor": "car",
        ...(body ? { "Content-Type": "application/json" } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: r.status, data: await r.json() };
    };
    const carRead = async () => checked(await native("/api/state"));
    const car = async (type, payload, target) => {
      const s = await carRead(), b = s.actionBindings[type];
      return checked(await native("/api/commands", { schemaVersion: 4, actor: "car", ...envelope(s, b?.commandType ?? type, payload ?? b?.payload, target ?? b?.target) }));
    };
    const operate = async (key, payload, target) => {
      const s = await opRead(), b = s.actionBindings[key];
      return checked(await f.request(u, "/api/journey/operate", { tripId, ...envelope(s, b?.commandType ?? key, payload ?? b?.payload, target ?? b?.target) }));
    };
    const respond = async (kind, decision) => {
      const s = await opRead(), target = s.social.pendingResponses.find(x => x.kind === kind)
        ?? (kind === "final" ? s.actionBindings[`B_FINAL_${decision.toUpperCase()}`]?.target : null);
      assert.ok(target, `pending ${kind}`);
      const body = envelope(s, "B_RESPONSE", { decision }, target); delete body.type;
      return checked(await f.request(u, "/api/journey/respond", { tripId, ...body }));
    };
    checked(await f.request(u, "/api/journey/prepare", { tripId, expectedVersion: (await mobileRead()).version,
      profileVersion: repo.getUser(u.id).profileVersion, tripVersion: repo.trip(u.id, tripId).version,
      introduction: "바다 산책과 조용한 카페를 좋아해요.", availability: { date: "2026-12-14", start: "13:00", end: "15:00" } }));
    assert.equal((await mobileRead()).profile.privateSummary.activityPreference, null);
    await mobile("PROFILE_PUBLISH", { profileVersion: (await mobileRead()).profileVersion, approvedFields: ["alias", "avatarId", "introduction"] });
    await mobile("TRIP_SHARE_CONFIRM"); await mobile("CONNECT_REQUEST");
    await respond("connection", "accept"); await mobile("CONFIRM_WINDOW"); await mobile("HANDOFF_PREPARE", { mode: "connected" });
    let s = await mobileRead();
    checked(await f.request(u, "/api/journey/transfer", { tripId, runId: s.runId, handoffId: s.handoff.handoffId }));
    const deviceId = randomUUID(), vehicleSessionId = randomUUID(); let statusSeq = 0;
    await car("CAR_SESSION_OPEN", { deviceId, vehicleSessionId, navigationSource: "mock", pendingAttempts: [] });
    const status = () => car("CAR_STATUS", { vehicleSessionId, statusSeq: ++statusSeq, restrictionKnown: true, restricted: false, foreground: true, uiContext: "navigation" });
    await status();
    const h = checked(await native("/api/handoff"));
    assert.equal(h.owner.alias, "파도"); assert.equal(h.owner.avatarId, avatarId);
    assert.deepEqual(h.ownerTrip.plan, DEFAULT_PLAN); assert.equal(h.ownerTrip.planId, tripId);
    await car("CAR_LOADED"); assert.equal((await mobileRead()).handoff.acknowledged, true);
    s = await carRead(); const scope = `${s.storeId}:${s.runId}`;
    assert.equal(checked(await native("/api/scenario")).capabilities.vehicleDialogue, true);
    assert.equal(checked(await native("/api/agent/dialogue", { scope })).source, "openai");
    assert.equal(checked(await native("/api/agent/dialogue", { scope })).replayed, true);
    assert.equal(dialogueCalls, 1);
    assert.equal((await native("/api/agent/dialogue", { scope: "old-run" })).status, 409);
    const audioBody = { requestId: randomUUID(), voice: avatar, text: "오늘도 네 속도로 여행하자.", consent: true };
    for (let i = 0; i < 2; i++) {
      const r = await fetch(f.base() + "/api/tts", { method: "POST", headers: { "X-Demo-Actor": "car", "Content-Type": "application/json" }, body: JSON.stringify(audioBody) });
      assert.equal(r.status, 200); assert.match(r.headers.get("Content-Type"), /audio/); await r.arrayBuffer();
    }
    assert.equal(speechCalls, 1);
    await car("MESSAGE_SEND_M1"); await respond("message", "reply"); await car("MESSAGE_REPLY_R1");
    await car("CALL_PROPOSE"); await respond("call", "accept"); await car("CALL_END");
    await car("MEETING_PROPOSE"); await respond("meeting", "accept"); await car("NAV_APPROVE");
    let attempt = (await opRead()).mockNavigation.attempts.at(-1);
    await operate("NAV_MOCK_RESULT", { outcome: "applied" }, { attemptId: attempt.attemptId, operation: "add" });
    await operate("MEETING_START"); await operate("MEETING_END");
    await car("FINAL_CHOOSE_TOGETHER"); await respond("final", "together");
    assert.equal((await carRead()).journey.phase, "together");
    await operate("REPLAY_FINAL"); await car("FINAL_CHOOSE_MY_AGENT"); await respond("final", "my_agent");
    assert.equal((await carRead()).journey.phase, "my_agent");
    assert.equal((await carRead()).mockNavigation.attempts.length, 1);
    await f.restart(); await status();
    assert.equal((await mobileRead()).handoff.acknowledged, true);
    assert.equal(checked(await native("/api/agent/dialogue", { scope })).replayed, true); assert.equal(dialogueCalls, 1);
    s = await mobileRead();
    checked(await f.request(u, "/api/journey/reset", { tripId, ...envelope(s, "RESET_BEGIN", {}, { runId: s.runId }) }));
    await car("NAV_REMOVE_APPROVE"); attempt = (await opRead()).mockNavigation.attempts.at(-1);
    await operate("NAV_MOCK_RESULT", { outcome: "removed" }, { attemptId: attempt.attemptId, operation: "remove" });
    await car("RESET_ACK");
    assert.notEqual((await mobileRead()).runId, s.runId);
    assert.equal((await native("/api/agent/dialogue", { scope })).status, 409);
  });
}
