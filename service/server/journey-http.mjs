import { error, UUID } from "./contracts.mjs";
import { speechHttp } from "../../shared/server/speech-http.mjs";

export async function journeyNativeRoute({ req, res, path, method, journeys, dialogue, demo, send, jsonBody, speech }) {
  if (req.headers["x-demo-actor"] !== "car") return false;
  if (!demo || req.headers.origin || req.headers.cookie || req.headers["sec-fetch-site"])
    throw error(403, "DEVICE_ONLY", "Pleos 시연 앱에서 연결해 주세요.");
  if (method === "GET" && path === "/api/scenario") {
    send(200, { schemaVersion: 4, scope: "mobile-meeting-v4", questions: {}, tripPresetIds: [],
      capabilities: { myTrip: true, meeting: true, messages: true, callSample: true, mockNavigation: true,
        registeredRecovery: false, drivingVoice: false, drivingLimited: true, mcSample: false, reviewSample: false,
        reasonInput: false, connected: true, navigation: true, driverWaypoint: true, operator: true,
        safeReset: true, agentContent: true, finalChoices: true, aiConsultation: false, vehicleDialogue: true } });
    return true;
  }
  const api = await journeys.native();
  if (method === "GET" && path === "/api/state") send(200, await api.read("car", null));
  else if (method === "POST" && path === "/api/agent/dialogue") send(200, await dialogue.prepare(await jsonBody(req)));
  else if (method === "GET" && path === "/api/handoff") send(200, await api.handoff());
  else if (method === "POST" && path === "/api/commands") send(200, await api.command(await jsonBody(req), "car", null));
  else if (method === "GET" && /^\/api\/commands\/[\da-f-]+$/i.test(path)) {
    const url = new URL(req.url, "http://localhost"), id = path.split("/").pop();
    if (!UUID.test(id)) throw error(422, "INVALID_INPUT", "요청 번호를 확인해 주세요.");
    send(200, await api.receipt("car", null, url.searchParams.get("runId"), id));
  } else if ((method === "POST" && path === "/api/tts") || (method === "GET" && path === "/api/tts/config")) {
    const context = await api.speechContext();
    await speechHttp({ req, res, speech, principal: "journey:" + context.runId, jsonBody,
      async assertAccess() { if ((await api.speechContext()).runId !== context.runId) throw error(409, "RUN_CHANGED", "새 여정을 확인해 주세요."); } });
  } else throw error(404, "NOT_FOUND", "지원하지 않는 차량 요청이에요.");
  return true;
}
