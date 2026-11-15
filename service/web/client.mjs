export { ServerSpeech } from "./speech-client.mjs";
export { CHARACTERS, character } from "../shared/characters.mjs";
export class ServiceClient {
  constructor({
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.storage = storage;
    this.fetch = fetchImpl.bind(globalThis);
    this.userId = null;
    this.csrf = null;
    this.epoch = 0;
  }
  identity(user, csrf) {
    if (this.userId !== (user?.id || null) || this.csrf !== (csrf || null))
      this.epoch++;
    this.userId = user?.id || null;
    this.csrf = csrf || null;
  }
  async request(path, body, method = body === undefined ? "GET" : "POST") {
    const epoch = this.epoch;
    const response = await this.fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (epoch !== this.epoch)
      throw Object.assign(
        new Error("계정이 바뀌었어요. 현재 화면에서 이어가 주세요."),
        { code: "SESSION_CHANGED" },
      );
    if (!response.ok)
      throw Object.assign(
        new Error(data.error?.message || "연결을 다시 확인해 주세요."),
        { status: response.status, code: data.error?.code },
      );
    return data;
  }
  async speech(body, signal) {
    const epoch = this.epoch;
    const response = await this.fetch("/api/tts", {
      method: "POST", credentials: "same-origin", signal,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.csrf },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || "음성 서비스에 연결하지 못했어요.");
    }
    if (!/^audio\/mpeg(?:;|$)/i.test(response.headers.get("content-type") || ""))
      throw new Error("음성 응답을 확인해 주세요.");
    const blob = await response.blob();
    if (epoch !== this.epoch) throw new Error("계정이 바뀌었어요. 현재 화면에서 다시 들어 주세요.");
    return blob;
  }
  vehiclePendingKey(deviceId, owner = this.userId) {
    return `waymate.service.vehicle-pending.${owner}.${deviceId}`;
  }
  vehiclePending(deviceId) {
    try {
      return JSON.parse(
        this.storage.getItem(this.vehiclePendingKey(deviceId)) || "null",
      );
    } catch {
      return null;
    }
  }
  async sendVehicle(deviceId, body) {
    if (this.vehiclePending(deviceId))
      throw Object.assign(
        new Error("먼저 이전 여행의 전송 결과를 확인해 주세요."),
        { code: "VEHICLE_PENDING" },
      );
    this.storage.setItem(
      this.vehiclePendingKey(deviceId),
      JSON.stringify(body),
    );
    return this.resolveVehicle(deviceId);
  }
  async resolveVehicle(deviceId) {
    const body = this.vehiclePending(deviceId),
      owner = this.userId;
    if (!body) throw new Error("확인할 전송 요청이 없어요.");
    try {
      const result = await this.request(
        `/api/vehicles/${deviceId}/deliveries`,
        body,
      );
      this.storage.removeItem(this.vehiclePendingKey(deviceId, owner));
      return result;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429)
        this.storage.removeItem(this.vehiclePendingKey(deviceId, owner));
      throw e;
    }
  }
  pendingKey(chatId) {
    return `waymate.service.pending.${this.userId}.${chatId}`;
  }
  pending(chatId) {
    try {
      return JSON.parse(
        this.storage.getItem(this.pendingKey(chatId)) || "null",
      );
    } catch {
      return null;
    }
  }
  async send(chat, message) {
    if (this.pending(chat.id))
      throw new Error("먼저 이전 메시지의 전송 결과를 확인해 주세요.");
    const body = {
      requestId: crypto.randomUUID(),
      message,
      expectedVersion: chat.version,
    };
    this.storage.setItem(this.pendingKey(chat.id), JSON.stringify(body));
    return this.resolve(chat.id);
  }
  async resolve(chatId) {
    const body = this.pending(chatId);
    if (!body) throw new Error("확인할 전송 요청이 없어요.");
    const owner = this.userId;
    try {
      const result = await this.request(`/api/chats/${chatId}/messages`, body);
      this.storage.removeItem(`waymate.service.pending.${owner}.${chatId}`);
      return result;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429)
        this.storage.removeItem(`waymate.service.pending.${owner}.${chatId}`);
      throw e;
    }
  }
}
