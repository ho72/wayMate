import { DemoClient } from "./shared/client-v4.mjs";
import { ConsultationClient } from "./shared/consultation-v1.mjs";
import {
  POLL_MS,
  QUESTIONS,
  questionOrder,
  FOOD_CUE,
  emptySummary,
} from "/protocol.mjs";
const api = new DemoClient(),
  $ = (id) => document.getElementById(id);
const consultation = new ConsultationClient(api);
let aiReview = false;
let aiDraftRevision = 0;
let renderedRun = null;
let busy = false,
  polling = false,
  online = false,
  editing = null,
  currentQuestion = null,
  inputSource = "typed",
  exampleText = null,
  historyKey = null,
  profileStep = "character",
  scrollKey = null;
const status = (text) => {
  $("status").textContent = text;
};
function draftKey() {
  return `waymate.draft.v4.${api.id}.${api.state?.runId}`;
}
function answerRevision() {
  return Math.max(
    0,
    api.state?.consultation?.revision || 0,
    ...Object.values(api.state?.onboarding || {}).map((a) => a.revision),
  );
}
function drafts() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || "{}");
  } catch {
    return {};
  }
}
function preserveDraft() {
  if (consultation.enabled && !api.state.profile) {
    consultation.setDraft($("answer").value);
    $("count").textContent = `${[...$("answer").value].length} / 500자`;
    $("send").disabled =
      busy ||
      !!consultation.pending ||
      !online ||
      !$("answer").value.trim() ||
      [...$("answer").value].length > 500;
    return;
  }
  if (!currentQuestion) return;
  const d = drafts();
  d[currentQuestion] = {
    text: $("answer").value,
    inputSource,
    exampleText,
    basedOnRevision: answerRevision(),
  };
  localStorage.setItem(draftKey(), JSON.stringify(d));
  $("count").textContent = `${[...$("answer").value].length} / 500자`;
  $("send").disabled =
    busy ||
    !!api.pending ||
    !online ||
    !$("answer").value.trim() ||
    [...$("answer").value].length > 500;
}
function showQuestion(id) {
  if (currentQuestion === id) return;
  currentQuestion = id;
  if (!id) return;
  const saved = drafts()[id];
  const d = saved?.basedOnRevision === answerRevision() ? saved : null,
    a = api.state.onboarding[id];
  $("answer").value = d?.text ?? a?.answerText ?? "";
  inputSource = d?.inputSource ?? a?.inputSource ?? "typed";
  exampleText = d?.exampleText ?? null;
  $("question").textContent = QUESTIONS[id].prompt;
  $("count").textContent = `${[...$("answer").value].length} / 500자`;
}
function render() {
  const s = api.state;
  if (!s) return;
  consultation.observe();
  const resetting = !!s.reset || !!s.recovery;
  $("reset-panel").hidden = !resetting;
  document.querySelector(".conversation").hidden = resetting;
  document.querySelector(".composer-area").hidden = resetting;
  document.querySelector(".journey-menu").hidden = resetting;
  if (resetting) {
    clearPreparationUi();
    $("reset-detail").textContent =
      s.recovery?.message ||
      s.reset.blockedReasons.join(" · ") ||
      "필요한 기기의 정리 확인을 기다리고 있어요.";
    return;
  }
  if (renderedRun && renderedRun !== s.runId) clearPreparationUi();
  renderedRun = s.runId;
  renderProfilePreview();
  const owns = !s.clientId || s.clientId === api.id,
    active = !!s.vehicleActivation,
    locked =
      busy ||
      !!api.pending ||
      !!consultation.pending ||
      !online ||
      !owns ||
      active ||
      s.social?.connection.attempted;
  const order = questionOrder(s.onboarding),
    next = editing || order.find((k) => !s.onboarding[k]);
  const historyVersion = JSON.stringify([
    s.onboarding,
    s.consultation,
    s.profile,
    s.trip,
    s.publication,
    s.social?.tripShareApproved,
    locked,
  ]);
  if (historyVersion !== historyKey) {
    historyKey = historyVersion;
    const history = $("history");
    history.replaceChildren();
    for (const turn of consultation.enabled
      ? s.consultation?.turns || []
      : []) {
      const user = node("div", null, "message user"),
        agent = node("div", null, "message agent");
      user.append(node("p", turn.message, "raw"));
      agent.append(
        node("span", "wayMate · AI", "speaker"),
        node("p", turn.result.reply),
      );
      history.append(user, agent);
    }
    for (const id of consultation.enabled ? [] : order) {
      const a = s.onboarding[id];
      if (!a) continue;
      const agent = node("div", null, "message agent");
      agent.append(
        node("span", "wayMate", "speaker"),
        node("p", questionLine(id)),
      );
      const user = node("div", null, "message user"),
        raw = node("p", a.answerText, "raw"),
        edit = node("button", "수정", "edit-answer");
      edit.type = "button";
      edit.disabled = locked;
      edit.setAttribute("aria-label", QUESTIONS[id].prompt + " 답변 수정");
      edit.onclick = () => {
        preserveDraft();
        editing = id;
        render();
        $("answer").focus();
      };
      user.append(raw, edit);
      history.append(agent, user);
    }
    if (s.profile)
      history.append(
        confirmedTurn(
          "직접 확인한 소개",
          profileLine(
            s.profile.alias,
            s.profile.avatarId,
            s.profile.privateSummary,
          ),
        ),
      );
    if (s.profile?.introduction)
      history.append(
        confirmedTurn("본인 모바일에서 확인한 소개", s.profile.introduction),
      );
    if (s.trip)
      history.append(
        confirmedTurn(
          "저장한 여행 계획",
          `${s.trip.date} · 강릉 해변권의 여행 계획`,
        ),
      );
    if (s.publication === "published")
      history.append(
        confirmedTurn(
          "확인한 공개 범위",
          "선택한 소개 항목을 공개하기로 했어요.",
        ),
      );
    if (s.social?.tripShareApproved)
      history.append(
        confirmedTurn(
          "공유 확인",
          "여행일·권역·가능 시간만 함께 볼 수 있어요.",
        ),
      );
  }
  if (!consultation.enabled) showQuestion(next);
  if (consultation.enabled) {
    currentQuestion = null;
    $("question").textContent = "내 친구에게 이야기하기";
    if (document.activeElement !== $("answer"))
      $("answer").value = consultation.draft;
  }
  $("answer-form").hidden =
    (!consultation.enabled && !next) ||
    (consultation.enabled && !!s.profile) ||
    !owns ||
    active ||
    !!s.social?.connection.attempted;
  $("composer-hint").hidden = !$("answer-form").hidden;
  for (const el of $("answer-form").elements) el.disabled = locked;
  $("send").disabled =
    locked || !$("answer").value.trim() || [...$("answer").value].length > 500;
  $("food-example").hidden = currentQuestion !== "interests";
  $("example").hidden = consultation.enabled;
  for (const el of $("profile-form").elements) el.disabled = locked;
  $("save").disabled =
    locked ||
    !validAlias() ||
    profileStep !== "summary" ||
    !s.allowedActions.includes("PROFILE_CONFIRM");
  $("profile-next").disabled = locked || !validAlias();
  $("save-trip").disabled = locked || !s.allowedActions.includes("TRIP_SAVE");
  $("prepare").disabled =
    busy ||
    !!api.pending ||
    !online ||
    !owns ||
    active ||
    !s.allowedActions.includes("HANDOFF_PREPARE");
  $("cancel-pending").hidden = api.pending?.type !== "CONNECT_REQUEST";
  $("recover").hidden = !api.pending;
  $("retry").hidden = !api.pending;
  renderFlow(s, owns);
  renderConsultation(locked, owns);
  if (!owns) {
    status("이 여행을 준비한 브라우저를 사용해 주세요.");
    return;
  }
  if (active) {
    if (online) status("차량에서 여행을 이어가요. 웹 준비는 잠겨 있어요.");
    $("delivery-title").textContent = "차량에서 여행을 시작했어요";
    $("delivery-detail").textContent =
      s.vehicleActivation.origin === "handoff"
        ? "차량 수신 확인을 저장했어요. 이제 플레오스 화면에서 여행을 이어가요."
        : "차량에서 바로 시작한 여행이에요. 이제 플레오스 화면에서 이어가요.";
  } else if (s.handoff) {
    $("delivery-title").textContent = "차량에서 불러오기를 눌러 주세요";
    $("delivery-detail").textContent =
      "준비한 소개와 여행을 차량에서 확인해 주세요.";
  } else {
    $("delivery-title").textContent =
      s.profile && s.trip ? "준비를 저장했어요" : "저장 후 차량으로 전달해요";
    $("delivery-detail").textContent =
      s.profile && s.trip
        ? "차량에 전달하거나, 차량에서 저장된 준비로 직접 시작할 수 있어요."
        : "답변 · 소개 확인 · 여행 계획 저장을 마쳐 주세요.";
  }
}
async function work(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fn();
    online = true;
  } catch (e) {
    status(
      api.pending
        ? "저장 결과가 미확인이에요. 결과 확인 후 같은 요청을 다시 전송해 주세요."
        : e.message,
    );
  } finally {
    busy = false;
    render();
  }
}
$("answer").addEventListener("input", () => {
  inputSource =
    exampleText === null
      ? "typed"
      : $("answer").value === exampleText
        ? "example"
        : "example_edited";
  preserveDraft();
});
function example(text) {
  $("answer").value = text;
  exampleText = text;
  inputSource = "example";
  preserveDraft();
  $("answer").focus();
}
$("example").onclick = () => example(QUESTIONS[currentQuestion].example);
$("food-example").onclick = () => example(FOOD_CUE);
$("answer-form").onsubmit = (e) => {
  e.preventDefault();
  if (consultation.enabled) {
    const message = $("answer").value;
    if (!message.trim() || [...message].length > 500 || consultation.pending)
      return;
    work(async () => {
      status("이야기를 듣고 답변과 소개 초안을 준비하고 있어요.");
      await consultation.send(message);
      aiReview = false;
      $("answer").value = "";
      applyAiDraft();
      historyKey = null;
      scrollKey = null;
      status("이야기를 이어가거나 소개 초안을 확인해 주세요.");
    });
    return;
  }
  const answerText = $("answer").value,
    questionId = currentQuestion,
    source = inputSource;
  if (!answerText.trim() || [...answerText].length > 500) {
    status("답변을 1~500자로 입력해 주세요.");
    return;
  }
  work(async () => {
    await api.command("ONBOARDING_ANSWER", {
      questionId,
      answerText,
      inputSource: source,
    });
    editing = null;
    currentQuestion = null;
    profileStep = "character";
    persistProfileDraft();
    status("답변 원문을 저장했어요.");
  });
};
$("no-summary").onclick = () => {
  for (const id of [
    "sea",
    "cafe",
    "activity",
    "pace",
    "conversation",
    "expression",
  ])
    $(id).checked = false;
  $("style").value = "";
  renderProfilePreview();
  persistProfileDraft();
  status("소개값을 모두 비웠어요. 원문 확인 후 소개를 저장해 주세요.");
};
$("profile-form").onsubmit = (e) => {
  e.preventDefault();
  if (profileStep !== "summary") {
    advanceCharacter();
    return;
  }
  const alias = $("alias").value.normalize("NFC").trim();
  if (!alias || [...alias].length > 10 || /[\r\n]/.test(alias)) {
    status("별명은 줄바꿈 없이 1~10자로 입력해 주세요.");
    return;
  }
  const summary = localSummary();
  work(async () => {
    await api.command("PROFILE_CONFIRM", {
      alias,
      avatarId: document.querySelector("input[name=avatar]:checked").value,
      confirmedSummary: summary,
      ...(api.state.consultation
        ? {
            consultationRevision: aiDraftRevision,
            introduction: $("ai-introduction").value.trim(),
          }
        : {}),
    });
    manualStage = null;
    status("직접 확인한 소개값만 저장했어요. 여행 계획도 확인해 주세요.");
  });
};
$("save-trip").onclick = () =>
  work(async () => {
    await api.command("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
    manualStage = null;
    status("여행 계획을 저장했어요.");
  });
function prepareHandoff() {
  const binding = api.state.actionBindings.HANDOFF_PREPARE;
  if (!binding) return;
  const reviewed = structuredClone(binding);
  work(async () => {
    await api.command(reviewed.commandType, reviewed.payload, reviewed.target);
    status("전달 준비를 저장했어요. 차량에서 불러오기를 눌러 주세요.");
  });
}
$("prepare").onclick = prepareHandoff;
$("cancel-pending").onclick = () => work(() => api.cancelPending());
$("recover").onclick = () =>
  work(async () =>
    status(
      (await api.recover())
        ? "저장 결과를 확인했어요."
        : "영수증이 없어요. 같은 요청으로 다시 확인할 수 있어요.",
    ),
  );
$("retry").onclick = () =>
  work(async () => {
    if (!(await api.recover())) await api.sendPending();
    status("같은 요청의 저장 결과를 확인했어요.");
  });
function clearPreparationUi() {
  aiReview = false;
  aiDraftRevision = 0;
  $("ai-consent").checked = false;
  $("ai-introduction").value = "";
  $("answer").value = "";
  $("alias").value = "파도";
  document.querySelector('input[name=avatar][value="a-01"]').checked = true;
  for (const id of [
    "sea",
    "cafe",
    "activity",
    "pace",
    "conversation",
    "expression",
  ])
    $(id).checked = false;
  $("style").value = "";
  $("history").replaceChildren();
  $("profile-preview").textContent = "";
  $("social-content").replaceChildren();
  editing = null;
  currentQuestion = null;
  historyKey = null;
  profileStep = "character";
  scrollKey = null;
  flowKey = null;
  manualStage = null;
  candidateDetail = false;
  reviewBinding = null;
  publicSelection = new Set(["alias", "avatarId"]);
  if ($("review-dialog").open) $("review-dialog").close();
}

function applyAiDraft(persist = true) {
  const draft = api.state.consultation?.turns.at(-1)?.result;
  if (!draft) return;
  const s = draft.summary;
  aiDraftRevision = api.state.consultation.revision;
  $("sea").checked = s.interests.includes("sea_walk");
  $("cafe").checked = s.interests.includes("cafe");
  $("activity").checked = !!s.activityPreference;
  $("pace").checked = !!s.pace;
  $("conversation").checked = !!s.conversationStyle;
  $("style").value = s.speakingStyle || "";
  $("expression").checked = !!s.expressionPresetIds.length;
  $("ai-introduction").value = draft.introduction;
  profileStep = "character";
  if (persist) persistProfileDraft();
}
function renderConsultation(locked, owns) {
  const s = api.state,
    enabled = consultation.enabled;
  const fresh =
    owns &&
    !s.profile &&
    !s.vehicleActivation &&
    !s.social?.connection.attempted &&
    !Object.keys(s.onboarding).length;
  $("conversation-mode").textContent = enabled
    ? "AI와 나눈 이야기는 본인 모바일에만 보여요. 소개·공개는 따로 확인해요."
    : "준비된 대화로 함께하는 프로토타입";
  $("ai-choice").hidden = !fresh || enabled;
  $("ai-description").textContent = consultation.available
    ? "자유로운 이야기로 AI가 나를 알아가고, 소개 초안을 함께 만들어요."
    : "지금은 준비된 시연 대화예요. AI 상담은 아직 연결되지 않았어요.";
  $("ai-start").hidden = !consultation.available;
  $("ai-consent-label").hidden = !consultation.available;
  $("ai-start").disabled = locked || !$("ai-consent").checked;
  $("ai-actions").hidden = !enabled || !fresh;
  $("ai-retry").hidden = !consultation.pending;
  $("ai-retry").disabled = busy || !online || !consultation.available;
  $("ai-demo").hidden = !!s.consultation;
  $("ai-demo").disabled =
    busy ||
    !!api.pending ||
    !!consultation.pending ||
    !online ||
    !s.allowedActions.includes("ONBOARDING_ANSWER");
  $("ai-review").disabled = locked || !s.consultation?.turns.length;
  $("ai-introduction-review").hidden = !s.consultation;
  if (enabled) {
    $("send").disabled =
      locked ||
      !online ||
      !consultation.available ||
      !$("answer").value.trim() ||
      [...$("answer").value].length > 500 ||
      (s.consultation?.revision || 0) >= 20;
    $("count").textContent = `${[...$("answer").value].length} / 500자`;
    if (!s.profile && !aiReview) {
      $("conversation-prompt").textContent = s.consultation?.turns.length
        ? "더 이야기해도 좋고, 지금까지의 이야기로 소개를 확인해도 좋아."
        : "어떤 여행을 좋아해? 요즘 마음에 드는 시간이나 장소부터 편하게 이야기해줘.";
    }
    if (
      s.consultation &&
      (aiDraftRevision !== s.consultation.revision ||
        !$("ai-introduction").value.trim() ||
        [...$("ai-introduction").value].length > 300)
    )
      $("save").disabled = true;
  }
}
$("ai-consent").onchange = render;
$("ai-start").onclick = () => {
  if (!$("ai-consent").checked) return;
  consultation.enable();
  $("answer").value = "";
  currentQuestion = null;
  historyKey = null;
  render();
  $("answer").focus();
};
$("ai-review").onclick = () => {
  if (aiDraftRevision !== api.state.consultation?.revision) applyAiDraft();
  aiReview = true;
  persistProfileDraft();
  render();
};
$("ai-demo").onclick = () => {
  if (
    busy ||
    api.pending ||
    consultation.pending ||
    api.state.consultation ||
    !api.state.allowedActions.includes("ONBOARDING_ANSWER")
  )
    return;
  const draft = consultation.useDemo();
  aiReview = false;
  aiDraftRevision = 0;
  currentQuestion = null;
  historyKey = null;
  render();
  $("answer").value = draft;
  inputSource = "typed";
  exampleText = null;
  preserveDraft();
  status("기본 시연 대화로 이어가요. 입력한 이야기는 초안으로 남겨뒀어요.");
  $("answer").focus();
};
$("ai-retry").onclick = () =>
  work(async () => {
    await consultation.send();
    applyAiDraft();
    historyKey = null;
    status("같은 메시지의 답변을 확인했어요.");
  });
$("ai-introduction").oninput = () => {
  persistProfileDraft();
  render();
};
async function synchronizeReset() {
  if (!api.state?.reset) return;
  api.prepareResetCleanup();
  render();
  if (api.pending?.type === "RESET_ACK") {
    if (!(await api.recover())) await api.sendPending();
    return;
  }
  const b = api.state.actionBindings.RESET_ACK;
  if (b && !api.state.reset.webAcknowledged)
    await api.command(b.commandType, b.payload, b.target);
}
async function poll() {
  if (polling || busy || document.hidden) return;
  polling = true;
  try {
    const was = online;
    await api.read();
    await synchronizeReset();
    online = true;
    if (!was) status("서버에 연결됐어요.");
    render();
  } catch (e) {
    online = false;
    status(
      e.message?.includes("서버 버전")
        ? e.message
        : "서버 연결을 확인해 주세요. 저장 완료로 처리하지 않았어요.",
    );
    render();
  } finally {
    polling = false;
  }
}
const summaryInputs = [
  "sea",
  "cafe",
  "activity",
  "pace",
  "conversation",
  "expression",
];
function localSummary() {
  const v = emptySummary();
  if (api.state?.consultation) v.summarySource = "user_confirmed_ai";
  v.interests = ["sea", "cafe"]
    .filter((id) => $(id).checked)
    .map((id) => (id === "sea" ? "sea_walk" : "cafe"));
  v.activityPreference = $("activity").checked
    ? "walk_first_photos_occasional"
    : null;
  v.pace = $("pace").checked ? "relaxed" : null;
  v.conversationStyle = $("conversation").checked ? "quiet" : null;
  v.speakingStyle = $("style").value || null;
  v.expressionPresetIds = $("expression").checked ? ["quiet-companion"] : [];
  return v;
}
function profileLine(alias, avatar, summary) {
  const labels = [alias, avatar === "a-01" ? "블루 드래곤" : "햇살 친구"];
  const interests = summary.interests.map((i) =>
    i === "sea_walk" ? "바다 산책" : "카페",
  );
  if (interests.length) labels.push(interests.join(" · "));
  if (summary.activityPreference) labels.push("산책 먼저, 사진은 가끔");
  if (summary.pace) labels.push("여유로운 여행");
  if (summary.conversationStyle) labels.push("조용한 대화");
  if (summary.speakingStyle)
    labels.push(
      summary.speakingStyle === "calm"
        ? "차분하고 편안하게"
        : "가벼운 농담도 조금",
    );
  if (summary.expressionPresetIds.length) labels.push("조용히 함께하는 친구");
  return labels.join(" / ");
}
function validAlias() {
  const v = $("alias").value.normalize("NFC").trim();
  return [...v].length >= 1 && [...v].length <= 10 && !/[\r\n]/.test(v);
}
function renderProfilePreview() {
  const a = $("alias").value.normalize("NFC").trim();
  $("profile-preview").textContent = profileLine(
    a || "아직 정하지 않은 별명",
    document.querySelector("input[name=avatar]:checked").value,
    localSummary(),
  );
  for (const b of document.querySelectorAll("[data-tone]"))
    b.setAttribute("aria-pressed", String(b.dataset.tone === $("style").value));
  $("alias-help").textContent = validAlias()
    ? "네가 편한 별명이면 좋아."
    : "줄바꿈 없이 1~10자로 알려줘.";
}
function profileDraftKey() {
  return `waymate.profileDraft.v4.${api.id}.${api.state?.runId}`;
}
function persistProfileDraft() {
  if (!api.state) return;
  localStorage.setItem(
    profileDraftKey(),
    JSON.stringify({
      revision: api.state.consultation ? aiDraftRevision : answerRevision(),
      step: profileStep,
      alias: $("alias").value,
      avatar: document.querySelector("input[name=avatar]:checked").value,
      selected: summaryInputs.filter((id) => $(id).checked),
      style: $("style").value,
      introduction: $("ai-introduction").value,
      aiReview,
    }),
  );
}
function restoreProfileDraft() {
  if (api.state.profile) return;
  try {
    const d = JSON.parse(localStorage.getItem(profileDraftKey()) || "null");
    if (!d || d.revision !== answerRevision()) return;
    $("alias").value = typeof d.alias === "string" ? d.alias : "파도";
    if (["a-01", "a-02"].includes(d.avatar))
      document.querySelector(
        `input[name=avatar][value="${d.avatar}"]`,
      ).checked = true;
    for (const id of summaryInputs)
      $(id).checked = Array.isArray(d.selected) && d.selected.includes(id);
    $("style").value = ["", "calm", "light_humor"].includes(d.style)
      ? d.style
      : "";
    $("ai-introduction").value =
      typeof d.introduction === "string" ? d.introduction : "";
    aiReview = !!d.aiReview;
    if (api.state.consultation) aiDraftRevision = d.revision;
    profileStep =
      d.step === "summary" && validAlias() ? "summary" : "character";
  } catch {
    /* Keep the unreadable draft; never submit it. */
  }
}
function advanceCharacter() {
  if (!validAlias()) return;
  profileStep = "summary";
  persistProfileDraft();
  render();
}
$("profile-next").onclick = advanceCharacter;
$("profile-back").onclick = () => {
  profileStep = "character";
  persistProfileDraft();
  render();
};
$("alias").addEventListener("input", () => {
  persistProfileDraft();
  render();
});
for (const id of summaryInputs)
  $(id).addEventListener("change", () => {
    persistProfileDraft();
    renderProfilePreview();
  });
for (const b of document.querySelectorAll("[data-tone]"))
  b.onclick = () => {
    $("style").value = b.dataset.tone;
    persistProfileDraft();
    renderProfilePreview();
  };
function questionLine(id) {
  const lead =
    {
      activity: "고마워, 네 이야기 그대로 적어둘게. ",
      conversation: "이번엔 사람과 함께할 때를 생각해보자. ",
      expression: "친구로서 널 소개할 때도 편했으면 해. ",
      food_detail: "음식 이야기도 조금 더 들려줘. ",
    }[id] || "";
  return lead + QUESTIONS[id].prompt;
}
function confirmedTurn(label, text) {
  const n = node("div", null, "message confirmation");
  n.append(node("small", label), node("p", text));
  return n;
}
function guideConversation(s, stage) {
  let line = "";
  if (stage === "onboarding") {
    line = currentQuestion
      ? questionLine(currentQuestion)
      : profileStep === "character"
        ? "이야기해줘서 고마워. 이제 널 어떻게 부르면 좋을까? 함께할 친구 모습도 골라줘."
        : "좋아. 다른 사람에게 소개할 내용도 네가 직접 정해보자. 지금은 별명과 친구 모습만으로 시작해도 괜찮아.";
  } else if (stage === "trip")
    line = `${s.profile.alias}, 이제 여행 계획도 같이 보자. 먼저 강릉 해안의 이 계획으로 준비해볼까?`;
  else if (stage === "public")
    line =
      "우리끼리 나눈 이야기와 다른 사람에게 보여줄 소개는 나눠둘게. 어디까지 함께 볼지 네가 골라줘.";
  else if (stage === "candidates")
    line =
      "네가 공유하기로 한 여행을 기준으로, 같은 날 알아갈 수 있는 사람을 준비했어. 한 번 살펴볼까?";
  else if (stage === "connection")
    line =
      "대화 연결과 실제 만남은 따로 확인할 거야. 지금 연결 상태를 같이 보자.";
  else
    line = s.vehicleActivation
      ? "준비한 여행이 차에 잘 도착했어. 이제 차 안에서도 나와 함께 이어가자."
      : "여기까지 함께 준비했어. 이 소개와 계획으로 차에서도 이야기 이어갈까?";
  $("conversation-prompt").textContent = line;
  const nextScroll = JSON.stringify([
    stage,
    currentQuestion,
    profileStep,
    s.onboardingRevision ?? answerRevision(),
    s.profileVersion,
    s.tripVersion,
    s.publication,
    s.social?.connection.status,
  ]);
  if (scrollKey !== nextScroll) {
    scrollKey = nextScroll;
    requestAnimationFrame(() => {
      const viewport = document.querySelector(".conversation");
      viewport.scrollTop = viewport.scrollHeight;
    });
  }
}
let candidateDetail = false;
let manualStage = null;
let reviewBinding = null,
  flowKey = null,
  publicSelection = new Set(["alias", "avatarId"]);
function confirmBinding(binding, title, detail) {
  reviewBinding = structuredClone(binding);
  $("review-title").textContent = title;
  $("review-detail").textContent = detail;
  $("review-dialog").showModal();
}
$("review-cancel").onclick = () => {
  $("review-dialog").close();
  reviewBinding = null;
};
$("review-confirm").onclick = () => {
  const b = reviewBinding;
  $("review-dialog").close();
  reviewBinding = null;
  if (b)
    work(async () => {
      await api.command(b.commandType, b.payload, b.target);
      status("확인한 내용을 저장했어요.");
    });
};
function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function action(root, name, label, detail) {
  const b = api.state.actionBindings[name];
  if (!b) return;
  const button = node("button", label);
  button.disabled = busy || !!api.pending || !online;
  button.onclick = () => confirmBinding(b, label, detail);
  root.append(button);
}
function renderFlow(s, owns) {
  const con = s.social?.connection;
  if (!owns || !con) return;
  let stage =
    manualStage && !con.attempted && !s.vehicleActivation
      ? manualStage
      : s.vehicleActivation
        ? "transfer"
        : !s.profile
          ? "onboarding"
          : !s.trip
            ? "trip"
            : con.status === "linked" || s.handoff
              ? "transfer"
              : con.attempted
                ? "connection"
                : s.publication !== "published" || !s.social.tripShareApproved
                  ? "public"
                  : "candidates";
  $("chat-card").hidden = false;
  $("delivery-card").hidden = stage !== "transfer";
  $("profile-card").hidden =
    stage !== "onboarding" ||
    (consultation.enabled
      ? !aiReview
      : questionOrder(s.onboarding).some((k) => !s.onboarding[k]));
  $("character-review").hidden = profileStep !== "character";
  $("summary-review").hidden = profileStep !== "summary";
  $("trip-card").hidden = stage !== "trip";
  $("profile-form").hidden = !["onboarding", "trip"].includes(stage);
  $("social-card").hidden = ![
    "public",
    "candidates",
    "connection",
    "transfer",
  ].includes(stage);
  $("prepare").hidden =
    stage !== "transfer" &&
    !(con.attempted && ["cancelled", "declined", "ended"].includes(con.status));
  $("steps").replaceChildren(
    ...["나눈 이야기", "여행 계획", "공개·추천", "연결 확인"].map(
      (label, i) => {
        const n = node(
          !con.attempted &&
            !s.vehicleActivation &&
            (i === 0 || (i === 1 && s.profile) || (i === 2 && s.trip))
            ? "button"
            : "span",
          label,
          {
            onboarding: 0,
            trip: 1,
            public: 2,
            candidates: 2,
            connection: 3,
            transfer: 3,
          }[stage] === i
            ? "current"
            : "",
        );
        if (n.tagName === "BUTTON") {
          n.type = "button";
          n.onclick = () => {
            manualStage = [
              "onboarding",
              "trip",
              s.publication === "published" && s.social.tripShareApproved
                ? "candidates"
                : "public",
            ][i];
            flowKey = null;
            render();
          };
        }
        return n;
      },
    ),
  );
  guideConversation(s, stage);
  const key = JSON.stringify([
    stage,
    candidateDetail,
    s.profileVersion,
    s.publication,
    s.social,
    s.handoff,
    s.vehicleActivation,
    busy,
    !!api.pending,
    online,
  ]);
  if (flowKey === key) return;
  flowKey = key;
  const root = $("social-content");
  root.replaceChildren();
  $("social-step").textContent = ["public", "candidates"].includes(stage)
    ? "함께 알아가기"
    : "서로 알아가기";
  $("social-title").textContent =
    {
      public: "이 소개, 다른 여행자에게도 보여줄까?",
      candidates: "여행이 겹치는 친구가 있어",
      connection: "서로를 알아갈 준비",
      transfer: s.vehicleActivation
        ? "차량에서 여행을 이어가요"
        : "이제 차에서도 함께할 수 있어",
    }[stage] || "내 여행 준비";
  if (stage === "public") {
    root.append(
      node(
        "p",
        `${s.profile.alias} · 선택한 캐릭터. 원문 답변과 개인 일정은 공유하지 않아요.`,
      ),
    );
    if (s.publication !== "published") {
      const fields = [
        "alias",
        "avatarId",
        "interests",
        "activityPreference",
        "pace",
        "conversationStyle",
        "speakingStyle",
        "expressionPresetIds",
      ];
      const labels = [
        "별명",
        "캐릭터",
        "관심사",
        "활동 선호",
        "여행 속도",
        "대화 스타일",
        "소개 말투",
        "소개 표현",
      ];
      const publicEditor = node("details", null, "optional-editor");
      publicEditor.append(node("summary", "공개할 항목을 조정할래"));
      const chosen = [];
      const intro = node("p", publicPreview(s, publicSelection), "summary");
      fields.forEach((key, i) => {
        const l = node("label", null, "check");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = publicSelection.has(key);
        input.onchange = () => {
          if (input.checked) publicSelection.add(key);
          else publicSelection.delete(key);
          intro.textContent = publicPreview(s, publicSelection);
        };
        input.disabled = i < 2;
        input.dataset.field = key;
        l.append(input, document.createTextNode(labels[i]));
        publicEditor.append(l);
        chosen.push(input);
      });
      root.append(intro, publicEditor);
      const publish = node("button", "이 소개로 연결해볼래");
      publish.disabled = busy || !!api.pending || !online;
      publish.onclick = () =>
        confirmBinding(
          {
            commandType: "PROFILE_PUBLISH",
            target: {},
            payload: {
              profileVersion: s.profileVersion,
              approvedFields: chosen
                .filter((c) => c.checked)
                .map((c) => c.dataset.field),
            },
          },
          "이 소개를 공개할까요?",
          publicPreview(
            s,
            new Set(
              chosen.filter((c) => c.checked).map((c) => c.dataset.field),
            ),
          ) + "\n원문 대화는 공유하지 않아요.",
        );
      root.append(publish);
    } else root.append(node("p", "✓ 소개 공개 승인 저장 완료"));
    root.append(
      node(
        "p",
        "상대에게 보일 여행 요약: 2026-11-14 · 강릉 해변권 · 13:00~15:00",
      ),
    );
    if (!s.social.tripShareApproved)
      action(
        root,
        "TRIP_SHARE_CONFIRM",
        "응, 여행 요약도 공유할게",
        "여행일·권역·가능 시간만 공개해요. 다음 일정·숙소 계획은 본인용이에요.",
      );
    else root.append(node("p", "✓ 여행 요약 공유 승인 저장 완료"));
    action(
      root,
      "PROFILE_PRIVATE",
      "지금은 나만 보기",
      "내 소개와 여행을 비공개로 준비하고 차량에서 내 친구와 이어가요.",
    );
    if (s.publication === "private") root.append(myTripButton());
  }
  if (stage === "candidates") {
    root.append(
      node(
        "p",
        "시연 계획 기준 · 공통 시간 14:00~15:00 · 예상 추가 이동 7분. 장소와 만남은 아직 확정되지 않았어요.",
      ),
    );
    if (candidateDetail) {
      const candidate = s.social.candidates.find((c) => c.id === "B");
      if (candidate) {
        root.append(
          node("h3", "솔바람 · 공개 소개"),
          node("p", s.social.peer.description),
          node("p", "2026-11-14 · 강릉 해변권 · 공통 14:00~15:00 · 60분"),
        );
        action(
          root,
          "CONNECT_REQUEST",
          "솔바람에게 대화 연결 요청",
          "대화 연결은 통화·만남 동의와 별개예요. 상대 수락 후 공통 시간을 다시 확인해요.",
        );
      }
      const back = node("button", "후보 목록으로", "secondary");
      back.onclick = () => {
        candidateDetail = false;
        flowKey = null;
        render();
      };
      root.append(back);
    } else
      for (const candidate of s.social.candidates) {
        const card = node("article", null, "candidate");
        card.append(node("h3", candidate.name), node("p", candidate.reason));
        if (candidate.detailAvailable) {
          const detail = node("button", "솔바람 소개 보기");
          detail.onclick = () => {
            candidateDetail = true;
            flowKey = null;
            render();
          };
          card.append(detail);
        } else card.append(node("small", "비교용 요약"));
        root.append(card);
      }
    action(
      root,
      "PROFILE_PRIVATE",
      "내 친구와 여행 준비",
      "공개를 보류하고 본인 여행으로 이어가요.",
    );
  }
  if (stage === "connection") {
    root.append(
      node(
        "p",
        {
          requested: "솔바람님의 연결 응답을 기다리고 있어요.",
          accepted: "솔바람님도 연결을 수락했어요. 공통 시간을 확인해 주세요.",
          declined:
            "이번 연결은 성사되지 않았어요. 내 친구와 여행을 이어갈 수 있어요.",
          cancelled: "연결 요청을 취소했어요.",
          ended: "연결을 종료했어요.",
        }[con.status] || "연결 상태를 확인해 주세요.",
      ),
    );
    if (con.status === "accepted") {
      root.append(node("h3", "2026년 11월 14일 · 14:00~15:00"));
      action(
        root,
        "CONFIRM_WINDOW",
        "이 시간으로 최종 매칭 확인",
        "공통 시간 14:00~15:00에 대화 연결을 확인해요. 실제 만남 장소·시간은 차량에서 별도로 동의해요.",
      );
    }
    action(
      root,
      "CONNECT_CANCEL",
      "연결 요청 취소",
      "이 요청을 취소하고 내 친구와 여행을 이어가요.",
    );
    if (["declined", "cancelled", "ended"].includes(con.status))
      root.append(myTripButton());
  }
  if (stage === "transfer") {
    root.append(
      node(
        "p",
        con.status === "linked"
          ? `솔바람 · 대화 연결 확인 완료 · 14:00~15:00`
          : "내 친구와 본인 여행으로 이어가요.",
      ),
    );
    root.append(
      node(
        "p",
        "저장한 계획은 차량 기본 홈에서도 계속 볼 수 있어요. 만남 동의와 내비 승인은 차량에서 별도로 진행해요.",
      ),
    );
    if (s.handoff?.acknowledged)
      root.append(node("strong", "차량 수신 확인 완료"));
    action(
      root,
      "CONNECT_END",
      "연결 종료",
      "현재 연결을 종료해요. 본인 여행과 내 친구는 유지돼요.",
    );
  }
}
function publicPreview(s, fields) {
  const p = s.profile,
    v = p.privateSummary,
    a = [p.alias, p.avatarId === "a-01" ? "블루 드래곤" : "햇살 친구"];
  if (fields.has("interests") && v.interests.length)
    a.push(
      v.interests
        .map((i) => (i === "sea_walk" ? "바다 산책" : "카페"))
        .join(" · "),
    );
  if (fields.has("activityPreference") && v.activityPreference)
    a.push("산책 먼저 · 사진은 가끔");
  if (fields.has("pace") && v.pace) a.push("여유로운 여행");
  if (fields.has("conversationStyle") && v.conversationStyle)
    a.push("조용한 대화");
  if (fields.has("speakingStyle") && v.speakingStyle)
    a.push(
      v.speakingStyle === "calm"
        ? "차분하고 편안한 소개"
        : "가벼운 농담이 있는 소개",
    );
  if (fields.has("expressionPresetIds") && v.expressionPresetIds.length)
    a.push("조용히 함께하는 친구");
  return a.join(" / ");
}
function myTripButton() {
  const b = node("button", "내 친구와 여행 전달 준비");
  b.disabled = busy || !!api.pending || !online;
  b.onclick = prepareHandoff;
  return b;
}

try {
  await api.read();
  const scenario = await api.request("/api/scenario");
  consultation.available = !!scenario.capabilities?.aiConsultation;
  online = true;
  const p = api.state.profile;
  if (p) {
    aiDraftRevision = p.consultationRevision || 0;
    $("alias").value = p.alias;
    document.querySelector(`input[value="${p.avatarId}"]`).checked = true;
    const s = p.privateSummary;
    $("sea").checked = s.interests.includes("sea_walk");
    $("cafe").checked = s.interests.includes("cafe");
    $("activity").checked = !!s.activityPreference;
    $("pace").checked = !!s.pace;
    $("conversation").checked = !!s.conversationStyle;
    $("style").value = s.speakingStyle || "";
    $("expression").checked = !!s.expressionPresetIds.length;
    $("ai-introduction").value = p.introduction || "";
  }
  if (!p && api.state.consultation) applyAiDraft(false);
  restoreProfileDraft();
  await synchronizeReset();
  if (api.pending) await api.recover();
  status(
    localStorage.getItem("waymate.pending.v3") ||
      localStorage.getItem("waymate.pending.v2")
      ? "이전 버전 저장 요청은 보존했어요. v4에 자동 적용하지 않아요. 새 여행 준비를 시작해 주세요."
      : "서버에 연결됐어요. 내 이야기를 들려주세요.",
  );
  render();
} catch (e) {
  status(e.message || "서버 실행 상태를 확인해 주세요.");
}
setInterval(poll, POLL_MS);
document.addEventListener("visibilitychange", poll);

for (const radio of document.querySelectorAll("input[name=avatar]"))
  radio.addEventListener("change", () => {
    persistProfileDraft();
    render();
  });
