const LABELS = { MEETING_START: "만남 시작으로 이동", MEETING_END: "만남 종료 · 선택 열기",
  REPLAY_FINAL: "다른 결말 다시 시연", B_FINAL_TOGETHER: "상대도 함께 여행", B_FINAL_MY_AGENT: "상대는 각자 여행" };
const escape = value => String(value).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]);
export function scenarioControls(state) {
  const controls = Object.entries(LABELS).filter(([key]) => state.actionBindings?.[key])
    .map(([key, label]) => `<button class="outline-button journey-button" data-action="journey-operate" data-key="${key}">${label}</button>`);
  const attempt = state.mockNavigation?.attempts.find(x => ["pending", "unknown"].includes(x.outcome));
  if (attempt) {
    const success = attempt.operation === "add" ? "applied" : "removed";
    controls.unshift(`<p>운전자가 승인한 모의 경유지 ${attempt.operation === "add" ? "추가" : "제거"} 결과를 선택해요. 실제 내비 결과는 바꾸지 않아요.</p>`);
    for (const [outcome, label] of [[success, "모의 반영 확인"], ["failed", "모의 실패"], ["unknown", "모의 결과 미확인"]])
      controls.push(`<button class="outline-button journey-button" data-action="journey-operate" data-attempt="${escape(attempt.attemptId)}" data-outcome="${outcome}">${label}</button>`);
  }
  return controls.length ? `<div class="page journey-page"><section class="journey-card"><h2>차량 시연 진행</h2><div class="journey-operator-actions">${controls.join("")}</div></section></div>` : "";
}
export function scenarioOperation(state, dataset) {
  if (Object.hasOwn(LABELS, dataset.key)) return state.actionBindings?.[dataset.key] ?? null;
  const attempt = state.mockNavigation?.attempts.find(x => x.attemptId === dataset.attempt && ["pending", "unknown"].includes(x.outcome));
  if (!attempt || !["failed", "unknown", attempt.operation === "add" ? "applied" : "removed"].includes(dataset.outcome)) return null;
  return { commandType: "NAV_MOCK_RESULT", target: { attemptId: attempt.attemptId, operation: attempt.operation }, payload: { outcome: dataset.outcome } };
}
