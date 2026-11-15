import { randomUUID } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../server/store.mjs";
import { initialState, validateStore } from "../server/v4/state.mjs";
import { coordinator } from "../server/v4/commands.mjs";
import { emptySummary } from "../shared/config/protocol-v4.mjs";
import { dialogueContext, vehicleDialogueFromEnvironment, vehicleDialogueService } from "../server/ai/vehicle-dialogue.mjs";

// Isolated, explicitly fictional rehearsal data. Never resets the user's current state.
export async function prepareGangneungDemo(file) {
  try { await access(file); return { created: false }; } catch (e) { if(e.code !== "ENOENT") throw e; }
  const store = await openStore(file, initialState, validateStore);
  const api = coordinator(file, store.data); const client = randomUUID();
  try {
    const send = async (type, payload = {}, actor = "web", target = {}) => {
      const s = await api.read(actor, client);
      return api.command({schemaVersion:4,runSeq:s.runSeq,runId:s.runId,commandId:randomUUID(),expectedVersion:s.version,actor,type,target,payload},actor,actor==="web"?client:null);
    };
    for (const [questionId, answerText] of Object.entries({interests:"바닷가 산책과 조용한 카페가 좋아요.",activity:"마음에 드는 풍경에서는 조금 더 머물고 싶어요.",conversation:"처음 만나는 사람과 남은 일정에 부담 없이 잠깐 여행 이야기를 나누고 싶어요.",expression:"편안하고 자연스럽게 소개해 주세요."}))
      await send("ONBOARDING_ANSWER",{questionId,answerText,inputSource:"typed"});
    await send("PROFILE_CONFIRM",{alias:"파도",avatarId:"a-01",confirmedSummary:{...emptySummary(),interests:["sea_walk","cafe"],pace:"relaxed"}});
    await send("TRIP_SAVE",{presetId:"gangneung-01",shareSummaryApproved:false});
    const act = async (name) => { const b=(await api.read("web",client)).actionBindings[name]; return send(b.commandType,b.payload,"web",b.target); };
    await act("PROFILE_PUBLISH"); await act("TRIP_SHARE_CONFIRM"); await act("CONNECT_REQUEST");
    const target=(await api.read("operator",null)).social.pendingResponses.find((r)=>r.kind==="connection");
    await send("B_RESPONSE",{decision:"accept"},"operator",target); await act("CONFIRM_WINDOW");
    await send("HANDOFF_PREPARE",{mode:"connected"});
    return {created:true};
  } finally { await api.close(); await store.release(); }
}

async function main() {
  const file = resolve(process.env.WAYMATE_DEMO_STATE_FILE || "runtime/gangneung-20261214.json");
  const prepared = await prepareGangneungDemo(file);
  const snapshot = JSON.parse(await readFile(file,"utf8"));
  // Prewarm copy only. No vehicle activation, heartbeat, call, meeting or navigation command.
  const context = dialogueContext(snapshot, 0, {preparing:true});
  let packet = null;
  if (process.argv.includes("--generate-once")) {
    const provider=vehicleDialogueFromEnvironment();
    if(!provider) throw new Error("차량 대화 OpenAI 설정이 필요합니다.");
    const service=await vehicleDialogueService({dialogueContext:async()=>context},provider,{file:file+".dialogue.json",maxCalls:2});
    try { packet=await service.prepare({scope:context.scope}); }
    finally { await service.close(); }
    if(packet.source!=="openai") throw new Error("대사 생성은 완료되지 않았습니다. 비용 보호를 위해 같은 정보로 자동 재시도하지 않습니다.");
  }
  console.log(JSON.stringify({file,created:prepared.created,scope:context.scope,contextKey:context.key,source:packet?.source||"not-generated",replayed:packet?.replayed??false,lines:packet?.lines},null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error("시연 준비에 실패했습니다. 상태 파일과 서버 OpenAI 설정을 확인해 주세요. 기존 상태는 초기화하지 않았습니다.");process.exitCode=1;});
