let state = null,
  busy = false,
  pending = JSON.parse(
    localStorage.getItem("waymate.operator.pending.v4") || "null",
  ),
  last = "",
  offline = false;
const status = (t) => (document.getElementById("status").textContent = t);
async function request(path, body) {
  const r = await fetch(path, {
    headers: {
      "X-Demo-Actor": "operator",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json();
  if (!r.ok) {
    if (body && r.status <= 500) {
      pending = null;
      localStorage.removeItem("waymate.operator.pending.v4");
    }
    throw new Error(j.error?.message || "서버 오류");
  }
  return j;
}
function clear() {
  pending = null;
  localStorage.removeItem("waymate.operator.pending.v4");
}
async function poll() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    if (pending) {
      const r = await request(
        `/api/commands/${pending.commandId}?runId=${pending.runId}`,
      );
      if (r.status === "applied") clear();
      else {
        status(
          "이전 응답 결과 미확인 · 같은 요청 다시 전송으로 확인해 주세요.",
        );
      }
    }
    state = await request("/api/state?view=operator");
    if (state.schemaVersion !== 4) throw new Error("v4 서버가 필요해요.");
    if (offline && !pending) status("서버에 다시 연결됐어요.");
    offline = false;
    render();
  } catch (e) {
    offline = true;
    status(e.message);
  } finally {
    busy = false;
  }
}
function el(t, v) {
  const e = document.createElement(t);
  if (v) e.textContent = v;
  return e;
}
function render() {
  const key = JSON.stringify([state.social, pending]);
  if (key === last) return;
  last = key;
  const root = document.getElementById("requests");
  root.replaceChildren();
  for (const t of state.social.pendingResponses) {
    const card = el("section");
    card.className = "card";
    card.append(
      el(
        "h2",
        t.kind === "connection" ? "B 대화 연결 응답" : "B 만남 제안 응답",
      ),
    );
    card.append(
      el(
        "p",
        t.kind === "meeting"
          ? "바다쉼표 카페 · 14:15~14:35 · 현재 제안에만 응답"
          : "모바일 연결 요청 · 차량 접속 없이 응답 가능",
      ),
    );
    for (const decision of t.kind === "meeting" &&
    state.social.meeting.status === "confirmed"
      ? ["cancel"]
      : ["accept", "reject"]) {
      const b = el(
        "button",
        { accept: "B 수락", reject: "B 거절", cancel: "B 만남 취소" }[decision],
      );
      b.disabled = !!pending;
      b.onclick = () => send(t, decision);
      card.append(b);
    }
    root.append(card);
  }
  if (!state.social.pendingResponses.length)
    root.append(el("p", "현재 응답을 기다리는 요청이 없어요."));
  if (pending) {
    const b = el("button", "같은 요청 다시 전송");
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      try {
        await request("/api/commands", pending);
        clear();
        status("응답 저장을 확인했어요.");
      } catch (e) {
        status(e.message);
      } finally {
        busy = false;
        poll();
      }
    };
    root.append(b);
  }
}
async function send(target, decision) {
  if (busy || pending) return;
  busy = true;
  try {
    const s = await request("/api/state?view=operator");
    pending = {
      schemaVersion: 4,
      runId: s.runId,
      runSeq: s.runSeq,
      expectedVersion: s.version,
      commandId: crypto.randomUUID(),
      actor: "operator",
      type: "B_RESPONSE",
      target,
      payload: { decision },
    };
    localStorage.setItem(
      "waymate.operator.pending.v4",
      JSON.stringify(pending),
    );
    await request("/api/commands", pending);
    clear();
    status("B 응답을 저장했어요.");
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
    poll();
  }
}
await poll();
setInterval(poll, 500);
