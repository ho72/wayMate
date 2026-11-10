import { isDeepStrictEqual } from "node:util";
import { atomicSave } from "./store.mjs";
import { assertContract } from "./validation.mjs";
import { apply, fail, fresh } from "./domain/handoff.mjs";
import { project } from "./projections/state.mjs";
export function coordinator(
  file,
  initial,
  { now = () => performance.now(), fault } = {},
) {
  let state = initial,
    queue = Promise.resolve(),
    unavailable = false,
    booting = true;
  // A monotonic timestamp from a previous process cannot grant vehicle permission.

  const serial = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  async function save(next) {
    try {
      await atomicSave(file, next, fault);
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
        state.vehicle.seenAt !== null ||
        state.vehicle.restrictionKnown ||
        state.vehicle.foreground
      ) {
        const next = structuredClone(state);
        next.vehicle.seenAt = null;
        next.vehicle.restrictionKnown = false;
        next.vehicle.foreground = false;
        next.version++;
        await save(next);
      }
      booting = false;
    }
    if (state.vehicle.seenAt !== null && !fresh(state, now())) {
      const next = structuredClone(state);
      next.vehicle.seenAt = null;
      next.vehicle.restrictionKnown = false;
      next.version++;
      await save(next);
    }
  }
  const projection = (actor, id) =>
    assertContract("state", project(state, actor, id, now()));
  return {
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
        const hit = state.receipts[`${runId}:${actor}:${commandId}`];
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
          hit = state.receipts[key];
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
        if (c.runId !== state.runId || c.runSeq !== state.runSeq)
          fail(409, "RUN_CHANGED", "회차가 바뀌었습니다.");
        if (c.type !== "CAR_STATUS" && c.expectedVersion !== state.version)
          fail(409, "STALE_STATE", "최신 상태를 읽고 다시 확인하세요.");
        const next = structuredClone(state);
        apply(next, c, id, now());
        // Heartbeat receipt persists, but identical restriction facts do not advance business version.
        const heartbeat =
          c.type === "CAR_STATUS" &&
          ["restrictionKnown", "restricted", "foreground"].every(
            (k) => next.vehicle[k] === state.vehicle[k],
          );
        if (!heartbeat) next.version++;
        const receipt = {
          runId: c.runId,
          commandId: c.commandId,
          applied: true,
          replayed: false,
          committedVersion: next.version,
        };
        next.receipts[key] = { command: c, clientId: id, receipt };
        assertContract("store", next);
        await save(next);
        return assertContract("success", {
          ok: true,
          receipt,
          state: projection(actor, id),
        });
      }),
    health: () =>
      serial(async () => {
        await expire();
        return assertContract("health", {
          schemaVersion: 2,
          storeId: state.storeId,
          status: "ready",
          scope: "handoff-my-trip-v1",
        });
      }),
  };
}
