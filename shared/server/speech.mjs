import { createHash } from "node:crypto";
import { speechError as fail } from "./elevenlabs.mjs";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const TTL = 5 * 60_000;
const MAX_AUDIO = 8 * 1024 * 1024;

export function speechService(provider = null, { timeoutMs = 25_000, now = Date.now } = {}) {
  const requests = new Map(), active = new Map();
  let closed = false, cacheBytes = 0;
  let windowStart = now(), total = 0;
  const counts = new Map();
  function prune() {
    const time = now();
    for (const [key, entry] of requests) {
      if (entry.done && entry.until <= time) {
        requests.delete(key);
        cacheBytes -= entry.bytes || 0;
      }
    }
    if (time - windowStart >= 60_000) {
      windowStart = time;
      total = 0;
      counts.clear();
    }
  }
  const config = () => ({
    available: !!provider && !closed,
    provider: "elevenlabs",
    voices: provider?.voices || [],
    contentType: "audio/mpeg",
    maxCharacters: 2000,
    consentRequired: true,
    replayWindowSeconds: TTL / 1000,
  });
  return {
    config,
    async synthesize(principal, body) {
      if (closed) throw fail(503, "TTS_UNAVAILABLE", "음성 서버가 종료 중이에요.");
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some((k) => !["requestId", "text", "voice", "consent"].includes(k)) ||
          typeof body.requestId !== "string" || !UUID.test(body.requestId) || typeof body.text !== "string" ||
          !body.text.trim() || [...body.text].length > 2000 ||
          (body.voice !== undefined && typeof body.voice !== "string"))
        throw fail(422, "TTS_INVALID_INPUT", "요청 ID와 1~2,000자 문장을 확인해 주세요.");
      if (body.consent !== true)
        throw fail(403, "TTS_CONSENT_REQUIRED", "낭독할 문장을 ElevenLabs에 보내는 데 동의해 주세요.");
      if (!provider) throw fail(503, "TTS_NOT_CONFIGURED", "서버의 ElevenLabs 키와 보이스를 설정해 주세요.");
      const voice = body.voice ?? "default";
      if (!provider.voices.includes(voice))
        throw fail(422, "TTS_INVALID_VOICE", "사용할 수 없는 목소리예요.");
      prune();
      const key = JSON.stringify([principal, body.requestId]);
      const fingerprint = createHash("sha256").update(JSON.stringify([body.text, voice])).digest("hex");
      const hit = requests.get(key);
      if (hit) {
        if (hit.fingerprint !== fingerprint)
          throw fail(409, "TTS_REQUEST_ID_REUSED", "같은 요청 ID의 문장이나 목소리를 바꿀 수 없어요.");
        return { audio: await hit.promise, replayed: true };
      }
      // Keep unexpired success/failure receipts; never evict them to make a paid retry.
      if (requests.size >= 64 || cacheBytes >= 32 * 1024 * 1024 ||
          active.size >= 4 || [...active.values()].some((e) => e.principal === principal))
        throw fail(429, "TTS_BUSY", "음성을 준비 중이에요. 잠시 후 다시 시도해 주세요.");
      if (total >= 60 || (counts.get(principal) || 0) >= 20)
        throw fail(429, "TTS_RATE_LIMITED", "음성 요청이 많아요. 잠시 후 다시 시도해 주세요.");
      total++;
      counts.set(principal, (counts.get(principal) || 0) + 1);
      const controller = new AbortController();
      const entry = { fingerprint, principal, controller, done: false };
      requests.set(key, entry);
      active.set(key, entry);
      entry.promise = (async () => {
        let timer, onAbort;
        try {
          const aborted = new Promise((_, reject) => {
            onAbort = () => reject(controller.signal.reason);
            controller.signal.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => controller.abort(
              fail(504, "TTS_TIMEOUT", "음성 생성이 늦어지고 있어요.")), timeoutMs);
          });
          const audio = await Promise.race([
            Promise.resolve().then(() => provider.synthesize({ text: body.text, voice, signal: controller.signal })),
            aborted,
          ]);
          if (!Buffer.isBuffer(audio) || !audio.length || audio.length > MAX_AUDIO)
            throw fail(502, "TTS_INVALID_AUDIO", "음성 서비스 응답을 확인해 주세요.");
          // Completed audio is bounded separately from at most 4 x MAX_AUDIO in flight.
          if (cacheBytes + audio.length > 32 * 1024 * 1024)
            throw fail(503, "TTS_CACHE_FULL", "음성 보관 공간이 가득 찼어요. 잠시 후 다시 시도해 주세요.");
          entry.bytes = audio.length;
          cacheBytes += audio.length;
          return audio;
        } catch (e) {
          if (e?.code?.startsWith("TTS_") && e.status) throw e;
          throw fail(502, "TTS_PROVIDER_ERROR", "음성 서비스에 연결하지 못했어요.");
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", onAbort);
          active.delete(key);
          entry.done = true;
          entry.until = now() + TTL;
        }
      })();
      return { audio: await entry.promise, replayed: false };
    },
    async close() {
      closed = true;
      const pending = [...active.values()];
      for (const e of pending) e.controller.abort(fail(503, "TTS_UNAVAILABLE", "음성 서버가 종료 중이에요."));
      await Promise.allSettled(pending.map((e) => e.promise));
      requests.clear();
      cacheBytes = 0;
    },
  };
}
