import { guardFinalReplay, interruptFinal, recordStoryCue } from "./ending.mjs";
import { applyRecovery } from "./recovery.mjs";
import { initialState, serializeStore } from "./state.mjs";
import {
  applyReset,
  finishReset,
  guardDuringReset,
  findReceipt,
  applyArchivedReport,
} from "./reset.mjs";
import { cancelPending } from "./social.mjs";
import { isDeepStrictEqual } from "node:util";
import { atomicSave } from "../store.mjs";
import { assertContract } from "./validation.mjs";
import { apply, fail, fresh, approval } from "./handoff.mjs";
import { validateStore } from "./state.mjs";
import { applyNavigation } from "./navigation.mjs";
import { project } from "./projection.mjs";
export function coordinator(
  file,
  initial,
  { now = () => performance.now(), fault } = {},
) {
  let state = initial,
    queue = Promise.resolve(),
    unavailable = false,
    booting = true,
    accepting = true;
  const cloneState = () => ({
    ...structuredClone({ ...state, receipts: {}, resetHistory: [] }),
    receipts: { ...state.receipts },
    resetHistory: state.resetHistory || [],
  });
  // A monotonic timestamp from a previous process cannot grant vehicle permission.

  const serial = (fn) => {
    if (!accepting)
      return Promise.reject(
        Object.assign(new Error("서버가 종료 중입니다."), {
          status: 503,
          code: "UNAVAILABLE",
        }),
      );
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  async function save(next) {
    try {
      await atomicSave(file, next, fault, serializeStore);
      state = next;
    } catch (e) {
      if (e.uncertain) unavailable = true;
      fail(
        e.uncertain ? 503 : 500,
        e.uncertain ? "UNAVAILABLE" : "STORE_FAILED",
        "저장 결과를 확인할 수 없습니다.",
      );
    }
  }
  async function expire() {
    if (unavailable) fail(503, "UNAVAILABLE", "서버 저장소 복구가 필요합니다.");
    if (booting) {
      if (
        state.navigation?.observation ||
        state.vehicle.seenAt !== null ||
        state.vehicle.restrictionKnown ||
        state.vehicle.foreground
      ) {
        const next = cloneState();
        if (next.navigation) next.navigation.observation = null;
        next.vehicle.seenAt = null;
        next.vehicle.restrictionKnown = false;
        next.vehicle.foreground = false;
        next.version++;
        await save(next);
      }
      booting = false;
    }
    if (state.vehicle.seenAt !== null && !fresh(state, now())) {
      const next = cloneState();
      next.vehicle.seenAt = null;
      next.vehicle.restrictionKnown = false;
      next.version++;
      await save(next);
    }
  }
  const projection = (actor, id) =>
    assertContract("state", project(state, actor, id, now()));
  return {
    close: async () => {
      accepting = false;
      await queue;
    },
    read: (actor, id) =>
      serial(async () => {
        await expire();
        return projection(actor, id);
      }),
    handoff: () =>
      serial(async () => {
        await expire();
        if (!state.handoff)
          fail(409, "NOT_READY", "웹에서 여행을 저장하고 전달을 준비하세요.");
        return assertContract("handoff", structuredClone(state.handoff));
      }),
    receipt: (actor, id, runId, commandId) =>
      serial(async () => {
        await expire();
        const hit = findReceipt(state, `${runId}:${actor}:${commandId}`);
        if (hit && actor === "web" && hit.clientId !== id)
          fail(403, "ACTOR_FORBIDDEN", "다른 클라이언트의 영수증입니다.");
        return hit
          ? {
              status: "applied",
              receipt: { ...hit.receipt, replayed: true },
              state: projection(actor, id),
            }
          : { status: "not_found", state: projection(actor, id) };
      }),
    command: (c, actor, id) =>
      serial(async () => {
        await expire();
        try {
          assertContract("command", c);
        } catch {
          fail(400, "INVALID_PAYLOAD", "공통 JSON 계약과 일치하지 않습니다.");
        }
        if (c.actor !== actor)
          fail(403, "ACTOR_FORBIDDEN", "역할 헤더와 명령 역할이 다릅니다.");
        const key = `${c.runId}:${c.actor}:${c.commandId}`,
          hit = findReceipt(state, key);
        if (hit) {
          if (hit.clientId !== id || !isDeepStrictEqual(hit.command, c))
            fail(
              400,
              "COMMAND_ID_REUSED",
              "같은 ID의 본문을 바꿀 수 없습니다.",
            );
          return {
            ok: true,
            receipt: { ...hit.receipt, replayed: true },
            state: projection(actor, id),
          };
        }
        const archivedReport =
          c.type === "NAV_REPORT" &&
          (c.runId !== state.runId || c.runSeq !== state.runSeq);
        if (
          !archivedReport &&
          (c.runId !== state.runId || c.runSeq !== state.runSeq)
        )
          fail(409, "RUN_CHANGED", "회차가 바뀌었습니다.");
        if (
          state.social.cancelledCommands.some(
            (x) => x.commandId === c.commandId && x.actor === c.actor,
          )
        )
          fail(409, "CANCELLED", "이 요청은 취소됐어요.");
        if (!archivedReport) {
          guardDuringReset(state, c);
          guardFinalReplay(state, c);
        }
        if (
          ![
            "CAR_STATUS",
            "NAV_OBSERVE",
            "NAV_REPORT",
            "RESET_BEGIN",
            "RESET_ACK",
          ].includes(c.type) &&
          c.type !== "CANCEL_PENDING_COMMAND" &&
          ![
            "CONNECT_END",
            "CONNECT_CANCEL",
            "MEETING_CANCEL",
            "CALL_CANCEL",
            "CALL_END",
          ].includes(c.type) &&
          c.expectedVersion !== state.version
        )
          fail(409, "STALE_STATE", "최신 상태를 읽고 다시 확인하세요.");
        let next = cloneState();
        const execution = archivedReport
          ? (applyArchivedReport(next, c), undefined)
          : ["RESET_BEGIN", "RESET_ACK"].includes(c.type)
            ? (applyReset(next, c, id, now()), undefined)
            : c.type === "RECOVERY_CONFIRM"
              ? applyRecovery(next, c, now())
              : c.type === "CANCEL_PENDING_COMMAND"
                ? (cancelPending(next, c, id), undefined)
                : c.type.startsWith("NAV_")
                  ? applyNavigation(next, c, now())
                  : (apply(next, c, id, now()), undefined);
        if (c.type === "CAR_STATUS") recordStoryCue(next, c, now());
        interruptFinal(next);
        // Heartbeat receipt persists, but identical restriction facts do not advance business version.
        const heartbeat =
          c.type === "CAR_STATUS" &&
          ["restrictionKnown", "restricted", "foreground"].every(
            (k) => next.vehicle[k] === state.vehicle[k],
          ) && isDeepStrictEqual(next.vehicle.uxRestrictions ?? null, state.vehicle.uxRestrictions ?? null);
        if (!heartbeat && c.type !== "NAV_OBSERVE") next.version++;
        const receipt = {
          runId: c.runId,
          commandId: c.commandId,
          applied: true,
          replayed: false,
          committedVersion: next.version,
        };
        next.receipts[key] = {
          command: structuredClone(c),
          clientId: id,
          receipt,
        };
        next = finishReset(next, initialState);
        next.publicApproval = approval(next);
        validateStore(next);
        await save(next);
        return assertContract("success", {
          ...(execution ? { execution } : {}),
          ok: true,
          receipt,
          state: projection(actor, id),
        });
      }),
    health: () =>
      serial(async () => {
        await expire();
        return assertContract("health", {
          schemaVersion: 4,
          storeId: state.storeId,
          status: "ready",
          scope: "mobile-meeting-v4",
        });
      }),
  };
}
