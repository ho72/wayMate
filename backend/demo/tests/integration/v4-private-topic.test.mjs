import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  profileAnswer,
  UNKNOWN,
  PEER_TOPIC_GENERAL,
} from "../../shared/config/content-v4.mjs";
import { peer } from "../../server/v4/social.mjs";
import { emptySummary } from "../../shared/config/protocol.mjs";
import { fixture } from "../helpers/v4-fixture.mjs";

test("Q2 uses the documented neutral topic for absent, partial and different public A interests", () => {
  for (const interests of [[], ["sea_walk"], ["cafe"], ["other"]]) {
    assert.equal(profileAnswer("Q2", peer, interests), PEER_TOPIC_GENERAL);
    assert.ok(!profileAnswer("Q2", peer, interests).includes("둘 다"));
  }
  assert.notEqual(
    profileAnswer("Q2", peer, ["sea_walk", "cafe"]),
    PEER_TOPIC_GENERAL,
  );
});
test("Q2 never turns missing or unapproved B facts into a neutral or shared-preference answer", () => {
  const cases = [
    null,
    { ...peer, approvedFields: [] },
    { ...peer, interests: [] },
    { ...peer, conversationStyle: null },
    ...["interests", "conversationStyle"].map((key) => ({
      ...peer,
      approvedFields: peer.approvedFields.filter((x) => x !== key),
    })),
  ];
  for (const candidate of cases)
    for (const own of [[], ["sea_walk"], ["sea_walk", "cafe"]])
      assert.equal(profileAnswer("Q2", candidate, own), UNKNOWN);
});
for (const own of [[], ["sea_walk"], ["sea_walk", "cafe"]]) {
  test(`car Q2 projects the documented answer using only approved A interests ${JSON.stringify(own)}`, async (t) => {
    const f = await fixture(t);
    await f.prepare();
    await f.send("PROFILE_CONFIRM", {
      alias: "파도",
      avatarId: "a-01",
      confirmedSummary: { ...emptySummary(), interests: own },
    });
    const version = (await f.read()).profileVersion;
    await f.send("PROFILE_PUBLISH", {
      profileVersion: version,
      approvedFields: ["alias", "avatarId", "interests"],
    });
    await f.act("TRIP_SHARE_CONFIRM");
    await f.act("CONNECT_REQUEST");
    await f.respond("connection", "accept");
    await f.act("CONFIRM_WINDOW");
    await f.activate();
    const expected =
      own.length === 2 ? profileAnswer("Q2", peer, own) : PEER_TOPIC_GENERAL;
    const q = (await f.read("car")).content.questions.find(
      (x) => x.id === "Q2",
    );
    assert.equal(q.answer, expected);
    assert.equal(q.known, true);
    await f.restart();
    assert.equal(
      (await f.read("car")).content.questions.find((x) => x.id === "Q2").answer,
      expected,
    );
  });
}
test("private A preferences do not become a public common-interest claim or consent through Q2", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await f.send("PROFILE_CONFIRM", {
    alias: "파도",
    avatarId: "a-01",
    confirmedSummary: { ...emptySummary(), interests: ["sea_walk", "cafe"] },
  });
  await f.publish();
  await f.act("CONNECT_REQUEST");
  await f.respond("connection", "accept");
  await f.act("CONFIRM_WINDOW");
  await f.activate();
  const s = await f.read("car");
  assert.equal(
    s.content.questions.find((x) => x.id === "Q2").answer,
    PEER_TOPIC_GENERAL,
  );
  assert.ok(!s.social.approvedFields.includes("interests"));
  assert.equal(s.social.meeting.status, "none");
  assert.equal(s.navigation?.attempts.length ?? 0, 0);
  const stored = JSON.parse(await readFile(f.file));
  assert.deepEqual(stored.profile.privateSummary.interests, [
    "sea_walk",
    "cafe",
  ]);
  assert.ok(!stored.social.approvedFields.includes("interests"));
});
test("the neutral Q2 text has a bundled audio clip with the same public-fact requirements", async () => {
  const index = JSON.parse(
    await readFile(
      new URL("../../assets/audio/prepared-v1/index.json", import.meta.url),
    ),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("../../shared/assets-manifest.json", import.meta.url),
    ),
  );
  const entry = index.entries.find((x) => x.text === PEER_TOPIC_GENERAL);
  assert.ok(entry);
  const cue = manifest.audioCues[entry.file.slice(0, -4)];
  assert.equal(cue.sourceKind, "peer_agent");
  assert.deepEqual(cue.requiredPublicFields, [
    "interests",
    "conversationStyle",
  ]);
  assert.ok(
    (
      await readFile(
        new URL(
          "../../assets/audio/prepared-v1/" + entry.file,
          import.meta.url,
        ),
      )
    ).length > 1000,
  );
});
