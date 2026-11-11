import { fileURLToPath } from "node:url";
import { startServer } from "./v4/http.mjs";
const file =
  process.env.WAYMATE_STATE_FILE ||
  fileURLToPath(new URL("../runtime/state-v4.json", import.meta.url));
try {
  const app = await startServer({ file });
  console.log(
    `wayMate 준비 완료: http://127.0.0.1:${app.port} (v4 모바일 연결·차량 만남)`,
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
