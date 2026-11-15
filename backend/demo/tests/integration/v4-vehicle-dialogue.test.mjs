import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "../helpers/v4-fixture.mjs";
import { SLOTS, openAIVehicleDialogue, vehicleDialogueService, scenarioDrafts, dialogueContext } from "../../server/ai/vehicle-dialogue.mjs";
import { startServer } from "../../server/v4/http.mjs";
import { preparePleosValidation } from "../../scripts/start-pleos-validation.mjs";

const lines = () => Object.fromEntries(Object.keys(SLOTS).map((key) => [key,
  key.startsWith("drive.") ? "가상 바다쉼터는 잠깐 바다를 보며 쉬는 예시예요." : "바다를 보며 가볍게 이야기 나눠볼까요?"]));
async function prepared(t) { const f = await fixture(t); await f.connect(); await f.activate(); return f; }

test("vehicle dialogue uses confirmed summaries, approved peer facts and the December scenario, never raw survey or chat", async (t) => {
  const f = await prepared(t), c = await f.dialogueContext();
  assert.equal(c.context.trip.date, "2026-12-14");
  assert.equal(c.context.meeting.end, "14:35");
  assert.deepEqual(c.context.owner.preferences.interests, []); // Never infer from typed demo answers.
  assert.ok(c.context.peer.approvedFields.includes("interests"));
  assert.match(c.context.peerEvidence.Q1, /바다/);
  assert.doesNotMatch(JSON.stringify(c), /원문 그대로|onboarding|consultation|latitude|longitude/);
  const before = c.key; await f.status(); assert.equal((await f.dialogueContext()).key, before);
  await f.act("CONNECT_END", "car");
  const after = await f.dialogueContext();
  assert.equal(after.context.peer, null); assert.notEqual(after.key, before);
});

test("one packet coalesces, survives restart and cached reads do not generate while driving", async (t) => {
  const f = await prepared(t), original = await f.dialogueContext();
  let calls = 0, mode = "parked";
  const api = { dialogueContext: async () => ({ ...original, mode }) };
  const provider = { async generate() { calls++; await new Promise((r) => setTimeout(r, 25)); return lines(); } };
  const options = { file: f.file + ".dialogue.json" };
  let service = await vehicleDialogueService(api, provider, options);
  const results = await Promise.all([service.prepare({scope:original.scope}), service.prepare({scope:original.scope})]);
  assert.equal(calls, 1); assert.deepEqual(results[0].lines, results[1].lines);
  await service.close();
  mode = "driving_limited";
  service = await vehicleDialogueService(api, null, options);
  assert.equal(service.available,true); // Saved packets remain usable with all paid providers disabled.
  const cached = await service.prepare({scope:original.scope});
  assert.equal(cached.source, "openai"); assert.equal(cached.replayed, true); assert.equal(calls, 1);
  await service.close();
});

test("failed calls are remembered and reserve durable budget before the provider; no retry storm after restart", async (t) => {
  const f = await prepared(t), original = await f.dialogueContext(); let key = "a", calls = 0;
  const api = { dialogueContext: async () => ({ ...original, key }) };
  const provider = { async generate() { calls++; throw new Error("sensitive upstream details"); } };
  const options = { file: f.file + ".dialogue.json", maxCalls: 2 };
  let service = await vehicleDialogueService(api, provider, options);
  assert.equal((await service.prepare({scope:original.scope})).source, "fallback");
  assert.equal((await service.prepare({scope:original.scope})).replayed, true);
  await service.close(); service = await vehicleDialogueService(api, provider, options);
  assert.equal((await service.prepare({scope:original.scope})).replayed, true);
  key = "b"; await service.prepare({scope:original.scope}); key = "c";
  const budget = await service.prepare({scope:original.scope});
  assert.equal(budget.reason, "budget"); assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(budget), /sensitive/);
  assert.equal(JSON.parse(await readFile(options.file)).attempts, 2);
  await service.close();
});

test("choosing one's own journey reuses owner copy and removes peer copy without another paid call", async (t) => {
  const f=await prepared(t);let calls=0;
  const service=await vehicleDialogueService(f,{async generate(){calls++;return lines();}},{file:f.file+".dialogue.json"});
  const before=await f.dialogueContext();await service.prepare({scope:before.scope});
  await f.act("CONNECT_END","car");
  const result=await service.prepare({scope:before.scope});
  assert.equal(result.replayed,true);assert.equal(calls,1);
  assert.match(result.lines["peer.intro"],/연결된 친구가 없어요/);
  await service.close();
});

test("a cached response rechecks the current context after disk work", async (t) => {
  const f=await prepared(t), original=await f.dialogueContext();let checks=0,changing=false;
  const service=await vehicleDialogueService({dialogueContext:async()=>{
    checks++;return changing && checks>1 ? {...original,key:"new-profile"} : original;
  }},{async generate(){return lines();}},{file:f.file+".dialogue.json"});
  try {
    await service.prepare({scope:original.scope});
    checks=0;changing=true;
    await assert.rejects(service.prepare({scope:original.scope}),{code:"DIALOGUE_CHANGED"});
  } finally {await service.close();}
});

test("a vehicle that starts moving during preflight never starts a provider call", async (t) => {
  const f=await prepared(t), original=await f.dialogueContext();let checks=0,calls=0;
  const service=await vehicleDialogueService({dialogueContext:async()=>{
    checks++;return {...original,mode:checks===1?"parked":"driving_limited"};
  }},{async generate(){calls++;return lines();}},{file:f.file+".dialogue.json"});
  try {
    await assert.rejects(service.prepare({scope:original.scope}),{code:"DIALOGUE_PARKED_ONLY"});
    assert.equal(calls,0);
  } finally {await service.close();}
});

test("a dialogue cache has only one writer and releases its lock on idempotent shutdown", async (t) => {
  const f=await prepared(t), options={file:f.file+".dialogue.json"};
  const first=await vehicleDialogueService(f,null,options);
  try {await assert.rejects(vehicleDialogueService(f,null,options),{code:"EEXIST"});}
  finally {await Promise.all([first.close(),first.close()]);}
  const reopened=await vehicleDialogueService(f,null,options);await reopened.close();
});

test("shutdown during a paid request leaves a durable receipt instead of retrying after restart", async (t) => {
  const f=await prepared(t), original=await f.dialogueContext(), options={file:f.file+".dialogue.json"};
  let entered,calls=0;const ready=new Promise((r)=>{entered=r;});
  const first=await vehicleDialogueService(f,{async generate({signal}){
    calls++;entered();return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("stopped")),{once:true}));
  }},options);
  const work=first.prepare({scope:original.scope});const stopped=assert.rejects(work,{code:"UNAVAILABLE"});
  await ready;await first.close();await stopped;
  const second=await vehicleDialogueService(f,{async generate(){calls++;return lines();}},options);
  try {
    const result=await second.prepare({scope:original.scope});
    assert.equal(result.source,"fallback");assert.equal(result.replayed,true);assert.equal(calls,1);
    assert.equal(JSON.parse(await readFile(options.file)).attempts,1);
  }finally{await second.close();}
});

test("a failed server listen releases both state and dialogue locks", async (t) => {
  let first,second;t.after(async()=>{await second?.close();await first?.close();});
  const f=await fixture(t), file=f.file+".portcheck";
  first=await startServer({file:f.file+".other",port:0});
  await assert.rejects(startServer({file,port:first.port}),{code:"EADDRINUSE"});
  await assert.rejects(access(file+".lock"),{code:"ENOENT"});
  await assert.rejects(access(file+".dialogue.json.lock"),{code:"ENOENT"});
  second=await startServer({file,port:0});
});

test("the isolated validation baseline preserves scope and cached text and never rewinds the original", async (t) => {
  const f=await fixture(t);await f.connect();await f.send("HANDOFF_PREPARE",{mode:"connected"});
  const original=await readFile(f.file), context=dialogueContext(JSON.parse(original),0,{preparing:true});
  const service=await vehicleDialogueService({dialogueContext:async()=>context},{async generate(){return lines();}},{file:f.file+".dialogue.json"});
  await service.prepare({scope:context.scope});await service.close();
  const cache=await readFile(f.file+".dialogue.json"), file=f.file+".validation";
  const prepared=await preparePleosValidation({source:f.file,file});
  assert.equal(prepared.metadata.scope,context.scope);
  assert.deepEqual(await readFile(file),original);assert.deepEqual(await readFile(file+".dialogue.json"),cache);
  await writeFile(file,"changed validation state");
  await preparePleosValidation({source:f.file,file,refresh:true});
  assert.deepEqual(await readFile(file),original);assert.deepEqual(await readFile(f.file),original);
  await writeFile(file+".lock","test-lock");
  await assert.rejects(preparePleosValidation({source:f.file,file,refresh:true}),/Stop the validation server/);
  await assert.rejects(preparePleosValidation({source:f.file,file:f.file}),/separate from the original/);
});

test("uncached generation is parked-only and a reset or profile change rejects a late packet", async (t) => {
  const f = await prepared(t), original = await f.dialogueContext(); let current = {...original,mode:"driving_limited"};
  let finish, entered; const ready = new Promise((r) => {entered=r;});
  const service = await vehicleDialogueService({ dialogueContext: async () => current }, {
    async generate() { entered(); return new Promise((r) => {finish=r;}); },
  }, { file:f.file+".dialogue.json" });
  await assert.rejects(service.prepare({scope:original.scope}), {code:"DIALOGUE_PARKED_ONLY"});
  current = original; const work = service.prepare({scope:original.scope}); await ready;
  current = {...original,key:"changed-private-profile"}; finish(lines());
  await assert.rejects(work, {code:"DIALOGUE_CHANGED"});
  const receipt=JSON.parse(await readFile(f.file+".dialogue.json")).entries[original.key];
  assert.equal(receipt.source,"fallback");assert.deepEqual(receipt.lines,{});
  await service.close();
});

test("OpenAI packet preserves identities and facts, repairs unsafe driving slots without a paid retry", async (t) => {
  const f = await prepared(t), {context} = await f.dialogueContext(); let request, next = lines();
  const provider = openAIVehicleDialogue({apiKey:"synthetic-secret",fetchImpl:async (url, options) => {
    assert.equal(url,"https://api.openai.com/v1/responses"); request=JSON.parse(options.body);
    return new Response(JSON.stringify({status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:JSON.stringify(next)}]}]}));
  }});
  await provider.generate({context,signal:AbortSignal.timeout(1000)});
  assert.equal(request.store,false); assert.equal(request.max_output_tokens,3200);
  assert.equal(request.tools,undefined); assert.equal(request.text.format.strict,true);
  assert.match(request.instructions,/70자/); assert.match(request.instructions,/비공개/);
  assert.doesNotMatch(JSON.stringify(request),/synthetic-secret/);
  next["drive.rest"]="가".repeat(71);
  const long=await provider.generate({context,signal:AbortSignal.timeout(1000)});
  assert.ok(long.fallbackSlots.includes("drive.rest"));
  assert.equal(long.lines["drive.rest"],scenarioDrafts(context)["drive.rest"]);
  next=lines(); next["drive.rest"]="버튼을 눌러 주세요.";
  next["peer.intro"]="안녕하세요. 저는 솔바람입니다.";
  next["place.rest-1"]="가상 바다쉼터는 14분 거리에 있어요.";
  const repaired=await provider.generate({context,signal:AbortSignal.timeout(1000)});
  for (const key of ["drive.rest","peer.intro","place.rest-1"]) {
    assert.ok(repaired.fallbackSlots.includes(key)); assert.equal(repaired.lines[key],scenarioDrafts(context)[key]);
  }
});

test("HTTP dialogue is car-only and rejects cross-origin, arbitrary prompts and stale scopes without provider calls", async (t) => {
  let app; t.after(()=>app?.close()); // Close the writer before fixture directory cleanup.
  const f = await prepared(t); const disk=JSON.parse(await readFile(f.file)); await f.close(); let calls=0;
  app=await startServer({file:f.file,port:0,now:()=>10000,dialogueProvider:{async generate(){calls++;return lines();}}});
  const base=`http://127.0.0.1:${app.port}`;
  const request=(path,body,actor="car",headers={})=>fetch(base+path,{method:body?"POST":"GET",headers:{"X-Demo-Actor":actor,"X-Demo-Client-Id":f.id,...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  let s=await (await request("/api/state?view=car")).json();
  const heartbeat={schemaVersion:4,runSeq:s.runSeq,runId:s.runId,expectedVersion:s.version,commandId:randomUUID(),actor:"car",type:"CAR_STATUS",target:{},payload:{vehicleSessionId:disk.vehicle.vehicleSessionId,statusSeq:999,restrictionKnown:true,restricted:false,foreground:true,uiContext:"navigation"}};
  assert.equal((await request("/api/commands",heartbeat)).status,200);
  const body={scope:`${s.storeId}:${s.runId}`};
  assert.equal((await request("/api/agent/dialogue",body,"web")).status,403);
  assert.equal((await request("/api/agent/dialogue",body,"operator")).status,403);
  assert.equal((await request("/api/agent/dialogue",body,"car",{Origin:"https://other.test"})).status,403);
  assert.equal((await request("/api/agent/dialogue",{...body,message:"arbitrary instruction"})).status,400);
  assert.equal((await request("/api/agent/dialogue",{scope:"stale"})).status,409);
  assert.equal(calls,0);
  const result=await request("/api/agent/dialogue",body); assert.equal(result.status,200);
  assert.equal((await result.json()).source,"openai"); assert.equal(calls,1);
  // Merely polling state/scenario never starts generation.
  await request("/api/state?view=car"); await request("/api/scenario"); assert.equal(calls,1);
});
