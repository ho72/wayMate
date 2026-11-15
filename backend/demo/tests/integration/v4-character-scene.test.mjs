import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../../server/v4/http.mjs";
import { mobileBrowser } from "../helpers/mobile-browser.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-character-scene-"));
  const server = await startServer({file:join(dir,"state.json"),port:0});
  t.after(async () => {await server.close(); await rm(dir,{recursive:true,force:true});});
  const h = await mobileBrowser(`http://127.0.0.1:${server.port}`);
  for (const questionId of ["interests","activity","conversation","expression"])
    await h.api.command("ONBOARDING_ANSWER",{questionId,answerText:"검수용 직접 입력",inputSource:"typed"});
  h.render();
  return h;
}
function scene(h, avatar) {
  assert.deepEqual(h.scene(), avatar === "a-02"
    ? {src:"/bear.png",alt:"함께 여행할 포근한 곰 친구"}
    : {src:"/character.png",alt:"함께 여행할 파란 드래곤 친구"});
}

test("character hero follows both selections and restores an unsaved draft on reload", async t => {
  let h = await fixture(t); scene(h,"a-01");
  await h.choose("a-02"); scene(h,"a-02");
  await h.choose("a-01"); scene(h,"a-01");
  await h.choose("a-02"); h = await h.reload();
  assert.equal(h.selected(),"a-02"); scene(h,"a-02");
  assert.equal(h.api.state.profile,null);
});

test("editing a saved character previews the new choice while other screens keep confirmed identity", async t => {
  const h = await fixture(t);
  await h.choose("a-02"); await h.confirmProfile(); scene(h,"a-02");
  assert.equal(h.api.state.profile.avatarId,"a-02");
  await h.editProfile(); await h.choose("a-01"); scene(h,"a-01");
  assert.equal(h.api.state.profile.avatarId,"a-02","preview must not save the profile");
  const trip = h.element("steps").children.find(e=>e.textContent === "여행 계획");
  trip.onclick(); scene(h,"a-02");
  await h.editProfile(); scene(h,"a-01");
  await h.confirmProfile(); scene(h,"a-01");
  assert.equal(h.api.state.profile.avatarId,"a-01");
});

for (const avatar of ["a-01","a-02"]) test(`confirmed ${avatar} survives reload and remains the avatar in the car handoff`, async t => {
  let h = await fixture(t);
  await h.choose(avatar); await h.confirmProfile();
  h = await h.reload(); scene(h,avatar);
  assert.equal(h.selected(),avatar);
  assert.equal(h.api.state.profile.avatarId,avatar);
  await h.api.command("TRIP_SAVE",{presetId:"gangneung-01",shareSummaryApproved:false});
  const binding = h.api.state.actionBindings.HANDOFF_PREPARE;
  await h.api.command(binding.commandType,binding.payload,binding.target);
  const handoff = await h.handoff();
  assert.equal(handoff.owner.avatarId,avatar);
  assert.equal(handoff.peer,null);
  scene(h,avatar);
});
