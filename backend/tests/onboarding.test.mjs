import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openRepository } from "../server/store.mjs";
import { startService } from "../server/http.mjs";
import { CHARACTERS, character } from "../../mobile-web/shared/characters.mjs";

const preferences = { interests: ["바다 산책", "조용한 카페"], travelStyle: "한곳에서 느긋하게 쉬는 여행", about: "처음에는 조용한 대화가 편해요." };
async function repository(t) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-onboarding-"));
  const file = join(dir, "test.sqlite");
  let repo = await openRepository(file);
  t.after(async () => { await repo.close(); await rm(dir, { recursive: true, force: true }); });
  return { file, get repo() { return repo; }, async restart() { await repo.close(); repo = await openRepository(file); } };
}
function summary(repo, user, chat) {
  repo.consent(user.id, true);
  let current = repo.chat(user.id, chat.id);
  const turn = repo.beginTurn(user.id, chat.id, { requestId: randomUUID(), message: "바다 산책과 조용한 카페가 좋아요.", expectedVersion: current.version });
  const draft = { id: randomUUID(), kind: "preferences", body: preferences, baseProfileVersion: repo.getUser(user.id).profileVersion };
  repo.finishTurn(user.id, turn.id, 1, { reply: "함께 확인해 줄래?", drafts: [draft], events: [] });
  return draft;
}

test("두루·루밋·모카 remain distinct selectable characters and keep their saved identities", async (t) => {
  const f = await repository(t);
  assert.deepEqual(CHARACTERS.map(({name}) => name), ["두루", "루밋", "모카"]);
  assert.equal(character("bear").image, "/assets/rumit.png");
  assert.equal(character("mocha").image, "/assets/mocha.png");
  assert.equal(character("bear").together, "루밋과");
  const users = CHARACTERS.map(({id}) => {
    const user = f.repo.createUser("select-" + id, "unused-hash", "선택 검수");
    f.repo.startOnboarding(user.id, {avatar:id,version:1});
    return {userId:user.id,avatar:id};
  });
  await f.restart();
  for(const {userId,avatar} of users) assert.equal(f.repo.getUser(userId).profile.avatar,avatar);
});

test("new signup persists character → survey → review → explicitly confirmed preferences; retries do not duplicate chats", async (t) => {
  const f = await repository(t);
  const user = f.repo.createUser("welcome", "unused-hash", "여행자");
  assert.equal(user.onboarding.phase, "character");
  const started = f.repo.startOnboarding(user.id, { avatar: "bear", version: 1 });
  assert.equal(started.user.profile.avatar, "bear");
  assert.equal(started.onboarding.phase, "survey");
  assert.equal(f.repo.startOnboarding(user.id, { avatar: "bear", version: 1 }).chat.id, started.chat.id);
  assert.equal(f.repo.listChats(user.id).length, 1);
  await f.restart();
  assert.equal(f.repo.onboardingData(user.id).chat.id, started.chat.id);
  const draft = summary(f.repo, user, started.chat);
  const review = f.repo.onboardingData(user.id);
  assert.equal(review.onboarding.phase, "review");
  assert.deepEqual(review.user.profile.interests, []);
  const body = { version: review.onboarding.version, draftId: draft.id, profileVersion: review.user.profileVersion, preferences: { ...preferences, interests: ["바다 산책"] } };
  const saved = f.repo.completeOnboarding(user.id, body);
  assert.equal(saved.onboarding.phase, "completed");
  assert.deepEqual(saved.user.profile.interests, ["바다 산책"]);
  assert.equal(saved.user.profile.avatar, "bear");
  assert.equal(f.repo.completeOnboarding(user.id, body).user.profileVersion, saved.user.profileVersion);
  await f.restart();
  assert.equal(f.repo.onboardingState(user.id).phase, "completed");
});

test("cross-account drafts, premature completion and stale profile/review versions cannot overwrite user preferences", async (t) => {
  const { repo } = await repository(t);
  const a = repo.createUser("alpha", "unused-hash", "A"), b = repo.createUser("bravo", "unused-hash", "B");
  assert.throws(() => repo.completeOnboarding(a.id, { version: 1, draftId: randomUUID(), profileVersion: 1, preferences }), { code: "ONBOARDING_CONFLICT" });
  const started = repo.startOnboarding(a.id, { avatar: "dragon", version: 1 });
  assert.throws(() => repo.startOnboarding(a.id, { avatar: "bear", version: 1 }), { code: "ONBOARDING_CONFLICT" });
  assert.throws(() => repo.startOnboarding(b.id, { avatar: "other", version: 1 }), { code: "INVALID_INPUT" });
  const draft = summary(repo, a, started.chat), review = repo.onboardingData(a.id);
  const body = { version: review.onboarding.version, draftId: draft.id, profileVersion: review.user.profileVersion, preferences };
  assert.throws(() => repo.completeOnboarding(a.id, { ...body, version: body.version - 1 }), { code: "ONBOARDING_CONFLICT" });
  assert.throws(() => repo.completeOnboarding(b.id, body), { code: "ONBOARDING_CONFLICT" });
  repo.profile(a.id, { ...review.user.profile, displayName: "다른 창에서 변경" }, review.user.profileVersion);
  assert.throws(() => repo.completeOnboarding(a.id, body), { code: "VERSION_CONFLICT" });
  assert.equal(repo.onboardingState(a.id).phase, "review");
  assert.deepEqual(repo.getUser(a.id).profile.interests, []);
  const fresh = repo.getUser(a.id);
  const turn = repo.beginTurn(a.id, started.chat.id, {requestId:randomUUID(),message:"추가로 이야기할게요",expectedVersion:repo.chat(a.id,started.chat.id).version});
  assert.throws(() => repo.completeOnboarding(a.id, {...body, profileVersion:fresh.profileVersion}), {code:"TURN_PENDING"});
  repo.failTurn(a.id, turn.id, 1, "CANCELLED");
  repo.completeOnboarding(a.id, {...body, profileVersion:fresh.profileVersion});
  assert.equal(repo.getUser(a.id).profile.displayName, "다른 창에서 변경");
});

test("legacy accounts remain outside signup personalization when the additive schema is installed", async (t) => {
  const f = await repository(t);
  const user = f.repo.createUser("legacy", "unused-hash", "기존 사용자");
  // An old database has the users table but no onboarding table/rows.
  const db = new DatabaseSync(f.file);
  db.exec("DROP TABLE onboarding"); db.close();
  await f.restart();
  assert.equal(f.repo.getUser(user.id).onboarding, null);
  assert.equal(f.repo.getUser(user.id).profile.displayName, "기존 사용자");
});

test("HTTP onboarding uses the real message runner contract, four answers, consent, ownership and confirmation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "waymate-welcome-http-"));
  const observed = [];
  const agent = { async run({ onboarding, execute, onDelta }) {
    observed.push(onboarding.answerCount);
    if (onboarding.answerCount < 4) await assert.rejects(execute("propose_preferences", preferences), {code:"ONBOARDING_TOOL"});
    else await execute("propose_preferences", preferences);
    const reply = onboarding.answerCount < 4 ? "그렇구나! 여행할 때는 어떤 속도가 편해?" : "네 이야기를 정리했어. 함께 확인해 줄래?";
    onDelta(reply); return {reply};
  }};
  const app = await startService({file:join(dir,"test.sqlite"),port:0,agent});
  t.after(async () => { await app.close(); await rm(dir,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${app.port}`;
  let cookie, csrf;
  async function request(path, body) {
    const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:base,"Content-Type":"application/json"}),...(csrf?{"X-CSRF-Token":csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(response.headers.get("set-cookie")) cookie=response.headers.get("set-cookie").split(";")[0];
    const data=await response.json(); if(data.csrf) csrf=data.csrf; return {status:response.status,data};
  }
  assert.equal((await request("/api/onboarding")).status,401);
  const signup=await request("/api/auth/register",{handle:"onboard",displayName:"여행자",password:"A-test-password-2026"});
  assert.equal(signup.data.user.onboarding.phase,"character");
  let state=(await request("/api/onboarding/character",{avatar:"bear",version:1})).data;
  const before=await request(`/api/chats/${state.chat.id}/messages`,{message:"산책이 좋아",requestId:randomUUID(),expectedVersion:state.chat.version});
  assert.equal(before.status,403);
  await request("/api/consent",{accepted:true});
  for(let index=0;index<4;index++) {
    state=(await request("/api/onboarding")).data;
    const sent=await request(`/api/chats/${state.chat.id}/messages`,{message:"바다를 천천히 걷고 조용한 카페에서 쉬는 게 좋아",requestId:randomUUID(),expectedVersion:state.chat.version});
    assert.equal(sent.status,202);
    const event=await fetch(`${base}/api/turns/${sent.data.turnId}/events`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(5000)});
    assert.match(await event.text(),/event: done/);
  }
  state=(await request("/api/onboarding")).data;
  assert.deepEqual(observed,[1,2,3,4]);
  assert.equal(state.onboarding.phase,"review");
  assert.deepEqual(state.user.profile.interests,[]);
  const saved=await request("/api/onboarding/complete",{draftId:state.draft.id,version:state.onboarding.version,profileVersion:state.user.profileVersion,preferences});
  assert.equal(saved.status,200);
  assert.equal(saved.data.user.onboarding.phase,"completed");
  assert.deepEqual(saved.data.user.profile.interests,preferences.interests);
});
