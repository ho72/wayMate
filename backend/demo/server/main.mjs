import { fileURLToPath } from "node:url";
import { startServer } from "./v4/http.mjs";
import { aiFromEnvironment } from "./ai/openai.mjs";
import { vehicleDialogueFromEnvironment } from "./ai/vehicle-dialogue.mjs";
import { elevenLabsFromEnvironment } from "../../../shared/server/elevenlabs.mjs";
const file =
  process.env.WAYMATE_STATE_FILE ||
  fileURLToPath(new URL("../runtime/state-v4.json", import.meta.url));
try {
  const port = Number(process.env.WAYMATE_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("WAYMATE_PORT는 1024~65535 정수여야 합니다.");
  const app = await startServer({
    file,
    port,
    aiProvider: aiFromEnvironment(),
    dialogueProvider: vehicleDialogueFromEnvironment(),
    dialogueMaxCalls: Number(process.env.WAYMATE_DIALOGUE_MAX_CALLS || 3),
    speechProvider: elevenLabsFromEnvironment(),
  });
  console.log(
    `두루밋 준비 완료: http://127.0.0.1:${app.port} (v4 모바일 연결·차량 만남)`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
} catch (e) {
  console.error(
    `시작 실패: ${e.message}. 기존 상태·lock 파일을 확인하세요. 자동 초기화하지 않습니다.`,
  );
  process.exitCode = 1;
}
