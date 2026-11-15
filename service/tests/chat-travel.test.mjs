import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { vehicleFixture } from "./helpers/vehicle-fixture.mjs";
import { planBody } from "../shared/travel.mjs";

const PLAN={title:"제주에서 천천히 보내는 하루",destination:"제주",startDate:"2026-12-20",endDate:"2026-12-20",summary:"바닷길 산책과 조용한 카페",days:[{dayNumber:1,date:"2026-12-20",stops:[
  {time:"09:00",title:"함덕해변",description:"바다 보며 산책하기",category:"walk",placeQuery:"제주 함덕해변"},
  {time:"10:30",title:"조용한 카페",description:"따뜻한 차 한 잔",category:"cafe",placeQuery:"제주 함덕 카페"},
  {time:"12:00",title:"점심 식사",description:"동네에서 점심 먹기",category:"food",placeQuery:"제주 함덕 식당"},
]}],notes:[]};
const agent={name:"test-provider",async run({execute,messages}){
  let plan=structuredClone(PLAN);
  if(messages.at(-1).text.includes("수정")) {
    const latest=await execute("get_latest_trip_draft",{});assert.ok(latest);
    plan=structuredClone(latest.body);plan.days[0].stops[1].description="책 읽으며 조금 더 쉬어가기";
  }
  await execute("propose_trip",plan);return {reply:"원하는 여행을 계획 카드로 정리했어. 확인하고 저장해 줘."};
}};
async function turn(f,u,chatId,message) {
  const chat=(await f.request(u,"/api/chats/"+chatId)).data.chat;
  const result=await f.request(u,`/api/chats/${chatId}/messages`,{requestId:randomUUID(),message,expectedVersion:chat.version});assert.equal(result.status,202);
  for(let i=0;i<100;i++) {
    const current=(await f.request(u,"/api/chats/"+chatId)).data.chat;
    const last=current.turns.at(-1);if(last.status!=="pending"){assert.equal(last.status,"completed");return last.drafts.at(-1);}
    await new Promise(r=>setTimeout(r,10));
  }
  throw new Error("test turn did not finish");
}
const envelope=(s,type,payload,target)=>({commandId:randomUUID(),runId:s.runId,runSeq:s.runSeq,expectedVersion:s.version,type,payload:payload??s.actionBindings[type]?.payload??{},target:target??s.actionBindings[type]?.target??{}});

test("chat edits persist, agent reads the edited draft, and the saved itinerary reaches the correct Pleos handoff",async t=>{
  const f=await vehicleFixture(t,{agent,scenarioDemo:true}),u=await f.register("jeju-traveler");
  await f.request(u,"/api/consent",{accepted:true});
  const chat=(await f.request(u,"/api/chats",{})).data.chat;
  const draft=await turn(f,u,chat.id,"제주 여행을 만들어줘");
  const edited=structuredClone(draft.body);edited.days[0].stops[1].title="함덕에서 고른 북카페";edited.days[0].stops[1].time="10:00";
  let result=await f.request(u,"/api/drafts/"+draft.id,{version:draft.version,plan:edited},"PUT");assert.equal(result.status,200);
  assert.equal((await f.request(u,"/api/drafts/"+draft.id,{version:draft.version,plan:edited},"PUT")).status,409);
  const other=await f.register("other-traveler");assert.equal((await f.request(other,"/api/drafts/"+draft.id,{version:result.data.draft.version,plan:edited},"PUT")).status,404);
  const revised=await turn(f,u,chat.id,"카페에서 조금 더 쉬도록 수정해줘");
  assert.equal(revised.body.days[0].stops[1].title,"함덕에서 고른 북카페");
  assert.equal(revised.body.days[0].stops[1].time,"10:00");
  const saved=await f.request(u,`/api/drafts/${revised.id}/confirm`,{version:revised.version});assert.equal(saved.status,200);
  const id=saved.data.result.id;
  assert.equal(saved.data.trips.length,1);
  assert.deepEqual(planBody((await f.request(u,"/api/trips/"+id)).data.trip),revised.body);
  const read=async()=> (await f.request(u,"/api/journey?tripId="+id)).data;
  let data=await read();const intro="천천히 걸으며 풍경을 보고 싶어요. 카페에서는 책 이야기도 나눠요.";
  result=await f.request(u,"/api/journey/prepare",{tripId:id,expectedVersion:data.state.version,profileVersion:f.repo().getUser(u.id).profileVersion,tripVersion:data.trip.version,introduction:intro,availability:{date:"2026-12-20",start:"09:00",end:"11:00"}});assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.state.profile.alias,"jeju-traveler");assert.equal(result.data.state.profile.introduction,intro);
  const command=async(type,payload,target)=>f.request(u,"/api/journey/command",{tripId:id,...envelope((await read()).state,type,payload,target)});
  await command("PROFILE_PUBLISH",{profileVersion:1,approvedFields:["alias","avatarId","introduction"]});await command("TRIP_SHARE_CONFIRM");
  data=await read();assert.equal(data.state.social.candidates[0].name,"루밋");assert.match(data.state.social.candidates[0].reason,/제주/);
  await command("CONNECT_REQUEST");
  const op=(await f.request(u,"/api/journey/operator?tripId="+id)).data.state;
  const response=envelope(op,"B_RESPONSE",{decision:"accept"},op.social.pendingResponses[0]);delete response.type;
  assert.equal((await f.request(u,"/api/journey/respond",{tripId:id,...response})).status,200);
  await command("CONFIRM_WINDOW");await command("HANDOFF_PREPARE",{mode:"connected"});
  data=await read();assert.deepEqual(data.state.social.connection.sharedWindow,["10:00","11:00"]);
  assert.equal((await f.request(u,"/api/journey/transfer",{tripId:id,runId:data.state.runId,handoffId:data.state.handoff.handoffId})).status,200);
  const native=await fetch(f.base()+"/api/handoff",{headers:{"X-Demo-Actor":"car"}}).then(r=>r.json());
  assert.equal(native.ownerTrip.planId,id);assert.deepEqual(native.ownerTrip.plan,revised.body);assert.equal(native.peer.alias,"루밋");assert.equal(native.owner.introduction,intro);
  assert.equal((await f.request(u,"/api/trips/"+id,{version:data.trip.version,plan:revised.body},"PUT")).status,409);
  assert.equal((await f.request(other,"/api/journey?tripId="+id)).status,404);
  const defaultRun=(await f.request(u,"/api/journey")).data.state;
  assert.equal(defaultRun.profile,null);assert.notEqual(defaultRun.runId,data.state.runId);
});

test("agent revisions of a saved itinerary update the same travel record and detect competing edits",async t=>{
  const f=await vehicleFixture(t,{agent,scenarioDemo:true}),u=await f.register("revision-owner");await f.request(u,"/api/consent",{accepted:true});
  const first=(await f.request(u,"/api/chats",{})).data.chat,d=await turn(f,u,first.id,"여행 초안 부탁해");
  const id=(await f.request(u,`/api/drafts/${d.id}/confirm`,{version:d.version})).data.result.id;
  const ctx=(await f.request(u,"/api/chats",{tripId:id})).data.chat;assert.equal(ctx.planningTrip.id,id);
  const revision=await turn(f,u,ctx.id,"휴식 시간을 수정해줘");
  const result=await f.request(u,`/api/drafts/${revision.id}/confirm`,{version:revision.version});assert.equal(result.status,200);assert.equal(result.data.result.id,id);assert.equal(result.data.trips.length,1);
  assert.match(result.data.trips[0].days[0].stops[1].description,/책/);
  const competing=await turn(f,u,ctx.id,"장소를 다시 수정해줘");
  const original=f.repo().trip(u.id,id),edit=planBody(original);edit.title="직접 바꾼 여행 이름";
  assert.equal((await f.request(u,"/api/trips/"+id,{version:original.version,plan:edit},"PUT")).status,200);
  assert.equal((await f.request(u,`/api/drafts/${competing.id}/confirm`,{version:competing.version})).status,409);
});
