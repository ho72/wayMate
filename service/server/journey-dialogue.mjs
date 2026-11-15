import { createHash } from "node:crypto";
import { join } from "node:path";
import { error } from "./contracts.mjs";
import { vehicleDialogueService } from "../../mock-app/server/ai/vehicle-dialogue.mjs";

// Each selected mobile journey owns a durable dialogue cache and paid-call budget.
export function journeyDialogueService({ journeys, directory, provider = null, maxCalls = 3, timeoutMs }) {
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 6) throw new Error("Invalid vehicle dialogue budget");
  const services = new Map();
  let closing = false;
  return {
    async prepare(body) {
      if (closing) throw error(503, "UNAVAILABLE", "서버가 종료 중이에요.");
      const api = await journeys.native(), context = await api.dialogueContext();
      if (!services.has(context.scope)) {
        const name = createHash("sha256").update(context.scope).digest("hex");
        const pending = vehicleDialogueService(api, provider, { file: join(directory, name + ".dialogue.json"), maxCalls, timeoutMs });
        services.set(context.scope, pending);
        pending.catch(() => { if (services.get(context.scope) === pending) services.delete(context.scope); });
      }
      const result = await (await services.get(context.scope)).prepare(body);
      if (closing || await journeys.native() !== api)
        throw error(409, "RUN_CHANGED", "모바일에서 선택한 최신 여정을 다시 확인해 주세요.");
      return result;
    },
    async close() {
      closing = true;
      await Promise.all([...services.values()].map(async pending => (await pending).close()));
    },
  };
}
