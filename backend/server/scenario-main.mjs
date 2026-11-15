// One API origin for the mobile, operator panel and Pleos contest journey.
process.env.SERVICE_PORT = process.env.SERVICE_SCENARIO_PORT || "3008";
process.env.SERVICE_PUBLIC_ORIGIN = `http://127.0.0.1:${process.env.SERVICE_PORT}`;
process.env.SERVICE_DB_PATH = process.env.SERVICE_SCENARIO_DB_PATH || "runtime/scenario-demo.sqlite";
process.env.SERVICE_SCENARIO_DEMO = "1";
await import("./main.mjs");
