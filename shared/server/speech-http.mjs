import { speechError as fail } from "./elevenlabs.mjs";

export async function speechJsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw fail(415, "JSON_REQUIRED", "JSON 본문이 필요해요.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw fail(413, "TOO_LARGE", "문장이 너무 길어요.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw fail(400, "INVALID_JSON", "JSON 본문을 확인해 주세요.");
  }
}

// Authentication and origin checks belong to each host's existing HTTP boundary.
export async function speechHttp({ req, res, speech, principal, assertAccess = () => {}, jsonBody = speechJsonBody }) {
  await assertAccess();
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(speech.config()));
  }
  const body = await jsonBody(req);
  const { audio, replayed } = await speech.synthesize(principal, body);
  // Session logout, device unpair, or demo reset can happen during generation.
  await assertAccess();
  if (res.destroyed) return;
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": audio.length,
    "Cache-Control": "no-store",
    "X-TTS-Provider": "elevenlabs",
    "X-TTS-Replayed": String(replayed),
  });
  res.end(audio);
}
