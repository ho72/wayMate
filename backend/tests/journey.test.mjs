import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { vehicleFixture } from "./helpers/vehicle-fixture.mjs";

const prepareBody = (data, version = 1) => ({ expectedVersion:data.state.version, profileVersion:version, tripVersion:data.trip.version, introduction:"바다를 천천히 걷고, 커피 한 잔 마시며 여행 이야기를 나누고 싶어요.", availability:{date:"2026-12-14",start:"13:00",end:"15:00"} });
const outgoing = (s,type,payload,target) => ({commandId:randomUUID(),runId:s.runId,runSeq:s.runSeq,expectedVersion:s.version,type,
  payload:payload ?? s.actionBindings[type]?.payload ?? {}, target:target ?? s.actionBindings[type]?.target ?? {}});
async function setup(t, options={}) {
  const f=await vehicleFixture(t,{scenarioDemo:true,...options}),u=await f.register();
  const account=f.repo().getUser(u.id);f.repo().profile(u.id,{...account.profile,displayName:"파도"},account.profileVersion);
  const read=async()=> (await f.request(u,"/api/journey")).data;
  const command=async(type,payload,target)=>f.request(u,"/api/journey/command",outgoing((await read()).state,type,payload,target));
  const prepare=async()=> f.request(u,"/api/journey/prepare",prepareBody(await read(),f.repo().getUser(u.id).profileVersion));
  return {...f,u,read,command,prepare};
}
test("mobile connects Solbaram, persists reviewed fields, and Pleos acknowledges the identical handoff",async t=>{
  const f=await setup(t),{u}=f;
  assert.equal((await f.prepare()).status,200);
  await f.command("PROFILE_PUBLISH",{profileVersion:1,approvedFields:["alias","avatarId","interests"]});
  await f.command("TRIP_SHARE_CONFIRM");
  let s=(await f.read()).state;
  assert.equal(s.social.candidates[0].name,"루밋");
  const request=outgoing(s,"CONNECT_REQUEST");
  let r=await f.request(u,"/api/journey/command",request);assert.equal(r.status,200);
  r=await f.request(u,"/api/journey/command",request);assert.equal(r.data.receipt.replayed,true);
  assert.equal((await f.command("HANDOFF_PREPARE",{mode:"connected"})).status,409);
  const op=(await f.request(u,"/api/journey/operator")).data.state;
  const target=op.social.pendingResponses.find(x=>x.kind==="connection");
  const response=outgoing(op,"B_RESPONSE",{decision:"accept"},target);delete response.type;
  assert.equal((await f.request(u,"/api/journey/respond",response)).status,200);
  assert.equal((await f.read()).state.social.connection.status,"accepted");
  assert.equal((await f.command("CONFIRM_WINDOW")).status,200);
  assert.equal((await f.command("HANDOFF_PREPARE",{mode:"connected"})).status,200);
  s=(await f.read()).state;
  assert.equal(s.handoff.acknowledged,false);
  assert.equal((await f.request(u,"/api/journey/transfer",{runId:s.runId,handoffId:s.handoff.handoffId})).status,200);
  const native=async(path,body)=>{
    const r=await fetch(f.base()+path,{method:body?"POST":"GET",headers:{"X-Demo-Actor":"car",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json()};
  };
  let car=(await native("/api/state?view=car")).data;
  async function carCommand(type,payload) {
    const result=await native("/api/commands",{schemaVersion:4,actor:"car",...outgoing(car,type,payload,{})});
    assert.equal(result.status,200,JSON.stringify(result.data));car=result.data.state;
  }
  const deviceId=randomUUID(),vehicleSessionId=randomUUID();
  await carCommand("CAR_SESSION_OPEN",{deviceId,vehicleSessionId,navigationSource:"mock",pendingAttempts:[]});
  await carCommand("CAR_STATUS",{vehicleSessionId,statusSeq:1,restrictionKnown:true,restricted:false,foreground:true,uiContext:"handoff"});
  const handoff=(await native("/api/handoff")).data;
  assert.equal(handoff.owner.alias,"파도");assert.equal(handoff.peer.alias,"루밋");
  assert.deepEqual(handoff.owner.summary.interests,[]);
  assert.ok(!JSON.stringify(handoff).includes("password"));
  await carCommand("CAR_LOADED",car.actionBindings.CAR_LOADED.payload);
  assert.equal((await f.read()).state.handoff.acknowledged,true);
  await f.restart();
  const restored=await f.read();
  assert.equal(restored.selected,true);assert.equal(restored.state.handoff.acknowledged,true);
});
test("publication scope, account isolation, cancelled requests and mocha are preserved",async t=>{
  const f=await setup(t),{u}=f;
  const p=f.repo().getUser(u.id);f.repo().profile(u.id,{...p.profile,avatar:"mocha"},p.profileVersion);
  assert.equal((await f.prepare()).status,200);
  assert.equal((await f.read()).state.profile.avatarId,"a-03");
  await f.command("PROFILE_PUBLISH",{profileVersion:1,approvedFields:["alias","avatarId"]});
  await f.command("TRIP_SHARE_CONFIRM");
  const candidate=(await f.read()).state.social.candidates[0];assert.match(candidate.reason,/공통 시간/);assert.ok(!candidate.reason.includes("관심사"));
  const originalRequest=outgoing((await f.read()).state,"CONNECT_REQUEST");
  await f.command("CONNECT_REQUEST");
  const op=(await f.request(u,"/api/journey/operator")).data.state;
  await f.command("CONNECT_CANCEL");
  const body=outgoing(op,"B_RESPONSE",{decision:"accept"},op.social.pendingResponses[0]);delete body.type;
  assert.equal((await f.request(u,"/api/journey/respond",body)).status,409);
  assert.equal((await f.command("CONNECT_REQUEST",originalRequest.payload,{})).status,409);
  const b=await f.register("traveler-b");
  assert.equal((await f.request(b,"/api/journey")).data.state.profile,null);
  assert.equal((await f.command("PROFILE_PRIVATE")).status,200);
  await f.command("HANDOFF_PREPARE",{mode:"my_trip"});
  const s=(await f.read()).state;
  await f.request(u,"/api/journey/transfer",{runId:s.runId,handoffId:s.handoff.handoffId});
  const h=await fetch(f.base()+"/api/handoff",{headers:{"X-Demo-Actor":"car"}}).then(x=>x.json());
  assert.equal(h.peer,null);assert.equal(h.owner.avatarId,"a-03");
});
test("demo response and native gateway stay disabled in the ordinary account service",async t=>{
  const f=await setup(t,{scenarioDemo:false});
  assert.equal((await f.request(f.u,"/api/journey/operator")).status,404);
  const r=await fetch(f.base()+"/api/scenario",{headers:{"X-Demo-Actor":"car"}});assert.equal(r.status,403);
  assert.equal((await f.request(f.u,"/api/journey/command",{...outgoing((await f.read()).state,"B_RESPONSE",{},{} )})).status,403);
});
test("repeated preparation is coalesced and a new filming run requires explicit mobile cleanup",async t=>{
  const f=await setup(t),data=await f.read(),s=data.state;
  const input=prepareBody(data,f.repo().getUser(f.u.id).profileVersion);
  const results=await Promise.all([f.request(f.u,"/api/journey/prepare",input),f.request(f.u,"/api/journey/prepare",input)]);
  assert.ok(results.every(x=>x.status===200));
  let current=(await f.read()).state;
  assert.equal(current.profileVersion,1);assert.equal(current.tripVersion,1);
  const reset=await f.request(f.u,"/api/journey/reset",outgoing(current,"RESET_BEGIN",{},{runId:current.runId}));assert.equal(reset.status,200);
  current=(await f.read()).state;
  assert.ok(current.reset);assert.equal(current.profile.alias,"파도");
  assert.equal((await f.command("RESET_ACK")).status,200);
  current=(await f.read()).state;
  assert.notEqual(current.runId,s.runId);assert.equal(current.profile,null);
  assert.equal((await f.prepare()).status,200);
});
