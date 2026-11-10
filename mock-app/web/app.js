import { DemoClient } from "./shared/client.mjs";
import { POLL_MS, summaryFromAnswers } from "/protocol.mjs";
const api = new DemoClient(),
  $ = (id) => document.getElementById(id);
let busy = false,
  polling = false,
  online = false;
const status = (text) => {
  $("status").textContent = text;
};
function render() {
  const s = api.state;
  if (!s) return;
  const owns = !s.clientId || s.clientId === api.id;
  const locked = busy || !!api.pending || !online || !owns;
  $("save").disabled = locked;
  $("prepare").disabled =
    locked || !s.allowedActions.includes("HANDOFF_PREPARE");
  for (const el of $("profile-form").elements)
    if (el.id !== "save") el.disabled = busy || !!api.pending || !owns;
  $("recover").hidden = !api.pending;
  $("retry").hidden = !api.pending;
  if (!owns) {
    status(
      "다른 브라우저에서 준비 중인 여행입니다. 해당 브라우저를 사용해 주세요.",
    );
    return;
  }
  if (s.handoff?.acknowledged) {
    $("delivery-title").textContent = "차량에서 수신을 확인했어요";
    $("delivery-detail").textContent =
      `${s.profile.alias}님의 여행을 차량에서 확인했어요.`;
    $("prepare").textContent = "전달 상태 다시 확인";
  } else if (s.handoff) {
    $("delivery-title").textContent = "차량에서 불러오기를 눌러 주세요";
    $("delivery-detail").textContent =
      `${s.profile.alias}님의 여행이 준비됐어요. 차량 확인을 기다리고 있어요.`;
    $("prepare").textContent = "전달 준비 확인";
  } else {
    $("delivery-title").textContent =
      s.profile && s.trip
        ? "저장했어요. 차량에 전달할까요?"
        : "저장 후 차량으로 전달해요";
    $("delivery-detail").textContent =
      "차량 수신 확인 전에는 전달 완료로 표시하지 않아요.";
    $("prepare").textContent = "차량에 전달 준비";
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
        ? "저장 결과를 확인 중이에요. 결과 확인 후 필요하면 같은 요청을 다시 전송해 주세요."
        : e.message,
    );
  } finally {
    busy = false;
    render();
  }
}
$("profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const alias = $("alias").value.normalize("NFC").trim();
  if (!alias || [...alias].length > 10 || /[\r\n]/.test(alias)) {
    status("별명은 줄바꿈 없이 1~10자로 입력해 주세요.");
    return;
  }
  work(async () => {
    status("프로필과 여행을 저장하고 있어요.");
    const answers = {
      interests: $("interests").value,
      activity: "walk_first_photos_occasional",
      pace: "relaxed",
      conversation: "quiet",
    };
    for (const [questionId, answerPresetId] of Object.entries(answers))
      await api.command("ONBOARDING_ANSWER", { questionId, answerPresetId });
    await api.command("PROFILE_CONFIRM", {
      alias,
      avatarId: document.querySelector("input[name=avatar]:checked").value,
      speakingStyle: $("style").value,
      summary: summaryFromAnswers(answers),
    });
    await api.command("PROFILE_PRIVATE", {
      profileVersion: api.state.profileVersion,
      publicationVersion: api.state.publicationVersion,
    });
    await api.command("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
    status("프로필과 여행을 서버에 저장했어요.");
  });
});
$("prepare").onclick = () =>
  work(async () => {
    await api.command("HANDOFF_PREPARE", { mode: "my_trip" });
    status("전달 준비를 저장했어요. 차량에서 내 여행 불러오기를 눌러 주세요.");
  });
$("recover").onclick = () =>
  work(async () => {
    status(
      (await api.recover())
        ? "저장 결과를 확인했어요. 현재 상태에서 계속 진행해 주세요."
        : "아직 영수증이 없어요. 같은 요청을 다시 전송할 수 있어요.",
    );
  });
$("retry").onclick = () =>
  work(async () => {
    if (await api.recover()) {
      status("이미 저장된 요청을 확인했어요.");
      return;
    }
    await api.sendPending();
    status("같은 요청의 저장 결과를 확인했어요.");
  });
async function poll() {
  if (polling || busy || document.hidden) return;
  polling = true;
  try {
    const wasOnline = online;
    await api.read();
    online = true;
    if (!wasOnline)
      status("서버에 다시 연결됐어요. 현재 저장 상태를 확인했어요.");
    render();
  } catch {
    online = false;
    status("서버 연결을 확인해 주세요. 저장 완료로 처리하지 않았어요.");
    render();
  } finally {
    polling = false;
  }
}
try {
  await api.read();
  online = true;
  const s = api.state;
  if (s.profile) {
    $("alias").value = s.profile.alias;
    $("style").value = s.profile.speakingStyle;
    document.querySelector(`input[value="${s.profile.avatarId}"]`).checked =
      true;
  }
  if (s.answers.interests) $("interests").value = s.answers.interests;
  if (api.pending) {
    status(
      (await api.recover())
        ? "이전 저장을 확인했어요."
        : "이전 요청의 결과가 아직 확인되지 않았어요.",
    );
  } else status("서버에 연결됐어요. 내 여행을 준비해 주세요.");
  render();
} catch {
  status("서버에 연결하지 못했어요. 서버 실행 상태를 확인해 주세요.");
}
setInterval(poll, POLL_MS);
document.addEventListener("visibilitychange", poll);
