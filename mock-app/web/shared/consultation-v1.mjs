/** Private browser outbox: retries retain the exact request ID, run and revision. */
export class ConsultationClient {
  constructor(api) {
    this.api = api;
    this.available = false;
  }
  key() {
    return `waymate.consultation.v1.${this.api.id}.${this.api.state.runId}`;
  }
  local() {
    try {
      return JSON.parse(localStorage.getItem(this.key()) || "{}");
    } catch {
      return {};
    }
  }
  save(value) {
    localStorage.setItem(this.key(), JSON.stringify(value));
  }
  get enabled() {
    return !!this.api.state?.consultation || !!this.local().enabled;
  }
  enable() {
    this.save({ enabled: true, draft: "" });
  }
  get pending() {
    return this.local().pending || null;
  }
  get draft() {
    return this.local().draft || "";
  }
  setDraft(draft) {
    this.save({ ...this.local(), draft });
  }
  useDemo() {
    if (this.pending || this.api.state.consultation)
      throw new Error("먼저 AI 응답의 저장 결과를 확인해 주세요.");
    const draft = this.draft;
    this.save({ enabled: false, draft });
    return draft;
  }
  observe() {
    const pending = this.pending;
    if (
      pending &&
      this.api.state.consultation?.turns.some(
        (t) => t.requestId === pending.requestId,
      )
    )
      this.save({ enabled: true, draft: "" });
  }
  async send(message) {
    const current = this.pending;
    const request = current || {
      runId: this.api.state.runId,
      requestId: crypto.randomUUID(),
      expectedRevision: this.api.state.consultation?.revision || 0,
      message,
      consent: true,
    };
    if (!current)
      this.save({ enabled: true, draft: message, pending: request });
    try {
      const result = await this.api.request("/api/consultation/turns", request);
      // A reset response may have moved the browser to another run while the request was pending.
      if (this.api.state.runId === request.runId)
        this.save({ enabled: true, draft: "" });
      return result;
    } catch (error) {
      if (error.definitive && this.api.state.runId === request.runId)
        this.save({ enabled: true, draft: request.message });
      throw error;
    }
  }
}
