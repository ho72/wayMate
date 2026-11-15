import { DemoClient } from "./shared/client.mjs";
import {
  POLL_MS,
  QUESTIONS,
  questionOrder,
  FOOD_CUE,
  emptySummary,
} from "/protocol.mjs";
const api = new DemoClient(),
  $ = (id) => document.getElementById(id);
let busy = false,
  polling = false,
  online = false,
  editing = null,
  currentQuestion = null,
  inputSource = "typed",
  exampleText = null,
  historyKey = null;
const status = (text) => {
  $("status").textContent = text;
};
function draftKey() {
  return `waymate.draft.v3.${api.id}.${api.state?.runId}`;
}
function answerRevision() {
  return Math.max(
    0,
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
  document.querySelector(".character").hidden =
    document.querySelector("input[name=avatar]:checked").value !== "a-01";
  const owns = !s.clientId || s.clientId === api.id,
    active = !!s.vehicleActivation,
    locked = busy || !!api.pending || !online || !owns || active;
  const order = questionOrder(s.onboarding),
    next = editing || order.find((k) => !s.onboarding[k]);
  const historyVersion = JSON.stringify([s.onboarding, locked]);
  if (historyVersion !== historyKey) {
    historyKey = historyVersion;
    $("history").replaceChildren();
    for (const id of order) {
      const a = s.onboarding[id];
      if (!a) continue;
      const wrap = document.createElement("div");
      wrap.className = "chat-answer";
      const q = document.createElement("p");
      q.textContent = QUESTIONS[id].prompt;
      const raw = document.createElement("p");
      raw.className = "raw";
      raw.textContent = a.answerText;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "답변 수정";
      edit.disabled = locked;
      edit.onclick = () => {
        preserveDraft();
        editing = id;
        render();
        $("answer").focus();
      };
      wrap.append(q, raw, edit);
      $("history").append(wrap);
    }
  }
  showQuestion(next);
  $("answer-form").hidden = !next || !owns || active;
  for (const el of $("answer-form").elements) el.disabled = locked;
  $("food-example").hidden = currentQuestion !== "interests";
  for (const el of $("profile-form").elements) el.disabled = locked;
  $("save").disabled = locked || !s.allowedActions.includes("PROFILE_CONFIRM");
  $("save-trip").disabled = locked || !s.allowedActions.includes("TRIP_SAVE");
  $("prepare").disabled =
    locked || !s.allowedActions.includes("HANDOFF_PREPARE");
  $("recover").hidden = !api.pending;
  $("retry").hidden = !api.pending;
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
    $("confirmed").checked = false;
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
  $("confirmed").checked = false;
  status("소개값을 모두 비웠어요. 원문 확인 후 소개를 저장해 주세요.");
};
$("profile-form").onsubmit = (e) => {
  e.preventDefault();
  const alias = $("alias").value.normalize("NFC").trim();
  if (!alias || [...alias].length > 10 || /[\r\n]/.test(alias)) {
    status("별명은 줄바꿈 없이 1~10자로 입력해 주세요.");
    return;
  }
  const summary = emptySummary();
  summary.interests = ["sea", "cafe"]
    .filter((id) => $(id).checked)
    .map((id) => (id === "sea" ? "sea_walk" : "cafe"));
  summary.activityPreference = $("activity").checked
    ? "walk_first_photos_occasional"
    : null;
  summary.pace = $("pace").checked ? "relaxed" : null;
  summary.conversationStyle = $("conversation").checked ? "quiet" : null;
  summary.speakingStyle = $("style").value || null;
  summary.expressionPresetIds = $("expression").checked
    ? ["quiet-companion"]
    : [];
  work(async () => {
    await api.command("PROFILE_CONFIRM", {
      alias,
      avatarId: document.querySelector("input[name=avatar]:checked").value,
      confirmedSummary: summary,
    });
    status("직접 확인한 소개값만 저장했어요. 여행 계획도 확인해 주세요.");
  });
};
$("save-trip").onclick = () =>
  work(async () => {
    await api.command("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
    status("여행 계획을 저장했어요.");
  });
$("prepare").onclick = () =>
  work(async () => {
    await api.command("HANDOFF_PREPARE", { mode: "prepared_trip" });
    status("전달 준비를 저장했어요. 차량에서 불러오기를 눌러 주세요.");
  });
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
async function poll() {
  if (polling || busy || document.hidden) return;
  polling = true;
  try {
    const was = online;
    await api.read();
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
try {
  await api.read();
  online = true;
  const p = api.state.profile;
  if (p) {
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
  }
  if (api.pending) await api.recover();
  status(
    localStorage.getItem("waymate.pending.v2")
      ? "이전 v2 저장 요청은 보존했어요. v3에 자동 적용하지 않아요. 새 여행 준비를 시작해 주세요."
      : "서버에 연결됐어요. 내 이야기를 들려주세요.",
  );
  render();
} catch (e) {
  status(e.message || "서버 실행 상태를 확인해 주세요.");
}
setInterval(poll, POLL_MS);
document.addEventListener("visibilitychange", poll);

for (const radio of document.querySelectorAll("input[name=avatar]"))
  radio.addEventListener("change", render);
