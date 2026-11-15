import { join } from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { error, UUID, validate } from "./contracts.mjs";
import { fields } from "./vehicle-contracts.mjs";
import { openStore, atomicSave } from "../../mock-app/server/store.mjs";
import { initialState, validateStore } from "../../mock-app/server/v4/state.mjs";
import { coordinator } from "../../mock-app/server/v4/commands.mjs";
import { DEFAULT_TRIP_ID, planBody } from "../shared/travel.mjs";

export function journeyService({ directory, getUser, getTrip, demo = false }) {
  const stores = new Map();
  let selectionQueue = Promise.resolve();
  const scope = (user, tripId = DEFAULT_TRIP_ID) => {
    if (!UUID.test(user) || !UUID.test(tripId)) throw error(404,"NOT_FOUND","여행을 찾을 수 없어요.");
    getTrip(user, tripId); // Every access, including receipts, verifies trip ownership.
    return { user, tripId, key: user + ":" + tripId };
  };
  const split = body => {
    const { tripId = DEFAULT_TRIP_ID, ...rest } = body;
    return { tripId, body: rest };
  };
  async function open(user, tripId = DEFAULT_TRIP_ID) {
    const { key } = scope(user, tripId);
    if (!stores.has(key)) {
      const pending = (async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const name = tripId === DEFAULT_TRIP_ID ? user : user + "--" + tripId;
        const file = join(directory, name + ".json");
        const store = await openStore(file, initialState, validateStore);
        return { api: coordinator(file, store.data), release: store.release };
      })();
      stores.set(key,pending);
      pending.catch(()=>{if(stores.get(key)===pending)stores.delete(key);});
    }
    return (await stores.get(key)).api;
  }
  async function selection() {
    try { return JSON.parse(await readFile(join(directory,"active.json"),"utf8")); }
    catch(e) {if(e.code!=="ENOENT")throw e;return null;}
  }
  async function state(user, tripId = DEFAULT_TRIP_ID) {
    const s = await (await open(user,tripId)).read("web",user), selected = await selection();
    return { state:s,trip:getTrip(user,tripId),tripId,demoEnabled:demo,
      selected: !!selected && selected.user===user && (selected.tripId||DEFAULT_TRIP_ID)===tripId && selected.runId===s.runId };
  }
  async function assertEditable(user,tripId) {
    const s=await(await open(user,tripId)).read("web",user);
    if(s.vehicleActivation || s.social.connection.attempted || s.reset)
      throw error(409,"JOURNEY_LOCKED","연결 중인 여행의 계획은 바꿀 수 없어요. 현재 여정을 정리한 뒤 수정해 주세요.");
  }
  return {
    state,assertEditable,
    async prepare(user,input) {
      const {tripId,body}=split(input);
      fields(body,["expectedVersion","profileVersion","tripVersion","introduction","availability"]);
      const account=getUser(user),saved=getTrip(user,tripId),plan=planBody(saved),a=body.availability;
      if(account.profileVersion!==body.profileVersion || saved.version!==body.tripVersion)
        throw error(409,"VERSION_CONFLICT","여행이나 계정 정보가 바뀌었어요. 최신 내용을 다시 확인해 주세요.");
      const validDate=value=> typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
      const validTime=value=> typeof value==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if(typeof body.introduction!=="string" || !body.introduction.trim() || [...body.introduction.trim()].length>300 ||
        !a || Object.keys(a).sort().join(",")!=="date,end,start" || !validDate(a.date) || !validTime(a.start) || !validTime(a.end) || a.start>=a.end ||
        (plan.startDate&&a.date<plan.startDate)||(plan.endDate&&a.date>plan.endDate))
        throw error(422,"INVALID_INPUT","소개 문장과 여행 안에서 만날 수 있는 날짜·시간을 확인해 주세요.");
      validate("trip",plan);
      const day=plan.days.find(d=>d.date===a.date)||plan.days[0], stops=day.stops;
      const last=stops[stops.length-1], next=stops.find(s=>s.time&&s.time>=a.end);
      const endTime=last.time&&last.time>=a.end?last.time:a.end;
      const trip={date:a.date,nextVisit:next?.time||a.end,nextVisitLabel:next?.title||"다음 개인 일정",
        returnPlaceId:tripId+"-last",returnPlaceLabel:last.title,returnEstimate:endTime,returnDeadline:endTime,
        planId:tripId,sourceVersion:saved.version,plan,peerLabel:"루밋",availability:{start:a.start,end:a.end}};
      // Account data supplies identity. Free introduction is explicitly reviewed, not classified as a questionnaire.
      const profile={alias:account.profile.displayName.normalize("NFC").trim(),avatarId:({dragon:"a-01",bear:"a-02",mocha:"a-03"})[account.profile.avatar],
        introduction:body.introduction.trim(),privateSummary:{interests:[],activityPreference:null,pace:null,conversationStyle:null,
          speakingStyle:null,expressionPresetIds:[],summarySource:"user_confirmed_demo"}};
      await(await open(user,tripId)).importPreparation(user,{expectedVersion:body.expectedVersion,profile,trip});
      return state(user,tripId);
    },
    async command(user,input) {
      const {tripId,body}=split(input);
      fields(body,["commandId","runId","runSeq","expectedVersion","type","target","payload"]);
      if(!["PROFILE_PUBLISH","PROFILE_PRIVATE","TRIP_SHARE_CONFIRM","CONNECT_REQUEST","CONNECT_CANCEL","CONNECT_END","CONFIRM_WINDOW","HANDOFF_PREPARE","CANCEL_PENDING_COMMAND","RESET_ACK"].includes(body.type))
        throw error(403,"ACTION_FORBIDDEN","현재 모바일에서 실행할 수 없는 동작이에요.");
      const api=await open(user,tripId),current=await api.read("web",user);
      if(["PROFILE_PUBLISH","TRIP_SHARE_CONFIRM","CONNECT_REQUEST","HANDOFF_PREPARE"].includes(body.type) && current.trip?.sourceVersion && current.trip.sourceVersion!==getTrip(user,tripId).version)
        throw error(409,"PLAN_CHANGED","저장한 여행이 바뀌었어요. 최신 여행과 소개를 다시 준비해 주세요.");
      const result=await api.command({...body,schemaVersion:4,actor:"web"},"web",user);
      return {...result,trip:getTrip(user,tripId),tripId,demoEnabled:demo};
    },
    async receipt(user,runId,id,tripId=DEFAULT_TRIP_ID) {return(await open(user,tripId)).receipt("web",user,runId,id);},
    async operator(user,tripId=DEFAULT_TRIP_ID) {
      if(!demo)throw error(404,"NOT_FOUND","응답 화면은 열려 있지 않아요.");
      return {state:await(await open(user,tripId)).read("operator",null),trip:getTrip(user,tripId),tripId,demoEnabled:true};
    },
    async respond(user,input) {
      if(!demo)throw error(404,"NOT_FOUND","응답 화면은 열려 있지 않아요.");
      const {tripId,body}=split(input);
      fields(body,["commandId","runId","runSeq","expectedVersion","target","payload"]);
      return(await open(user,tripId)).command({...body,schemaVersion:4,actor:"operator",type:"B_RESPONSE"},"operator",null);
    },
    async operate(user,input) {
      if(!demo)throw error(404,"NOT_FOUND","촬영자 화면은 열려 있지 않아요.");
      const {tripId,body}=split(input);
      fields(body,["commandId","runId","runSeq","expectedVersion","type","target","payload"]);
      if(!["MEETING_START","MEETING_END","REPLAY_FINAL","NAV_MOCK_RESULT"].includes(body.type))
        throw error(403,"ACTION_FORBIDDEN","촬영자 화면에서 실행할 수 없는 동작이에요.");
      return(await open(user,tripId)).command({...body,schemaVersion:4,actor:"operator"},"operator",null);
    },
    async reset(user,input) {
      if(!demo)throw error(404,"NOT_FOUND","촬영 화면에서만 새 회차를 열 수 있어요.");
      const {tripId,body}=split(input);
      fields(body,["commandId","runId","runSeq","expectedVersion","type","target","payload"]);
      if(body.type!=="RESET_BEGIN")throw error(403,"ACTION_FORBIDDEN","회차 정리만 요청할 수 있어요.");
      return(await open(user,tripId)).command({...body,schemaVersion:4,actor:"operator"},"operator",null);
    },
    async transfer(user,input) {
      const {tripId,body}=split(input);fields(body,["runId","handoffId"]);
      const task=selectionQueue.then(async()=>{
        const s=await(await open(user,tripId)).read("web",user);
        if(s.runId!==body.runId||s.handoff?.handoffId!==body.handoffId||!s.handoff)
          throw error(409,"STALE_STATE","차량으로 보낼 최신 여정을 다시 확인해 주세요.");
        if(!demo)throw error(409,"DEMO_NOT_ENABLED","Pleos 연결을 활성화한 서버에서 이어가 주세요.");
        const selected=await selection();
        if(selected&&(selected.user!==user||(selected.tripId||DEFAULT_TRIP_ID)!==tripId)) {
          const old=await(await open(selected.user,selected.tripId||DEFAULT_TRIP_ID)).read("web",selected.user);
          if(old.reset||old.runId===selected.runId||!old.completedRunIds.includes(selected.runId))
            throw error(409,"DEMO_IN_USE","차량에 준비한 다른 여행을 먼저 정리해 주세요.");
        }
        await atomicSave(join(directory,"active.json"),{user,tripId,runId:s.runId});
        return state(user,tripId);
      });selectionQueue=task.catch(()=>{});return task;
    },
    async native() {
      if(!demo)return null;
      const selected=await selection();
      if(!selected)throw error(409,"JOURNEY_NOT_SELECTED","모바일에서 여행을 준비하고 Pleos로 보내 주세요.");
      const api=await open(selected.user,selected.tripId||DEFAULT_TRIP_ID),s=await api.read("car",null);
      if(s.runId!==selected.runId)throw error(409,"RUN_CHANGED","모바일에서 새 여정을 다시 보내 주세요.");
      return api;
    },
    async close() {await selectionQueue;for(const entry of stores.values()){const{api,release}=await entry;await api.close();await release();}},
  };
}
