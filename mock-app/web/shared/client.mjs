const KEY = "waymate.pending.v2";
export class DemoClient {
  constructor() {
    this.id = localStorage.getItem("waymate.clientId") || crypto.randomUUID();
    localStorage.setItem("waymate.clientId", this.id);
    this.state = null;
    this.requests = Promise.resolve();
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
    if (result.state) this.state = result.state;
    if (!response.ok) {
      const e = new Error(result.error?.message || "서버 오류");
      e.definitive = response.status < 500 || response.status === 500;
      throw e;
    }
    return result;
  }
  async read() {
    return (this.state = await this.request("/api/state?view=web"));
  }
  clear() {
    this.pending = null;
    localStorage.removeItem(KEY);
  }
  async recover() {
    if (!this.pending) return true;
    const r = await this.request(
      `/api/commands/${this.pending.commandId}?runId=${this.pending.runId}`,
    );
    if (r.status === "applied") {
      this.clear();
      return true;
    }
    return false;
  }
  async sendPending() {
    try {
      const r = await this.request("/api/commands", this.pending);
      this.clear();
      return r;
    } catch (e) {
      if (e.definitive) this.clear();
      throw e;
    }
  }
  async command(type, payload) {
    if (this.pending) throw new Error("이전 저장 결과를 먼저 확인해 주세요.");
    await this.read();
    this.pending = {
      schemaVersion: 2,
      runSeq: this.state.runSeq,
      runId: this.state.runId,
      commandId: crypto.randomUUID(),
      expectedVersion: this.state.version,
      actor: "web",
      type,
      target: {},
      payload,
    };
    localStorage.setItem(KEY, JSON.stringify(this.pending));
    return this.sendPending();
  }
}
