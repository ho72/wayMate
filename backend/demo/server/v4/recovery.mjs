import { fail } from "./handoff.mjs";

// No environment-restart procedure has yet proved termination of the old native operation.
// A fresh empty route or an operator checkbox must never substitute for that missing proof.
export const recoveryStatus = (actor) =>
  actor === "operator"
    ? {
        canConfirm: false,
        procedures: [],
        message:
          "등록·검증된 시험 환경 복구 절차가 없어 강제 확인할 수 없어요. 기존 실행의 실제 재조회·정리 보고가 필요해요.",
      }
    : null;
export function applyRecovery() {
  fail(
    423,
    "RECOVERY_REQUIRED",
    "등록된 복구 절차와 서버 발급 관측 증빙이 없어 해제할 수 없어요.",
  );
}
