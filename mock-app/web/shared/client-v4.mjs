const KEY = "waymate.pending.v4";
export class DemoClient {
  constructor() {
    this.id = localStorage.getItem("waymate.clientId") || crypto.randomUUID();
    localStorage.setItem("waymate.clientId", this.id);
    this.state = null;
    this.observedRun = null;
    this.cleanedReset = null;
    this.requests = Promise.resolve();
    this.cancelRequest = JSON.parse(
      localStorage.getItem("waymate.cancel.v4") || "null",
    );
    this.pending = JSON.parse(localStorage.getItem(KEY) || "null");
  }
  request(path, body) {
    // Poll and user actions share one transport queue; an older response cannot overwrite a newer save.
    const result = this.requests.then(() => this.performRequest(path, body));
    this.requests = result.catch(() => {});
    return result;
  }
  async performRequest(path, body) {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        "X-Demo-Actor": "web",
        "X-Demo-Client-Id": this.id,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    const state =
      result.state || (path === "/api/state?view=web" ? result : null);
    if (
      state &&
      (state.schemaVersion !== 4 || state.scope !== "mobile-meeting-v4")
    ) {
      throw new Error(
        "이 서버 버전은 지원하지 않아요. 입력 초안과 미확인 요청을 보존했어요. v4 서버를 실행해 주세요.",
      );
    }
    if (state) {
      this.observeReset(state);
      this.state = state;
    }
    if (!response.ok) {
      const e = new Error(result.error?.message || "서버 오류");
      e.definitive = response.status < 500 || response.status === 500;
      throw e;
    }
    return result;
  }
  clearRunDrafts(runId) {
    for (const prefix of ["waymate.draft.v4", "waymate.profileDraft.v4"])
      localStorage.removeItem(`${prefix}.${this.id}.${runId}`);
  }
  observeReset(state) {
    const known = state.completedRunIds || [];
    // Older v4 clients did not persist a last-run pointer. The server's
    // completed runs are authoritative even on the first read after upgrade.
    if (this.observedRun !== state.runId) {
      for (const runId of known)
        if (runId !== state.runId) this.clearRunDrafts(runId);
      this.observedRun = state.runId;
      localStorage.setItem("waymate.lastRun.v4", state.runId);
    }
    for (const outgoing of [this.pending, this.cancelRequest])
      if (
        outgoing &&
        outgoing.runId !== state.runId &&
        known.includes(outgoing.runId)
      ) {
        this.clearRunDrafts(outgoing.runId);
        this.clear();
        break;
      }
    if (state.reset && this.cleanedReset !== state.reset.id) {
      this.clearRunDrafts(state.runId);
      this.cleanedReset = state.reset.id;
    }
  }
  prepareResetCleanup() {
    const s = this.state;
    if (!s?.reset) return;
    this.clearRunDrafts(s.runId);
    if (
      this.pending?.type !== "RESET_ACK" &&
      (!this.pending || this.pending.runId === s.runId)
    )
      this.clear();
  }
  async read() {
    return (this.state = await this.request("/api/state?view=web"));
  }
  clear() {
    this.pending = null;
    localStorage.removeItem(KEY);
    this.cancelRequest = null;
    localStorage.removeItem("waymate.cancel.v4");
  }
  async recover() {
    if (!this.pending && !this.cancelRequest) return true;
    const outgoing = this.cancelRequest || this.pending;
    const r = await this.request(
      `/api/commands/${outgoing.commandId}?runId=${outgoing.runId}`,
    );
    if (r.status === "applied") {
      this.clear();
      return true;
    }
    return false;
  }
  async sendPending() {
    try {
      const r = await this.request(
        "/api/commands",
        this.cancelRequest || this.pending,
      );
      this.clear();
      return r;
    } catch (e) {
      if (e.definitive) {
        if (this.cancelRequest) {
          this.cancelRequest = null;
          localStorage.removeItem("waymate.cancel.v4");
        } else this.clear();
      }
      throw e;
    }
  }
  async cancelPending() {
    if (!this.pending || this.pending.type !== "CONNECT_REQUEST")
      throw new Error("취소할 연결 요청이 없어요.");
    if (!this.cancelRequest) {
      await this.read();
      if (!this.pending || this.state.reset || this.state.recovery)
        throw new Error(
          "초기화로 요청이 종료됐어요. 현재 회차를 확인해 주세요.",
        );
      this.cancelRequest = {
        schemaVersion: 4,
        runSeq: this.state.runSeq,
        runId: this.state.runId,
        commandId: crypto.randomUUID(),
        expectedVersion: this.state.version,
        actor: "web",
        type: "CANCEL_PENDING_COMMAND",
        target: {},
        payload: {
          originalCommandId: this.pending.commandId,
          originalType: this.pending.type,
        },
      };
      localStorage.setItem(
        "waymate.cancel.v4",
        JSON.stringify(this.cancelRequest),
      );
    }
    return this.sendPending();
  }
  async command(type, payload, target = {}) {
    if (this.pending) throw new Error("이전 저장 결과를 먼저 확인해 주세요.");
    await this.read();
    if ((this.state.reset || this.state.recovery) && type !== "RESET_ACK")
      throw new Error("초기화 정리를 먼저 확인해 주세요.");
    this.pending = {
      schemaVersion: 4,
      runSeq: this.state.runSeq,
      runId: this.state.runId,
      commandId: crypto.randomUUID(),
      expectedVersion: this.state.version,
      actor: "web",
      type,
      target,
      payload,
    };
    localStorage.setItem(KEY, JSON.stringify(this.pending));
    return this.sendPending();
  }
}
