import { resolve } from "node:path";
import { prepareGangneungDemo } from "./prepare-gangneung-demo.mjs";

const file=resolve(process.env.WAYMATE_DEMO_STATE_FILE || "runtime/gangneung-20261214.json");
await prepareGangneungDemo(file);
process.env.WAYMATE_STATE_FILE=file;
await import("../server/main.mjs");
