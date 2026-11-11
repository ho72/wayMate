import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { coordinator } from "../server/v4/commands.mjs";
import { initialState } from "../server/v4/state.mjs";
import { emptySummary } from "../shared/config/protocol.mjs";
const directory = await mkdtemp(join(tmpdir(), "waymate-examples-"));
const api = coordinator(join(directory, "state.json"), initialState(), {
  now: () => 100,
});
const client = randomUUID(),
  session = randomUUID(),
  fixtures = [];
async function command(
  type,
  payload,
  actor = "web",
  label = type.toLowerCase(),
  target = {},
) {
  const s = await api.read(actor, actor === "web" ? client : null);
  const c = {
    schemaVersion: 4,
    runSeq: s.runSeq,
    runId: s.runId,
    commandId: randomUUID(),
    expectedVersion: s.version,
    actor,
    type,
    target,
    payload,
  };
  fixtures.push({
    file: `command-${label}.json`,
    definition: "command",
    value: c,
  });
  return api.command(c, actor, actor === "web" ? client : null);
}
try {
  await mkdir(new URL("../shared/examples/v4/", import.meta.url), {
    recursive: true,
  });
  const answers = {
    interests: "cafe",
    activity: "walk_first_photos_occasional",
    conversation: "quiet",
    expression: "편하게 말해줘 ㅎㅎ",
  };
  for (const [questionId, answerText] of Object.entries(answers))
    await command(
      "ONBOARDING_ANSWER",
      { questionId, answerText, inputSource: "typed" },
      "web",
      `answer-${questionId}`,
    );
  await command("PROFILE_CONFIRM", {
    alias: "구름여행",
    avatarId: "a-02",
    confirmedSummary: {
      ...emptySummary(),
      interests: ["cafe"],
      speakingStyle: "light_humor",
    },
  });
  let s = await api.read("web", client);
  await command("TRIP_SAVE", {
    presetId: "gangneung-01",
    shareSummaryApproved: false,
  });
  async function act(name, actor = "web") {
    const st = await api.read(actor, actor === "web" ? client : null);
    const b = st.actionBindings[name];
    return command(
      b.commandType,
      b.payload,
      actor,
      name.toLowerCase(),
      b.target,
    );
  }
  await act("PROFILE_PUBLISH");
  await act("TRIP_SHARE_CONFIRM");
  await act("CONNECT_REQUEST");
  let pending = (await api.read("operator", null)).social.pendingResponses[0];
  await command(
    "B_RESPONSE",
    { decision: "accept" },
    "operator",
    "b-connection-accept",
    pending,
  );
  await act("CONFIRM_WINDOW");
  await command("HANDOFF_PREPARE", { mode: "connected" });
  fixtures.push({
    file: "state-web-waiting.json",
    definition: "state",
    value: await api.read("web", client),
  });
  const h = await api.handoff();
  fixtures.push({
    file: "handoff-connected.json",
    definition: "handoff",
    value: h,
  });
  await command(
    "CAR_SESSION_OPEN",
    { deviceId: randomUUID(), vehicleSessionId: session, pendingAttempts: [] },
    "car",
  );
  await command(
    "CAR_STATUS",
    {
      vehicleSessionId: session,
      statusSeq: 1,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "handoff",
    },
    "car",
  );
  fixtures.push({
    file: "state-car-ready.json",
    definition: "state",
    value: await api.read("car", null),
  });
  const result = await command(
    "CAR_LOADED",
    {
      vehicleSessionId: session,
      handoffId: h.handoffId,
      handoffVersion: h.handoffVersion,
      sourceVersions: h.sourceVersions,
      mode: "connected",
    },
    "car",
  );
  fixtures.push(
    { file: "success-car-loaded.json", definition: "success", value: result },
    {
      file: "state-web-confirmed.json",
      definition: "state",
      value: await api.read("web", client),
    },
    { file: "health.json", definition: "health", value: await api.health() },
  );
  await act("MEETING_PROPOSE", "car");
  fixtures.push({
    file: "state-car-meeting-waiting.json",
    definition: "state",
    value: await api.read("car", null),
  });
  pending = (await api.read("operator", null)).social.pendingResponses[0];
  await command(
    "B_RESPONSE",
    { decision: "accept" },
    "operator",
    "b-meeting-accept",
    pending,
  );
  fixtures.push({
    file: "state-car-meeting-confirmed.json",
    definition: "state",
    value: await api.read("car", null),
  });
  let resetState=await api.read("operator",null);
  await command("RESET_BEGIN",{},"operator","reset-begin-car",{runId:resetState.runId});
  fixtures.push({file:"state-car-reset-waiting.json",definition:"state",value:await api.read("car",null)});
  let resetBinding=(await api.read("car",null)).actionBindings.RESET_ACK;
  const resetAck=await command(resetBinding.commandType,resetBinding.payload,"car","reset-ack-car",resetBinding.target);
  fixtures.push({file:"success-reset-ack.json",definition:"success",value:resetAck},{file:"state-new-run.json",definition:"state",value:await api.read("web",client)});
  await command("ONBOARDING_ANSWER",{questionId:"interests",answerText:"직접 입력한 새 회차",inputSource:"typed"},"web","reset-web-seed");
  resetState=await api.read("operator",null);
  await command("RESET_BEGIN",{},"operator","reset-begin-web",{runId:resetState.runId});
  fixtures.push({file:"state-web-reset-waiting.json",definition:"state",value:await api.read("web",client)});
  resetBinding=(await api.read("web",client)).actionBindings.RESET_ACK;
  await command(resetBinding.commandType,resetBinding.payload,"web","reset-ack-web",resetBinding.target);
  // Stable UUIDs keep example diffs reviewable without changing relationships between files.
  const uuids = new Map();
  function stable(v) {
    if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v))
      return "2026-11-11T00:00:00.000Z";
    if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(v)) {
      if (!uuids.has(v))
        uuids.set(
          v,
          `00000000-0000-4000-8000-${String(uuids.size + 1).padStart(12, "0")}`,
        );
      return uuids.get(v);
    }
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, stable(x)]),
      );
    return v;
  }
  for (const f of fixtures)
    await writeFile(
      new URL(`../shared/examples/v4/${f.file}`, import.meta.url),
      JSON.stringify(stable(f.value), null, 2) + "\n",
    );
  await writeFile(
    new URL("../shared/examples/v4/index.json", import.meta.url),
    JSON.stringify(
      fixtures.map(({ file, definition }) => ({ file, definition })),
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
