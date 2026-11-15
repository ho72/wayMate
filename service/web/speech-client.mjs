export function speechChunks(text, limit = 1500) {
  const remaining = [...text.replace(/\*\*/g, "").trim()];
  const result = [];
  while (remaining.length) {
    let end = Math.min(limit, remaining.length);
    if (end < remaining.length) {
      for (let i = end - 1; i >= Math.floor(limit / 2); i--) {
        if (/[\s.!?。]/u.test(remaining[i])) { end = i + 1; break; }
      }
    }
    const chunk = remaining.splice(0, end).join("").trim();
    if (chunk) result.push(chunk);
  }
  return result;
}

/** One response at a time; no automatic retries or automatic speech on new replies. */
export class ServerSpeech {
  constructor({ request, changed = () => {}, createAudio = () => new Audio(), urls = URL }) {
    Object.assign(this, { request, changed, createAudio, urls });
    this.generation = 0;
  }
  stop() {
    this.generation++;
    this.resume = null;
    this.controller?.abort();
    this.controller = null;
    this.audio?.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.audio = null;
    if (this.url) this.urls.revokeObjectURL(this.url);
    this.url = null;
    this.changed("idle");
  }
  async speak(text, voice, isCurrent = () => true) {
    if (this.controller && this.currentText === text && this.currentVoice === voice) {
      this.resume?.();
      return;
    }
    this.stop();
    this.currentText = text;
    this.currentVoice = voice;
    const generation = this.generation;
    const controller = this.controller = new AbortController();
    const current = () => generation === this.generation && !controller.signal.aborted && isCurrent();
    try {
      for (const chunk of speechChunks(text)) {
        if (!current()) return;
        this.changed("preparing");
        const blob = await this.request({ requestId: crypto.randomUUID(), text: chunk, voice, consent: true },
          AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
        if (!current()) return;
        const audio = this.audio = this.createAudio();
        this.url = this.urls.createObjectURL(blob);
        audio.src = this.url;
        await new Promise((resolve, reject) => {
          const aborted = () => { clean(); reject(new DOMException("Stopped", "AbortError")); };
          const clean = () => {
            controller.signal.removeEventListener("abort", aborted);
            audio.onended = audio.onerror = null;
          };
          audio.onended = () => { clean(); resolve(); };
          audio.onerror = () => { clean(); reject(new Error("음성을 재생하지 못했어요. 다시 듣기를 눌러 주세요.")); };
          controller.signal.addEventListener("abort", aborted, { once: true });
          this.resume = () => {
            if (!current()) { aborted(); return; }
            Promise.resolve(audio.play()).then(() => {
              if (current()) this.changed("speaking");
            }, (e) => {
              if (e.name === "NotAllowedError" && current()) this.changed("paused");
              else { clean(); reject(e); }
            });
          };
          this.resume();
        });
        if (!current()) return;
        this.urls.revokeObjectURL(this.url);
        this.url = null;
        this.audio = null;
      }
    } catch (e) {
      if (current()) {
        const message = e.name === "NotAllowedError"
          ? "브라우저가 자동 재생을 막았어요. 음성으로 듣기를 다시 눌러 주세요."
          : e.name === "TimeoutError" ? "음성 연결이 늦어지고 있어요. 다시 듣기를 눌러 주세요." : e.message;
        this.changed("error", message);
      }
    } finally {
      if (generation === this.generation) {
        this.audio?.pause();
        this.audio = null;
        if (this.url) this.urls.revokeObjectURL(this.url);
        this.url = null;
        this.controller = null;
        this.resume = null;
        this.changed("idle");
      }
    }
  }
}
