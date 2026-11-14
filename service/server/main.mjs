import { resolve } from "node:path";
import { startService } from "./http.mjs";
import { openAIAgent } from "./agent.mjs";
try {
  const port = Number(process.env.SERVICE_PORT || 3004),
    host = process.env.SERVICE_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid SERVICE_PORT");
  const origin =
    process.env.SERVICE_PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    throw new Error("Production requires an HTTPS public origin");
  const app = await startService({
    port,
    host,
    origin,
    file: resolve(process.env.SERVICE_DB_PATH || "runtime/waymate.sqlite"),
    agent: openAIAgent({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    }),
  });
  console.log(`말이통행 서비스 준비 완료: ${origin}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
} catch (e) {
  console.error(
    "서비스 시작 실패:",
    e.status
      ? e.code
      : e.message.startsWith("OPENAI_API_KEY")
        ? "서버 API 키를 설정해 주세요."
        : e.code || e.name,
  );
  process.exitCode = 1;
}
