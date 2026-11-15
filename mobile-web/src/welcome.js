import { ServiceClient, CHARACTERS, character } from "./client.mjs";

const api = new ServiceClient();
const $ = (id) => document.getElementById(id);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let state, selected = null, busy = false, stream = null, partial = "", phase = "", reviewVisible = false, noticeTimer;
const name = () => character(state?.user.profile.avatar).name;
const art = () => character(state?.user.profile.avatar).image;
const together = () => character(state?.user.profile.avatar).together;
const subject = () => character(state?.user.profile.avatar).subject;
const pending = () => state?.chat?.turns.find((t) => t.status === "pending");
const draftKey = () => `waymate.welcome.draft.${state.user.id}.${state.onboarding.chatId}`;
const savedInput = () => { try { return localStorage.getItem(draftKey()) || ""; } catch { return ""; } };
const rememberInput = () => { if (state?.onboarding?.chatId) try { localStorage.setItem(draftKey(), $("welcome-message").value); } catch {} };
const status = () => pending() ? phase || `${subject()} 이야기를 듣고 있어요` : state?.draft ? "네 이야기를 정리했어요" : "천천히 알아가고 있어요";

function notify(message) {
  $("welcome-notice").textContent = message;
  $("welcome-notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $("welcome-notice").hidden = true; }, 5000);
}

function stepNumber() {
  return state.onboarding.phase === "character" ? 1 : reviewVisible || state.onboarding.phase === "completed" ? 3 : 2;
}
function characterScene(size = "", speaking = false) {
  return `<div class="friend-scene ${size} ${speaking ? "is-thinking" : ""}"><span class="scene-orbit orbit-one"></span><span class="scene-orbit orbit-two"></span><img src="${art()}" alt="내 여행 친구 ${name()}"></div>`;
}
function characterView() {
  const introduction = character(selected).introduction;
  return `<section class="character-page"><p class="welcome-eyebrow">A FRIEND FOR YOUR JOURNEY</p><h1>어떤 친구와<br>함께 떠나볼까요?</h1><p class="welcome-description">취향을 알아가고, 여행을 같이 준비할 친구예요.<br>언제든 마이에서 다시 고를 수 있어요.</p><div class="character-options" role="radiogroup" aria-label="함께할 캐릭터">${CHARACTERS.map(({id, name:label, line, description, image}) => `<button class="character-option ${selected === id ? "selected" : ""}" role="radio" aria-checked="${selected === id}" data-action="choose" data-avatar="${id}" tabindex="${selected ? (selected === id ? 0 : -1) : (id === "dragon" ? 0 : -1)}"><span class="choice-check" aria-hidden="true">${selected === id ? "✓" : ""}</span><span class="choice-scene ${id}"><img src="${image}" alt=""></span><span class="character-name">${label}</span><span class="character-line">${line}</span><span class="sr-only">${description}</span></button>`).join("")}</div><p class="friend-hello" aria-live="polite">${selected ? `“안녕, 나는 ${introduction}. 우리 천천히 친해져 볼까?”` : "마음이 가는 친구를 골라 주세요."}</p><button class="welcome-primary character-continue" data-action="start" ${!selected || busy ? "disabled" : ""}>${busy ? "친구를 만나고 있어요…" : selected ? `${character(selected).together} 시작하기 <span aria-hidden="true">→</span>` : "함께할 친구 선택하기"}</button><p class="welcome-footnote">캐릭터가 달라도 나눈 이야기와 여행은 그대로예요.</p></section>`;
}
function turnView(turn) {
  const failed = ["failed", "cancelled"].includes(turn.status);
  return `<article class="welcome-turn"><div class="welcome-user-message">${escape(turn.message)}</div><div class="welcome-assistant"><div class="speaker-label"><img src="${art()}" alt=""><span>${name()}</span></div><div class="assistant-text" ${turn.status === "pending" ? 'id="live-reply"' : ""}>${escape(turn.status === "pending" ? partial : turn.reply)}</div>${turn.status === "pending" ? `<div class="agent-activity" role="status"><span class="activity-dots" aria-hidden="true"><i></i><i></i><i></i></span><span id="live-phase">${escape(status())}</span></div>` : ""}${failed ? `<div class="turn-failure"><p>${turn.status === "cancelled" ? "여기서 잠깐 멈췄어요." : "답변을 끝까지 듣지 못했어요. 네 이야기는 남아 있어요."}</p>${turn === state.chat.turns.at(-1) ? `<button data-action="retry" data-id="${turn.id}" data-attempt="${turn.attempt}" class="welcome-text-button">다시 이야기해 줘</button>` : ""}</div>` : ""}</div></article>`;
}
function surveyView() {
  const turns = state.chat?.turns || [];
  const consent = state.user.aiConsent;
  return `<section class="survey-page"><div class="survey-friend ${turns.length ? "compact" : ""}">${characterScene("", !!pending())}<div><p class="friend-state"><span class="state-dot"></span>${escape(status())}</p>${!turns.length ? `<h1>여행 얘기 전에,<br>너부터 알고 싶어.</h1><p class="welcome-description">나는 ${character(state?.user.profile.avatar).introduction}. 정답은 없으니까,<br>네가 좋아하는 것부터 편하게 들려줘.</p>` : `<h1>${state.user.profile.displayName ? escape(state.user.profile.displayName) + "님을" : "너를"} 알아가는 중</h1><p class="welcome-description">작은 이야기들이 모여, 나다운 여행이 돼요.</p>`}</div></div><div class="conversation"><div class="first-question"><span class="question-kicker">${name()}의 첫 번째 궁금함</span><p>쉬는 날, 나도 모르게<br>하게 되는 일이 있어?</p><span>거창하지 않아도 좋아. 아주 작은 것도.</span></div>${!consent ? `<section class="welcome-consent"><label><input id="welcome-ai-consent" type="checkbox">대화와 저장한 취향·여행 정보를 OpenAI에 전달해 친구의 답변을 받는 데 동의해요.</label><p>이야기한 내용은 마지막에 함께 확인하고, 내가 고른 취향만 기억해요.</p><button class="welcome-primary" data-action="consent" disabled>동의하고 이야기 시작하기</button></section>` : ""}${turns.map(turnView).join("")}${api.pending(state.chat.id) ? `<div class="turn-failure"><p>이야기가 잘 전달됐는지 확인이 필요해요.</p><button class="welcome-text-button" data-action="resolve">전송 결과 확인</button></div>` : ""}${state.draft && !pending() ? `<div class="summary-ready"><span class="summary-spark" aria-hidden="true">✦</span><div><strong>내가 이해한 너를 정리해 봤어.</strong><p>기억하기 전에, 함께 확인해 줄래?</p></div><button class="welcome-primary" data-action="review">요약 확인하기 <span aria-hidden="true">→</span></button></div>` : !pending() && state.onboarding.answerCount >= 4 ? `<button class="welcome-text-button summary-request" data-action="summary-prompt">지금까지 이야기로 정리하고 싶어</button>` : ""}</div></section>`;
}
function reviewView() {
  const body = state.draft.body;
  return `<section class="review-page"><div class="review-hero">${characterScene("small")}<p class="welcome-eyebrow">A LITTLE MORE LIKE YOU</p><h1>내가 이해한 너,<br>함께 확인해 줄래?</h1><p class="welcome-description">네가 들려준 이야기로만 정리했어.<br>마음에 드는 내용으로 고쳐도 괜찮아.</p></div><form id="welcome-review-form"><div class="review-card"><div class="review-card-label"><span aria-hidden="true">✦</span> ${subject()} 알아간 ${escape(state.user.profile.displayName)}님</div><section class="review-section"><h2>좋아하는 것</h2><div class="review-interests">${body.interests.length ? body.interests.map((x) => `<span>${escape(x)}</span>`).join("") : '<p class="muted">아직 이야기하지 않은 건 비워뒀어요.</p>'}</div></section><section class="review-section"><h2>편안한 여행의 속도</h2><p>${escape(body.travelStyle || "다음 이야기에서 천천히 알아가요.")}</p></section><section class="review-section"><h2>친구가 기억하면 좋을 이야기</h2><p>${escape(body.about || "다음 이야기에서 천천히 알아가요.")}</p></section><details class="review-edit"><summary>내 말로 다듬기 <span aria-hidden="true">✎</span></summary><label for="review-interests">좋아하는 것 · 쉼표로 구분</label><input id="review-interests" name="interests" value="${escape(body.interests.join(", "))}" maxlength="490"><label for="review-style">편한 여행 방식</label><textarea id="review-style" name="travelStyle" maxlength="300" rows="3">${escape(body.travelStyle)}</textarea><label for="review-about">친구에게 남길 이야기</label><textarea id="review-about" name="about" maxlength="500" rows="3">${escape(body.about)}</textarea></details></div><p class="review-privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>나와 내 친구를 위한 기억이에요.<br>다른 여행자에게 공개되지 않아요.</p><button class="welcome-primary review-save" type="submit" ${busy ? "disabled" : ""}>${busy ? "기억하고 있어요…" : "이렇게 기억해 줘 <span aria-hidden='true'>✓</span>"}</button><button class="welcome-secondary" type="button" data-action="more" ${busy ? "disabled" : ""}>조금 더 이야기하기</button></form></section>`;
}
function completeView() {
  return `<section class="complete-page">${characterScene("complete")}<span class="complete-mark" aria-hidden="true">✓</span><p class="welcome-eyebrow">OUR JOURNEY STARTS HERE</p><h1>이제 조금 더,<br>너다운 여행을 해볼까?</h1><p class="welcome-description">좋아하는 것과 편안한 속도, 잘 기억해 뒀어.<br>앞으로의 여행도 ${subject()} 함께할게.</p><a href="/#home" class="welcome-primary">나의 여행 시작하기 <span aria-hidden="true">→</span></a><a href="/#chat/${state.chat.id}" class="welcome-secondary">${together()} 이야기 이어가기</a></section>`;
}
function render() {
  const step = stepNumber();
  $("steps").innerHTML = ["친구 선택", "나를 알아가기", "함께 확인"].map((label, index) => `<span class="welcome-step ${step === index + 1 ? "current" : step > index + 1 ? "done" : ""}" ${step === index + 1 ? 'aria-current="step"' : ""}><i>${step > index + 1 ? "✓" : index + 1}</i>${label}</span>`).join("");
  $("step-label").textContent = `${step} / 3`;
  $("welcome-main").innerHTML = state.onboarding.phase === "character" ? characterView() : state.onboarding.phase === "completed" ? completeView() : reviewVisible && state.draft ? reviewView() : surveyView();
  const showComposer = step === 2 && state.user.aiConsent && state.onboarding.phase !== "completed";
  $("welcome-composer").hidden = !showComposer;
  document.body.classList.toggle("has-composer", showComposer);
  $("suggestions").innerHTML = showComposer && !state.chat.turns.length ? ["산책하다 카페 가는 게 좋아", "새로운 맛집을 찾아다녀", "집에서 푹 쉬는 편이야"].map((text) => `<button type="button" data-action="suggest" data-text="${escape(text)}">${text}</button>`).join("") : "";
  updateInput();
}
function updateInput() {
  const running = !!pending();
  $("welcome-message").disabled = !state?.user.aiConsent;
  $("welcome-send").disabled = !state?.user.aiConsent || busy || running || !$("welcome-message").value.trim() || !!(state?.chat && api.pending(state.chat.id));
  $("welcome-send").hidden = running;
  $("welcome-stop").hidden = !running;
  $("welcome-message").style.height = "auto";
  $("welcome-message").style.height = Math.min($("welcome-message").scrollHeight, 140) + "px";
}
function chooseAvatar(avatar) {
  selected = avatar;
  for (const button of document.querySelectorAll('[data-action="choose"]')) {
    const active = button.dataset.avatar === avatar;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
    button.querySelector(".choice-check").textContent = active ? "✓" : "";
  }
  const friendName = character(avatar).name;
  document.querySelector(".friend-hello").textContent = `“안녕, 나는 ${character(avatar).introduction}. 우리 천천히 친해져 볼까?”`;
  const start = document.querySelector('[data-action="start"]');
  start.disabled = false;
  start.innerHTML = `${character(avatar).together} 시작하기 <span aria-hidden="true">→</span>`;
  document.querySelector(`[data-avatar="${avatar}"]`).focus();
}
async function sync() {
  state = await api.request("/api/onboarding");
  if (!state.onboarding) { location.replace("/#home"); return false; }
  return true;
}
function bottom() { requestAnimationFrame(() => window.scrollTo({top:document.documentElement.scrollHeight, behavior:"smooth"})); }
function connect(turnId) {
  stream?.close();
  const connection = stream = new EventSource(`/api/turns/${turnId}/events`);
  const active = () => stream === connection;
  function update() {
    if (!active()) return;
    if ($("live-reply")) $("live-reply").textContent = partial;
    if ($("live-phase")) $("live-phase").textContent = phase || `${subject()} 이야기를 듣고 있어요`;
  }
  connection.addEventListener("snapshot", (event) => { if (!active()) return; const data = JSON.parse(event.data); partial = data.text; phase = data.label; update(); });
  connection.addEventListener("delta", (event) => { if (!active()) return; partial += JSON.parse(event.data).text; update(); });
  connection.addEventListener("phase", (event) => { if (!active()) return; phase = JSON.parse(event.data).label; update(); });
  connection.addEventListener("done", async () => {
    if (!active()) return;
    connection.close(); stream = null; partial = ""; phase = "";
    try { if (await sync()) { render(); bottom(); } } catch (error) { notify(error.message); }
  });
  connection.onerror = () => { if (active()) { phase = "연결을 다시 확인하고 있어요"; update(); } };
}
async function refreshChat() {
  if (!await sync()) return;
  render();
  const turn = pending();
  if (turn) connect(turn.id);
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled || busy) return;
  const action = button.dataset.action;
  if (action === "choose") { chooseAvatar(button.dataset.avatar); return; }
  if (action === "suggest" || action === "summary-prompt") {
    $("welcome-message").value = button.dataset.text || "지금까지 내가 이야기한 취향과 여행 방식, 편한 대화 방식을 정리해 줘.";
    rememberInput(); updateInput(); $("welcome-message").focus(); return;
  }
  if (action === "review" || action === "more") { reviewVisible = action === "review"; render(); window.scrollTo(0, 0); return; }
  busy = true; button.disabled = true;
  try {
    if (action === "start") {
      state = await api.request("/api/onboarding/character", {avatar:selected, version:state.onboarding.version});
      render(); window.scrollTo(0, 0);
    } else if (action === "consent") {
      if (!$("welcome-ai-consent").checked) return;
      const data = await api.request("/api/consent", {accepted:true}); state.user = data.user; render();
    } else if (action === "stop") {
      const turn = pending(); if (turn) await api.request(`/api/turns/${turn.id}/cancel`, {});
    } else if (action === "retry") {
      await api.request(`/api/turns/${button.dataset.id}/retry`, {attempt:Number(button.dataset.attempt)});
      await refreshChat();
    } else if (action === "resolve") {
      const previousText = api.pending(state.chat.id)?.message;
      await api.resolve(state.chat.id);
      if ($("welcome-message").value.trim() === previousText) $("welcome-message").value = "";
      rememberInput(); await refreshChat();
    }
  } catch (error) { notify(error.message); button.disabled = false; if (error.status === 409) await refreshChat().catch(() => {}); }
  finally { busy = false; if (state) { updateInput(); const start = document.querySelector('[data-action="start"]'); if (start) { start.disabled = !selected; start.innerHTML = `${character(selected).together} 시작하기 <span aria-hidden="true">→</span>`; } } }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "welcome-ai-consent") document.querySelector('[data-action="consent"]').disabled = !event.target.checked;
});
document.addEventListener("keydown", (event) => {
  const radio = event.target.closest('[role="radio"]');
  if (radio && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const index = CHARACTERS.findIndex((item) => item.id === radio.dataset.avatar);
    const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    chooseAvatar(CHARACTERS[(index + direction + CHARACTERS.length) % CHARACTERS.length].id);
  }
});
$("welcome-message").addEventListener("input", () => { rememberInput(); updateInput(); });
$("welcome-message-form").onsubmit = async (event) => {
  event.preventDefault();
  const text = $("welcome-message").value.trim();
  if (!text || [...text].length > 4000 || busy || pending() || !state.user.aiConsent) return;
  busy = true; updateInput();
  try {
    await api.send(state.chat, text);
    if ($("welcome-message").value.trim() === text) $("welcome-message").value = "";
    rememberInput();
    await refreshChat();
    bottom();
  } catch (error) { notify(error.message); await refreshChat().catch(() => {}); }
  finally { busy = false; updateInput(); }
};
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "welcome-review-form") return;
  event.preventDefault(); if (busy) return;
  const form = new FormData(event.target);
  const preferences = {interests:[...new Set(String(form.get("interests")).split(",").map((x) => x.trim()).filter(Boolean))],travelStyle:String(form.get("travelStyle")).trim(),about:String(form.get("about")).trim()};
  busy = true; event.target.querySelector('[type="submit"]').disabled = true;
  try {
    state = await api.request("/api/onboarding/complete", {draftId:state.draft.id,version:state.onboarding.version,profileVersion:state.user.profileVersion,preferences});
    render(); window.scrollTo(0, 0);
  } catch (error) {
    notify(error.message);
    if (error.status === 409) {
      const previousDraftId = state.draft.id;
      await sync(); render();
      if (state.draft?.id === previousDraftId && state.onboarding.phase === "review") {
        $("review-interests").value = preferences.interests.join(", ");
        $("review-style").value = preferences.travelStyle;
        $("review-about").value = preferences.about;
        document.querySelector("details.review-edit").open = true;
      }
    }
  }
  finally { busy = false; const submit = document.querySelector('#welcome-review-form [type="submit"]'); if (submit) submit.disabled = false; }
});
addEventListener("pagehide", () => { stream?.close(); stream = null; });
addEventListener("online", () => notify("다시 연결됐어요. 이야기를 이어가 주세요."));
addEventListener("offline", () => notify("연결을 확인해 주세요. 입력 중인 이야기는 남겨둘게요."));
try {
  const session = await api.request("/api/session");
  if (!session.user) location.replace("/#home");
  else {
    api.identity(session.user, session.csrf);
    if (await sync()) {
      if (state.onboarding.phase === "completed") location.replace("/#home");
      else { reviewVisible = state.onboarding.phase === "review"; $("welcome-message").value = savedInput(); render(); if (pending()) connect(pending().id); }
    }
  }
} catch (error) {
  $("welcome-main").innerHTML = `<section class="welcome-error"><h1>친구와 잠깐 연결이 끊겼어요.</h1><p>${escape(error.message)}</p><a class="welcome-primary" href="/welcome">다시 연결하기</a><a class="welcome-secondary" href="/#home">홈으로</a></section>`;
}
