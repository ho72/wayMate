// Server-only adapter. Never import this module into a web or Android bundle.
export const speechError = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

export function elevenLabsFromEnvironment(env = process.env, fetchImpl = fetch) {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  const voices = {
    default: voiceId,
    dragon: env.ELEVENLABS_VOICE_DRAGON?.trim() || voiceId,
    bear: env.ELEVENLABS_VOICE_BEAR?.trim() || voiceId,
    mocha: env.ELEVENLABS_VOICE_MOCHA?.trim() || env.ELEVENLABS_VOICE_BEAR?.trim() || voiceId,
  };
  if (!voiceId || Object.values(voices).some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id)))
    throw new Error("ELEVENLABS_VOICE_ID and character voice IDs must be valid voice IDs");
  const model = env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(model))
    throw new Error("Invalid ELEVENLABS_MODEL_ID");
  return {
    name: "elevenlabs",
    voices: Object.keys(voices),
    async synthesize({ text, voice, signal }) {
      const response = await fetchImpl(
        `https://api.elevenlabs.io/v1/text-to-speech/${voices[voice]}?output_format=mp3_44100_128`,
        {
          method: "POST",
          redirect: "error",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: model }),
          signal,
        },
      );
      if (!response.ok) {
        // Provider bodies can contain submitted text or account details.
        await response.body?.cancel();
        if (response.status === 402)
          throw speechError(503, "TTS_PAYMENT_REQUIRED", "현재 ElevenLabs 계정에서 이 목소리를 API로 사용할 수 없어요. 요금제와 크레딧 한도를 확인해 주세요.");
        if (response.status === 429)
          throw speechError(503, "TTS_PROVIDER_BUSY", "음성 서비스가 바빠요. 잠시 후 새 요청으로 시도해 주세요.");
        throw speechError(502, "TTS_PROVIDER_ERROR", "음성 서비스 연결 설정 또는 이용 상태를 확인해 주세요.");
      }
      if (!/^audio\/(mpeg|mp3)(?:;|$)/i.test(response.headers.get("content-type") || "") || !response.body) {
        await response.body?.cancel();
        throw speechError(502, "TTS_INVALID_AUDIO", "음성 서비스에서 올바른 MP3를 받지 못했어요.");
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024)
          throw speechError(502, "TTS_AUDIO_TOO_LARGE", "생성한 음성이 너무 커요. 문장을 나눠 주세요.");
        chunks.push(chunk);
      }
      if (!bytes) throw speechError(502, "TTS_INVALID_AUDIO", "생성한 음성이 비어 있어요.");
      return Buffer.concat(chunks);
    },
  };
}
