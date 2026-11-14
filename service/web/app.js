import { ServiceClient } from "./client.mjs";
const $ = (id) => document.getElementById(id),
  api = new ServiceClient();
const S = {
  user: null,
  chats: [],
  trips: [],
  chat: null,
  view: "home",
  chatId: null,
  stream: null,
  partial: "",
  phase: "",
  authMode: "login",
  queuedPrompt: "",
  historyArchived: false,
  loading: false,
};
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#ic-${name}"></use></svg>`;
const art = () =>
  S.user?.profile.avatar === "bear" ? "/assets/bear.png" : "/assets/dragon.png";
const friend = () => (S.user?.profile.avatar === "bear" ? "모카" : "파도");
const pretty = (text) =>
  esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
const nav = [
  ["home", "home", "홈"],
  ["chat", "message", "대화"],
  ["trips", "route", "내 여행"],
  ["me", "users", "마이"],
];
const prompts = [
  [
    "waves",
    "취향부터 천천히",
    "내가 좋아하는 여행을 알아가요",
    "내가 어떤 여행을 좋아하는지 함께 알아가고 싶어.",
  ],
  [
    "route",
    "여행을 함께 준비",
    "목적지만 있어도 괜찮아요",
    "여행 계획을 같이 세워보고 싶어.",
  ],
  [
    "coffee",
    "오늘의 작은 쉼",
    "어떤 하루가 좋을지 이야기해요",
    "오늘은 조금 쉬고 싶은데, 나에게 맞는 여행을 같이 생각해 줄래?",
  ],
];
let identityEpoch = 0,
  routeVersion = 0,
  toastTimer,
  submitting = false,
  autoScroll = true;
function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("notice").hidden = true), 5000);
}
function closeStream() {
  S.stream?.close();
  S.stream = null;
  S.partial = "";
  S.phase = "";
}
function viewContext() {
  return {
    owner: S.user?.id,
    identity: identityEpoch,
    route: routeVersion,
    view: S.view,
    chatId: S.chatId,
    hash: location.hash,
  };
}
function currentView(context) {
  return (
    context.owner === S.user?.id &&
    context.identity === identityEpoch &&
    context.route === routeVersion &&
    context.view === S.view &&
    context.chatId === S.chatId &&
    context.hash === location.hash
  );
}
async function reloadChat(context, turnId = null) {
  if (!currentView(context) || !context.chatId) return;
  const data = await api.request(`/api/chats/${context.chatId}`);
  if (!currentView(context)) return;
  if (data.chat?.id !== context.chatId)
    throw new Error("대화를 다시 확인해 주세요.");
  S.chat = data.chat;
  draw();
  if (turnId) {
    scrollBottom(true);
    stream(turnId, context.chatId);
  }
}
function identity(data) {
  if (S.user?.id !== data.user?.id) identityEpoch++;
  S.user = data.user;
  api.identity(data.user, data.user ? (data.csrf ?? api.csrf) : null);
  if (data.chats) S.chats = data.chats;
  if (data.trips) S.trips = data.trips;
}
async function refresh() {
  const epoch = identityEpoch;
  const data = await api.request("/api/session");
  if (epoch !== identityEpoch) return;
  identity(data);
  if (!S.user) {
    S.chats = [];
    S.trips = [];
    S.chat = null;
    closeStream();
  }
  renderChrome();
  return data;
}
function brand() {
  return `<a href="#home" class="brand"><img src="${art()}" alt=""><span>말이통행</span></a>`;
}
function renderChrome() {
  $("message-form").setAttribute("aria-label", `${friend()}에게 메시지 보내기`);
  const active = S.view === "chat" ? "chat" : S.view;
  document.querySelector(".side-navigation").innerHTML = nav
    .map(
      ([id, i, label]) =>
        `<a class="side-link ${active === id ? "active" : ""}" href="#${id}">${icon(i)}${label}</a>`,
    )
    .join("");
  $("bottom-navigation").innerHTML = nav
    .map(
      ([id, i, label]) =>
        `<a class="bottom-link ${active === id ? "active" : ""}" href="#${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span></a>`,
    )
    .join("");
  $("bottom-navigation").hidden = S.view === "chat";
  document
    .querySelector(".app-main")
    .classList.toggle("chat-mode", S.view === "chat");
  $("mobile-header").innerHTML =
    S.view === "chat"
      ? `<div class="header-actions"><a href="#home" class="quiet icon-button" aria-label="홈으로">${icon("reply")}</a><span class="header-title">${esc(S.chat?.title || friend() + "와 이야기")}</span></div><div class="header-actions"><button class="quiet icon-button" data-action="history" aria-label="대화 기록">${icon("clock")}</button><button class="quiet icon-button" data-action="new-chat" aria-label="새 대화">${icon("edit")}</button></div>`
      : `${brand()}<div class="header-actions">${S.user ? `<span class="header-context">${esc(S.user.profile.displayName)}님의 여행</span><a href="#me" class="profile-avatar" aria-label="내 프로필"><img src="${art()}" alt=""></a>` : '<button class="text-button" data-action="login">로그인</button>'}</div>`;
  $("sidebar-history").innerHTML = S.user
    ? S.chats.length
      ? S.chats
          .slice(0, 18)
          .map(
            (c) =>
              `<a class="history-link ${c.id === S.chatId ? "active" : ""}" href="#chat/${c.id}">${esc(c.title)}</a>`,
          )
          .join("")
      : '<p class="muted small">우리의 첫 이야기를 기다리고 있어요.</p>'
    : '<p class="muted small">로그인하면 대화와 여행을<br>내 공간에 남길 수 있어요.</p>';
  $("sidebar-account").innerHTML = S.user
    ? `<a href="#me" class="account-button"><img src="${art()}" alt=""><span><b>${esc(S.user.profile.displayName)}</b><small>내 친구 · ${friend()}</small></span></a>`
    : '<button class="secondary-button full-width" data-action="login">로그인하고 시작하기</button>';
  document
    .querySelectorAll('.dialog-close,[data-action="close-dialog"]')
    .forEach((el) => (el.innerHTML = icon("x")));
  $("send-message").innerHTML = icon("arrow");
  document
    .querySelector('[data-action="history"].icon-button')
    ?.setAttribute("title", "대화 기록 보기");
  updateComposer();
}
function homeView() {
  const name = S.user?.profile.displayName;
  return `<div class="page"><div class="page-intro"><div><p class="eyebrow">YOUR OWN JOURNEY</p><h1>${name ? `${esc(name)}님, 반가워요` : "나를 알아가는 여행의 시작"}</h1><p class="muted">내 속도로, 내 마음에 드는 여행을 함께 준비해요.</p></div><span class="date-label">${new Intl.DateTimeFormat("ko", { month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span></div>
    <section class="home-hero"><div class="hero-copy"><span class="hero-tag">나의 AI 여행 친구 · ${friend()}</span><h2>어디로 갈까보다,<br>어떤 내가 좋을까?</h2><p>취향부터 오늘의 마음까지.<br>이야기를 나누다 보면, 나다운 여행이 보여요.</p><button class="main-button" data-action="new-chat">${friend()}와 이야기하기 ${icon("chevron")}</button></div><img class="home-character" src="${art()}" alt="나의 여행 친구 ${friend()}"></section>
    <div class="section-heading"><h2>이런 이야기부터 어때요?</h2><span class="muted small">편하게 시작해요</span></div><div class="starter-grid">${prompts.map(([i, title, subtitle, prompt]) => `<button class="starter-card" data-action="prompt" data-prompt="${esc(prompt)}">${icon(i)}<b>${title}</b><span>${subtitle}</span></button>`).join("")}</div>
    <div class="home-columns"><section><div class="section-heading"><h2>기다려지는 나의 여행</h2><a href="#trips" class="text-button">모두 보기 ${icon("chevron")}</a></div>${
      S.trips.length
        ? S.trips
            .slice(0, 2)
            .map((t) => tripCard(t, true))
            .join("")
        : `<div class="empty-card">${icon("route")}<p>아직 정해진 여행이 없어도 괜찮아요.</p><button class="text-button" data-action="prompt" data-prompt="여행 계획을 같이 세워보고 싶어.">대화로 첫 여행 준비하기</button></div>`
    }</section><section><div class="section-heading"><h2>친구가 기억하는 나</h2><a href="#me" class="text-button">살펴보기</a></div><div class="tip-card"><b>${S.user?.profile.interests.length ? "함께 알아간 취향" : "알아갈수록, 더 나다운 여행"}</b>${S.user?.profile.interests.length ? `<div class="interest-list">${S.user.profile.interests.map((x) => `<span class="interest-chip">${esc(x)}</span>`).join("")}</div><p>${esc(S.user.profile.travelStyle || "천천히 나만의 여행을 찾아가요.")}</p>` : "<p>좋아하는 풍경, 편한 여행 속도를 알려주세요. 내가 확인한 취향만 친구가 기억해요.</p>"}</div></section></div></div>`;
}
function tripCard(t, compact = false) {
  return `<button class="trip-card ${compact ? "compact" : ""}" data-action="trip" data-id="${t.id}">${!compact ? `<span class="trip-symbol">${icon("pin")}</span>` : ""}<h3>${esc(t.title)}</h3><p>${esc(t.destination)} · ${t.startDate ? esc(t.startDate) : "날짜 미정"}${t.endDate && t.endDate !== t.startDate ? " – " + esc(t.endDate) : ""}</p>${!compact ? `<span class="trip-bottom">${icon("check")} 직접 저장한 ${t.days.length}일의 여행</span>` : ""}</button>`;
}
function tripsView() {
  return `<div class="page"><div class="page-intro"><div><p class="eyebrow">MY JOURNEYS</p><h1>마음에 담아둔 여행</h1><p class="muted">친구와 함께 준비하고, 내가 직접 저장한 계획이에요.</p></div></div>${S.trips.length ? `<div class="trip-grid">${S.trips.map((t) => tripCard(t)).join("")}</div>` : `<div class="empty-card">${icon("route")}<h2>다음 여행을 함께 그려볼까요?</h2><p>목적지가 정해지지 않아도 괜찮아요.</p><button class="main-button" data-action="prompt" data-prompt="여행 계획을 같이 세워보고 싶어.">첫 여행 준비하기</button></div>`}</div>`;
}
function consentView() {
  return `<section class="consent-card"><label><input type="checkbox" id="ai-consent">대화와 저장한 취향·여행 정보를 OpenAI에 전달해 친구의 답변을 받는 데 동의해요. 여행 저장과 취향 변경은 별도로 확인해요.</label><button class="main-button" data-action="consent" disabled>동의하고 친구와 이야기하기</button></section>`;
}
function draftCard(d) {
  const trip = d.kind === "trip",
    body = d.body;
  return `<section class="draft-card"><div class="draft-top"><div class="draft-kicker">${icon(trip ? "route" : "spark")}${trip ? "우리의 여행 계획" : "친구가 기억할 취향"} · ${d.status === "confirmed" ? "저장 완료" : "함께 확인할 초안"}</div><h3>${esc(trip ? body.title : "이렇게 기억해도 괜찮을까요?")}</h3>${trip ? `<span class="draft-meta">${esc(body.destination)} · ${body.days.length}일${body.startDate ? " · " + esc(body.startDate) : " · 날짜 미정"}</span>` : ""}</div><div class="draft-body">${trip ? `<p>${esc(body.summary)}</p><div class="trip-preview-days">${body.days.map((day) => `<div class="preview-day"><span class="day-chip">DAY ${day.dayNumber}</span><span>${day.stops.map((s) => esc(s.title)).join(" · ")}</span></div>`).join("")}</div>` : `<div class="interest-list">${body.interests.map((x) => `<span class="interest-chip">${esc(x)}</span>`).join("")}</div><p>${esc(body.travelStyle)}</p><p>${esc(body.about)}</p>`}<div class="draft-actions">${d.status === "confirmed" ? `<span class="saved-indicator">${icon("check")}${trip ? "내 여행에 저장했어요" : "친구가 기억하고 있어요"}</span>` : `<button class="main-button" data-action="confirm-draft" data-id="${d.id}">${trip ? "내 여행에 저장하기" : "이 취향으로 기억해줘"}</button>`}</div>${trip ? '<p class="field-hint">영업·교통 정보는 출발 전 지도에서 확인해 주세요.</p>' : ""}</div></section>`;
}
function turnView(t) {
  const labels = [
    ...new Set(
      (Array.isArray(t.events) ? t.events : [])
        .map((event) => event?.label)
        .filter((label) => typeof label === "string" && label.trim()),
    ),
  ];
  return `<article class="turn" id="turn-${t.id}"><div class="user-message">${esc(t.message)}</div><div class="agent-label"><img src="${art()}" alt="">${friend()}</div>${labels.length ? `<div class="tool-events">${labels.map((label) => `<span class="tool-event">${icon("check")}${esc(label.replace(" 있어요", " 있었어요"))}</span>`).join("")}</div>` : ""}<div class="agent-message" id="reply-${t.id}">${pretty(t.reply || "")}</div>${t.status === "pending" ? `<div class="thinking" id="thinking-${t.id}" role="status"><span class="thinking-dot"></span><span>${esc(S.phase || "이야기를 듣고 있어요")}</span></div>` : ""}${["failed", "cancelled"].includes(t.status) ? `<div class="failed-turn">${t.status === "cancelled" ? "답변을 멈췄어요." : "답변을 끝까지 받지 못했어요. 입력한 이야기는 그대로 남아 있어요."}<br><button class="text-button" data-action="retry-turn" data-id="${t.id}" data-attempt="${t.attempt}">이 메시지로 다시 이야기하기</button></div>` : ""}${(t.drafts || []).map(draftCard).join("")}</article>`;
}
function chatView() {
  if (!S.user)
    return `<div class="chat-page"><div class="chat-empty"><img src="${art()}" alt="여행 친구 ${friend()}"><h1>이야기를 오래 이어가요</h1><p>로그인하면 대화와 여행을 내 공간에 남길 수 있어요.</p><button class="main-button" data-action="login">로그인하고 이야기하기</button></div></div>`;
  const turns = S.chat?.turns || [];
  return `<div class="chat-page">${!turns.length ? `<section class="chat-empty"><img src="${art()}" alt="반갑게 인사하는 ${friend()}"><p class="eyebrow">A LITTLE CHAT, A NEW JOURNEY</p><h1>안녕, 나는 ${friend()}야.</h1><p>오늘은 어떤 마음이야?<br>가고 싶은 곳이 없어도, 편하게 이야기해 줘.</p>${!S.user.aiConsent ? consentView() : `<div class="prompt-chips">${prompts.map(([, title, , p]) => `<button class="prompt-chip" data-action="fill-prompt" data-prompt="${esc(p)}">${title}</button>`).join("")}</div>`}</section>` : turns.map(turnView).join("")}${!S.user.aiConsent && turns.length ? consentView() : ""}${S.chatId && api.pending(S.chatId) ? '<section class="consent-card"><p>메시지의 전송 결과를 확인하고 있어요. 같은 내용으로 확인하면 중복 답변을 만들지 않아요.</p><button class="secondary-button" data-action="resolve-pending">전송 결과 확인</button></section>' : ""}</div>`;
}
function meView() {
  if (!S.user)
    return `<div class="page"><div class="empty-card"><img src="${art()}" width="130" height="130" alt=""><h1>나와 내 친구의 공간</h1><p>로그인하고 나다운 취향과 여행을 차곡차곡 남겨보세요.</p><button class="main-button" data-action="login">로그인하기</button></div></div>`;
  const p = S.user.profile;
  return `<div class="page settings-page"><div class="page-intro"><div><p class="eyebrow">ME & MY FRIEND</p><h1>나와 내 친구의 공간</h1><p class="muted">내가 확인한 취향만 기억하고 있어요.</p></div></div><section class="profile-card"><div class="profile-person"><img src="${art()}" alt="내 친구"><div><h2>${esc(p.displayName)}</h2><p>@${esc(S.user.handle)} · 내 친구 ${friend()}</p></div></div><form id="profile-form"><label for="my-name">내 별명</label><input id="my-name" name="displayName" maxlength="30" required value="${esc(p.displayName)}"><label>함께할 친구</label><div class="avatar-options">${[
    ["dragon", "파도"],
    ["bear", "모카"],
  ]
    .map(
      ([id, name]) =>
        `<label class="avatar-choice"><input type="radio" name="avatar" value="${id}" ${p.avatar === id ? "checked" : ""}><img src="/assets/${id}.png" alt="${name}"><span>${name}</span></label>`,
    )
    .join(
      "",
    )}</div><label for="my-interests">좋아하는 것</label><input id="my-interests" name="interests" placeholder="바다 산책, 조용한 카페처럼 쉼표로 구분해 주세요" value="${esc(p.interests.join(", "))}"><label for="my-style">편한 여행 방식</label><textarea id="my-style" name="travelStyle" maxlength="300" rows="2" placeholder="여유롭게 걷고, 중간중간 쉬는 여행이 좋아요">${esc(p.travelStyle)}</textarea><label for="my-about">친구가 알아두면 좋을 이야기</label><textarea id="my-about" name="about" maxlength="500" rows="3" placeholder="여행할 때 나를 편하게 해주는 것들을 알려주세요">${esc(p.about)}</textarea><p class="field-hint">건강·연락처 같은 민감정보는 남기지 않는 게 좋아요.</p><button class="main-button" type="submit">내 정보 저장하기</button></form></section><section class="profile-card"><div class="settings-row"><div><b>AI 대화 동의</b><p>대화와 저장한 취향·여행을 OpenAI에 전달해요.<br>동의를 철회하면 새 답변과 진행 중 답변을 멈춰요.</p></div><button class="outline-button" data-action="${S.user.aiConsent ? "revoke-consent" : "open-consent"}">${S.user.aiConsent ? "동의 철회" : "대화 시작하기"}</button></div></section><section class="profile-card"><div class="settings-row"><div><b>나의 계정</b><p>대화와 여행은 이 계정에 저장돼요.</p></div><button class="outline-button" data-action="logout">로그아웃</button></div></section></div>`;
}
function updateComposer() {
  const visible = S.view === "chat" && !!S.user;
  $("composer").hidden = !visible;
  if (!visible) return;
  const pending = S.chat?.turns.find((t) => t.status === "pending");
  $("message").disabled =
    !S.user.aiConsent || S.loading || !!S.chat?.archived || submitting;
  $("send-message").disabled =
    !S.user.aiConsent ||
    !!S.chat?.archived ||
    S.loading ||
    !!pending ||
    submitting ||
    !$("message").value.trim() ||
    [...$("message").value].length > 4000;
  $("send-message").hidden = !!pending;
  $("stop-message").hidden = !pending;
  $("character-count").textContent = $("message").value.length
    ? `${[...$("message").value].length} / 4,000`
    : "";
}
function draw() {
  renderChrome();
  $("main-content").innerHTML = S.loading
    ? '<div class="loading-state" role="status">이야기를 불러오고 있어요.</div>'
    : S.view === "chat"
      ? chatView()
      : S.view === "trips"
        ? tripsView()
        : S.view === "me"
          ? meView()
          : homeView();
}
function draftKey() {
  return `waymate.service.draft.${S.user?.id}.${S.chatId || "new"}`;
}
function restoreInput() {
  try {
    $("message").value = localStorage.getItem(draftKey()) || "";
  } catch {
    $("message").value = "";
  }
  updateComposer();
}
async function route() {
  const version = ++routeVersion;
  closeStream();
  const match = location.hash.match(
    /^#(home|chat|trips|me)(?:\/([\da-f-]+))?$/i,
  );
  S.view = match?.[1] || "home";
  S.chatId = S.view === "chat" ? match?.[2] || null : null;
  S.chat = null;
  S.loading = !!S.chatId;
  draw();
  if (S.chatId && S.user)
    try {
      const data = await api.request(`/api/chats/${S.chatId}`);
      if (version !== routeVersion) return;
      S.chat = data.chat;
    } catch (e) {
      if (version !== routeVersion) return;
      notice(e.message);
      S.chatId = null;
    }
  if (version !== routeVersion) return;
  S.loading = false;
  draw();
  restoreInput();
  $("main-content").scrollTop = 0;
  const pending = S.chat?.turns.find((t) => t.status === "pending");
  if (pending) stream(pending.id, S.chat.id);
  else if (S.view === "chat") scrollBottom(true);
}
function scrollBottom(force = false) {
  if (force || autoScroll)
    requestAnimationFrame(() => {
      $("main-content").scrollTop = $("main-content").scrollHeight;
    });
}
function stream(turnId, chatId) {
  if (S.view !== "chat" || S.chatId !== chatId || S.chat?.id !== chatId) return;
  closeStream();
  const context = viewContext();
  const es = new EventSource(`/api/turns/${turnId}/events`);
  S.stream = es;
  const valid = () =>
    currentView(context) && S.chat?.id === chatId && S.stream === es;
  function update() {
    const el = $(`reply-${turnId}`);
    if (el) el.innerHTML = pretty(S.partial);
    const indicator = $(`thinking-${turnId}`);
    if (indicator)
      indicator.innerHTML = `<span class="thinking-dot"></span><span>${esc(S.phase || "이야기를 듣고 있어요")}</span>`;
    scrollBottom();
  }
  es.addEventListener("snapshot", (event) => {
    if (!valid()) return;
    const data = JSON.parse(event.data);
    S.partial = data.text;
    S.phase = data.label;
    update();
  });
  es.addEventListener("delta", (event) => {
    if (!valid()) return;
    S.partial += JSON.parse(event.data).text;
    update();
  });
  es.addEventListener("phase", (event) => {
    if (!valid()) return;
    S.phase = JSON.parse(event.data).label;
    update();
  });
  es.addEventListener("done", async (event) => {
    if (!valid()) {
      es.close();
      return;
    }
    const chat = JSON.parse(event.data).chat;
    if (chat?.id !== chatId) {
      es.close();
      S.stream = null;
      notice("대화의 응답을 다시 확인해 주세요.");
      return;
    }
    S.chat = chat;
    es.close();
    S.stream = null;
    S.partial = "";
    S.phase = "";
    draw();
    scrollBottom();
    await refresh().catch(() => {});
  });
  es.onerror = () => {
    if (valid()) {
      S.phase = "연결을 다시 확인하고 있어요";
      update();
    }
  };
}
function openAuth(mode = "login") {
  S.authMode = mode;
  setAuthMode(mode);
  $("auth-error").textContent = "";
  $("auth-dialog").showModal();
}
function setAuthMode(mode) {
  S.authMode = mode;
  const register = mode === "register";
  $("login-tab").setAttribute("aria-selected", String(!register));
  $("register-tab").setAttribute("aria-selected", String(register));
  $("display-name-field").hidden = !register;
  $("display-name").required = register;
  $("password").autocomplete = register ? "new-password" : "current-password";
  $("password").minLength = register ? 12 : 1;
  $("password-hint").hidden = !register;
  $("auth-submit").textContent = register
    ? "나의 친구와 시작하기"
    : "로그인하고 이어가기";
  $("auth-error").textContent = "";
}
async function newChat(prompt = "") {
  if (!S.user) {
    S.queuedPrompt = prompt;
    openAuth("register");
    return;
  }
  if (location.hash === "#chat") {
    ++routeVersion;
    closeStream();
    S.chat = null;
    S.chatId = null;
    draw();
    restoreInput();
  } else location.hash = "chat";
  if (prompt) {
    await new Promise((r) => requestAnimationFrame(r));
    $("message").value = prompt;
    try {
      localStorage.setItem(`waymate.service.draft.${S.user.id}.new`, prompt);
    } catch {}
    updateComposer();
  }
  $("message").focus();
}
async function history() {
  if (!S.user) {
    openAuth();
    return;
  }
  const data = await api.request("/api/chats?archived=" + S.historyArchived);
  $("history-filter").textContent = S.historyArchived
    ? "진행 중인 대화 보기"
    : "보관한 대화 보기";
  $("history-list").innerHTML = data.chats.length
    ? data.chats
        .map(
          (c) =>
            `<div class="history-item"><a href="#chat/${c.id}" data-action="history-open" data-id="${c.id}"><b>${esc(c.title)}</b><small>${new Intl.DateTimeFormat("ko", { month: "short", day: "numeric" }).format(new Date(c.updatedAt))}</small></a><button class="text-button" data-action="archive" data-id="${c.id}" data-archived="${!S.historyArchived}">${S.historyArchived ? "복원" : "보관"}</button></div>`,
        )
        .join("")
    : '<div class="empty-card"><p>아직 이곳에 남긴 이야기가 없어요.</p></div>';
  if (!$("history-dialog").open) $("history-dialog").showModal();
}
function openTrip(id) {
  const t = S.trips.find((x) => x.id === id);
  if (!t) {
    notice("여행을 다시 불러와 주세요.");
    return;
  }
  $("trip-title").textContent = t.title;
  $("trip-content").innerHTML =
    `<p class="trip-dialog-desc">${esc(t.destination)} · ${t.startDate ? esc(t.startDate) : "날짜 미정"}${t.endDate && t.endDate !== t.startDate ? " – " + esc(t.endDate) : ""}</p><p>${esc(t.summary)}</p>${t.days.map((day) => `<section class="day-section"><h3><span class="day-chip">DAY ${day.dayNumber}</span>${day.date ? `<small>${esc(day.date)}</small>` : ""}</h3>${day.stops.map((stop) => `<div class="stop-item">${stop.time ? `<div class="stop-time">${esc(stop.time)}</div>` : ""}<b>${esc(stop.title)}</b><p>${esc(stop.description)}</p><a class="map-link" href="https://map.naver.com/p/search/${encodeURIComponent(stop.placeQuery || t.destination + " " + stop.title)}" target="_blank" rel="noopener noreferrer">${icon("pin")}지도에서 확인</a></div>`).join("")}</section>`).join("")}<div class="trip-notes">출발 전 영업·예약·교통 정보를 확인해 주세요.${t.notes.length ? `<ul>${t.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;
  $("trip-dialog").showModal();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const context = viewContext();
  try {
    if (action === "close-dialog") {
      button.closest("dialog").close();
      return;
    }
    if (action === "login") {
      openAuth();
      return;
    }
    if (action === "new-chat") {
      await newChat();
      return;
    }
    if (action === "prompt") {
      await newChat(button.dataset.prompt);
      return;
    }
    if (action === "fill-prompt") {
      $("message").value = button.dataset.prompt;
      updateComposer();
      $("message").focus();
      return;
    }
    if (action === "history") {
      await history();
      return;
    }
    if (action === "history-open") {
      $("history-dialog").close();
      return;
    }
    if (action === "toggle-archive") {
      S.historyArchived = !S.historyArchived;
      await history();
      return;
    }
    if (action === "archive") {
      await api.request(
        `/api/chats/${button.dataset.id}`,
        { archived: button.dataset.archived === "true" },
        "PATCH",
      );
      await refresh();
      if (!currentView(context)) return;
      if (context.chatId === button.dataset.id) await reloadChat(context);
      if (!currentView(context)) return;
      await history();
      return;
    }
    if (action === "trip") {
      openTrip(button.dataset.id);
      return;
    }
    if (action === "consent") {
      const accepted = $("ai-consent")?.checked;
      if (!accepted) return;
      const data = await api.request("/api/consent", { accepted: true });
      S.user = data.user;
      draw();
      restoreInput();
      $("message").focus();
      return;
    }
    if (action === "open-consent") {
      location.hash = "chat";
      return;
    }
    if (action === "revoke-consent") {
      const data = await api.request("/api/consent", { accepted: false });
      closeStream();
      S.user = data.user;
      draw();
      notice("동의를 철회했어요. 새 답변과 진행 중 답변을 멈췄어요.");
      return;
    }
    if (action === "logout") {
      await api.request("/api/auth/logout", {});
      closeStream();
      identity({ user: null, chats: [], trips: [], csrf: null });
      S.chat = null;
      $("message").value = "";
      location.hash = "home";
      draw();
      return;
    }
    if (action === "confirm-draft") {
      button.disabled = true;
      const data = await api.request(
        `/api/drafts/${button.dataset.id}/confirm`,
        {},
      );
      S.user = data.user;
      S.trips = data.trips;
      if (!currentView(context)) return;
      if (context.chatId) await reloadChat(context);
      if (!currentView(context)) return;
      draw();
      notice(
        data.result.kind === "trip"
          ? "내 여행에 저장했어요."
          : "이 취향으로 친구가 기억할게요.",
      );
      return;
    }
    if (action === "stop") {
      const pending = S.chat?.turns.find((t) => t.status === "pending");
      if (pending) await api.request(`/api/turns/${pending.id}/cancel`, {});
      return;
    }
    if (action === "retry-turn") {
      button.disabled = true;
      const response = await api.request(
        `/api/turns/${button.dataset.id}/retry`,
        { attempt: Number(button.dataset.attempt) },
      );
      await reloadChat(context, response.turnId);
      return;
    }
    if (action === "resolve-pending") {
      const response = await api.resolve(context.chatId);
      await reloadChat(context, response.turnId);
      return;
    }
  } catch (e) {
    button.disabled = false;
    if (!currentView(context)) return;
    notice(e.message);
    if (e.status === 401) {
      await refresh();
      location.hash = "home";
    }
  }
});
$("login-tab").onclick = () => setAuthMode("login");
$("register-tab").onclick = () => setAuthMode("register");
$("auth-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("auth-submit");
  button.disabled = true;
  $("auth-error").textContent = "";
  try {
    const fields = new FormData(event.target);
    identity(
      await api.request("/api/auth/" + S.authMode, {
        handle: fields.get("handle"),
        password: fields.get("password"),
        displayName: fields.get("displayName"),
      }),
    );
    event.target.reset();
    $("auth-dialog").close();
    location.hash = "chat";
    await route();
    if (S.queuedPrompt) {
      const prompt = S.queuedPrompt;
      S.queuedPrompt = "";
      await newChat(prompt);
    }
  } catch (e) {
    $("auth-error").textContent = e.message;
  } finally {
    button.disabled = false;
  }
};
document.addEventListener("change", (event) => {
  if (event.target.id === "ai-consent")
    document.querySelector('[data-action="consent"]').disabled =
      !event.target.checked;
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "profile-form") return;
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const f = new FormData(event.target);
    const profile = {
      displayName: f.get("displayName").trim(),
      avatar: f.get("avatar"),
      interests: [
        ...new Set(
          f
            .get("interests")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ],
      travelStyle: f.get("travelStyle").trim(),
      about: f.get("about").trim(),
    };
    const data = await api.request(
      "/api/profile",
      { version: S.user.profileVersion, profile },
      "PUT",
    );
    S.user = data.user;
    draw();
    notice("내 정보와 친구의 모습을 저장했어요.");
  } catch (e) {
    button.disabled = false;
    notice(e.message);
  }
});
$("message").addEventListener("input", () => {
  try {
    if (S.user) localStorage.setItem(draftKey(), $("message").value);
  } catch {
    notice("이 브라우저에서는 입력 초안을 보관하기 어려워요.");
  }
  updateComposer();
});
$("message").addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    !matchMedia("(max-width:760px)").matches
  ) {
    event.preventDefault();
    $("message-form").requestSubmit();
  }
});
$("main-content").addEventListener("scroll", () => {
  const el = $("main-content");
  autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
});
$("message-form").onsubmit = async (event) => {
  event.preventDefault();
  if (
    submitting ||
    S.view !== "chat" ||
    !S.user ||
    !S.user.aiConsent ||
    !$("message").value.trim() ||
    S.chat?.archived ||
    S.chat?.turns.some((t) => t.status === "pending") ||
    (S.chatId && S.chat?.id !== S.chatId)
  )
    return;
  const input = $("message").value,
    text = input.trim(),
    previousKey = draftKey();
  const context = viewContext(),
    originalChatId = context.chatId;
  let chat = S.chat,
    accepted = false;
  submitting = true;
  updateComposer();
  try {
    if (!chat) {
      const data = await api.request("/api/chats", {});
      if (context.owner !== S.user?.id || context.identity !== identityEpoch)
        return;
      chat = data.chat;
      if (currentView(context)) {
        S.chatId = chat.id;
        S.chat = chat;
        window.history.replaceState(null, "", "#chat/" + chat.id);
        context.chatId = chat.id;
        context.hash = location.hash;
      }
    }
    const response = await api.send(chat, text);
    accepted = true;
    if (
      currentView(context) ||
      (originalChatId && S.chatId !== originalChatId)
    ) {
      try {
        if (localStorage.getItem(previousKey)?.trim() === text)
          localStorage.removeItem(previousKey);
      } catch {}
    }
    if (!currentView(context)) return;
    if ($("message").value === input) $("message").value = "";
    await reloadChat(context, response.turnId);
  } catch (e) {
    if (!currentView(context)) return;
    notice(e.message);
    try {
      await reloadChat(context);
    } catch {}
    if (!currentView(context)) return;
    if (!accepted && (!$("message").value || $("message").value === input))
      $("message").value = input;
  } finally {
    submitting = false;
    updateComposer();
  }
};
addEventListener("hashchange", () => route().catch((e) => notice(e.message)));
addEventListener("online", () =>
  notice("다시 연결됐어요. 이야기를 이어가 주세요."),
);
addEventListener("offline", () =>
  notice("인터넷 연결을 확인해 주세요. 입력한 이야기는 남겨둘게요."),
);
try {
  await refresh();
  await route();
} catch (e) {
  console.error("SERVICE_BOOT", e.name);
  $("main-content").innerHTML =
    '<div class="error-page"><h1>친구와 연결하지 못했어요</h1><p>연결을 확인하고 페이지를 다시 열어 주세요.</p><a class="main-button" href="/">다시 연결하기</a></div>';
}
