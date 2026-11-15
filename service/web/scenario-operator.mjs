import { scenarioControls, scenarioOperation } from "./journey-operator.mjs";
const trip = document.getElementById("trip"), notice = document.getElementById("notice"), status = document.getElementById("state"), controls = document.getElementById("controls");
let csrf, state, busy = false, generation = 0, renderKey;
async function request(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "최신 상태를 다시 확인해 주세요."); return data;
}
async function refresh() {
  if (busy || !trip.value) return;
  const revision = generation, tripId = trip.value;
  const data = await request(`/api/journey/operator?tripId=${tripId}`);
  if (revision !== generation || trip.value !== tripId) return;
  state = data.state;
  status.textContent = `연결: ${state.social.connection.status} · 만남: ${state.social.meeting.status} · 결말: ${state.journey?.phase || "준비"} · ${state.vehicleActivation ? "차량 수신 완료" : "차량 수신 전"}`;
  const nextKey = JSON.stringify([state.runId, state.actionBindings, state.social.pendingResponses, state.mockNavigation, state.reset]);
  if (nextKey === renderKey) return;
  renderKey = nextKey;
  controls.innerHTML = scenarioControls(state);
  for (const pending of state.social.pendingResponses) {
    const section = document.createElement("section"); section.className = "journey-card";
    const title = document.createElement("h2"); title.textContent = ({ connection: "연결 요청", call: "통화 제안", meeting: "만남 제안", message: "메시지" })[pending.kind] || pending.kind; section.append(title);
    for (const decision of pending.kind === "message" ? ["reply"] : ["accept", "reject"]) {
      const button = document.createElement("button"); button.className = "outline-button journey-button";
      button.textContent = ({ reply: "준비된 답장 보내기", accept: "상대 수락", reject: "상대 거절" })[decision];
      button.onclick = () => send({ commandType: "B_RESPONSE", target: pending, payload: { decision } }); section.append(button);
    }
    controls.prepend(section);
  }
  if (!controls.children.length) controls.textContent = state.reset ? "차량 정리 화면에서 경유지 제거와 정리 확인을 마쳐 주세요." : "모바일 또는 Pleos의 다음 동작을 기다리고 있어요.";
}
async function send(binding) {
  if (busy || !binding) return;
  busy = true; notice.textContent = "선택한 동작을 적용하고 있어요.";
  controls.querySelectorAll("button").forEach(button => button.disabled = true);
  const snapshot = state;
  const body = { tripId: trip.value, commandId: crypto.randomUUID(), runId: snapshot.runId, runSeq: snapshot.runSeq,
    expectedVersion: snapshot.version, type: binding.commandType, target: binding.target, payload: binding.payload };
  const response = body.type === "B_RESPONSE"; if (response) delete body.type;
  try { await request(response ? "/api/journey/respond" : "/api/journey/operate", body); notice.textContent = "적용했어요."; }
  catch (e) { notice.textContent = e.message + " 최신 상태를 확인한 뒤 다시 선택해 주세요."; }
  finally { busy = false; renderKey = null; await refresh().catch(e => notice.textContent = e.message); }
}
controls.addEventListener("click", event => {
  const button = event.target.closest('[data-action="journey-operate"]');
  if (button) send(scenarioOperation(state, button.dataset));
});
trip.onchange = () => { generation++; state = null; renderKey = null; controls.replaceChildren(); refresh().catch(e => notice.textContent = e.message); };
try {
  const session = await request("/api/session");
  if (!session.user) throw new Error("먼저 모바일 여행 화면에서 로그인해 주세요.");
  csrf = session.csrf;
  const trips = await request("/api/trips"), seen = new Set();
  for (const plan of [...trips.trips, trips.registeredTrip].filter(Boolean)) {
    if (seen.has(plan.id)) continue; seen.add(plan.id);
    const option = document.createElement("option"); option.value = plan.id; option.textContent = plan.title; trip.append(option);
  }
  const selected = new URLSearchParams(location.search).get("tripId"); if (seen.has(selected)) trip.value = selected;
  await refresh();
  setInterval(() => { if (!document.hidden) refresh().catch(e => notice.textContent = e.message); }, 1500);
} catch (e) { notice.textContent = e.message; }
