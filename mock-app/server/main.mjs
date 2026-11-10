import { fileURLToPath } from "node:url";
import { startServer } from "./http/server.mjs";
const file = fileURLToPath(new URL("../runtime/state.json", import.meta.url));
try {
  const app = await startServer({ file });
  console.log(
    `wayMate 준비 완료: http://127.0.0.1:${app.port} (본인 여행 전달)`,
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
