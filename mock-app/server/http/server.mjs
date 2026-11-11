import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { coordinator } from "../commands.mjs";
import { initialState, validateStore } from "../state.mjs";
import { openStore } from "../store.mjs";
import { QUESTIONS } from "../../shared/config/protocol.mjs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const staticFiles = new Map([
  [
    "/character.png",
    [
      "../../assets/images/characters/blue-dragon-v1/reference.png",
      "image/png",
    ],
  ],
  ["/", ["../../web/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["../../web/app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["../../web/style.css", "text/css; charset=utf-8"]],
  [
    "/shared/client.mjs",
    ["../../web/shared/client.mjs", "text/javascript; charset=utf-8"],
  ],
  [
    "/protocol.mjs",
    ["../../shared/config/protocol.mjs", "text/javascript; charset=utf-8"],
  ],
]);
export async function startServer({ file, port = 3000, now, fault } = {}) {
  const store = await openStore(file, initialState, validateStore);
  const api = coordinator(file, store.data, { now, fault });
  // Validate all projected store fields on startup rather than serving partial corrupted state.
  try {
    await api.read("web", store.data.clientId);
    await api.read("car", null);
  } catch (e) {
    await store.release();
    throw e;
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    let actor, id;
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?$/.test(host))
        throw Object.assign(new Error("로컬 접속만 지원합니다."), {
          status: 403,
          code: "ACTOR_FORBIDDEN",
        });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === "GET" && staticFiles.has(url.pathname)) {
        const [p, type] = staticFiles.get(url.pathname);
        res.writeHead(200, { "Content-Type": type });
        return res.end(await readFile(new URL(p, import.meta.url)));
      }
      if (req.method === "GET" && url.pathname === "/favicon.ico") {
        res.writeHead(204);
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/health")
        return send(200, await api.health());
      actor = req.headers["x-demo-actor"];
      id = actor === "web" ? req.headers["x-demo-client-id"] : null;
      if (
        !["web", "car"].includes(actor) ||
        (actor === "web" && !UUID.test(id || ""))
      )
        throw Object.assign(
          new Error("유효한 역할·클라이언트 ID가 필요합니다."),
          { status: 403, code: "ACTOR_FORBIDDEN" },
        );
      if (req.method === "GET" && url.pathname === "/api/scenario")
        return send(200, {
          schemaVersion: 3,
          scope: "preparation-v3",
          questions: actor === "web" ? QUESTIONS : {},
          tripPresetIds: actor === "web" ? ["gangneung-01"] : [],
          capabilities: {
            myTrip: true,
            connected: false,
            navigation: false, // Full meeting navigation is still unsupported.
            driverWaypoint: true,
            operator: false,
          },
        });
      if (req.method === "GET" && url.pathname === "/api/state") {
        if (url.searchParams.get("view") !== actor)
          throw Object.assign(new Error("역할과 view가 다릅니다."), {
            status: 403,
            code: "ACTOR_FORBIDDEN",
          });
        return send(200, await api.read(actor, id));
      }
      if (req.method === "GET" && url.pathname === "/api/handoff") {
        if (actor !== "car")
          throw Object.assign(
            new Error("차량 역할만 전달본을 읽을 수 있습니다."),
            { status: 403, code: "ACTOR_FORBIDDEN" },
          );
        return send(200, await api.handoff());
      }
      if (
        req.method === "GET" &&
        /^\/api\/commands\/[0-9a-f-]+$/.test(url.pathname)
      )
        return send(
          200,
          await api.receipt(
            actor,
            id,
            url.searchParams.get("runId"),
            url.pathname.split("/").pop(),
          ),
        );
      if (req.method === "POST" && url.pathname === "/api/commands") {
        if (req.headers.origin && req.headers.origin !== `http://${host}`)
          throw Object.assign(new Error("다른 출처에서 저장할 수 없습니다."), {
            status: 403,
            code: "ACTOR_FORBIDDEN",
          });
        if (
          (req.headers["content-type"] || "").split(";")[0] !==
          "application/json"
        )
          throw Object.assign(new Error("JSON 본문이 필요합니다."), {
            status: 400,
            code: "INVALID_PAYLOAD",
          });
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          chunks.push(chunk);
          bytes += chunk.length;
          if (bytes > 16384)
            throw Object.assign(new Error("본문이 너무 큽니다."), {
              status: 413,
              code: "INVALID_PAYLOAD",
            });
        }
        let c;
        try {
          c = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            ),
          );
        } catch {
          throw Object.assign(new Error("잘못된 JSON입니다."), {
            status: 400,
            code: "INVALID_PAYLOAD",
          });
        }
        return send(200, await api.command(c, actor, id));
      }
      send(404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "지원하지 않는 경로입니다." },
      });
    } catch (e) {
      const body = {
        ok: false,
        error: {
          code: e.code || "UNAVAILABLE",
          message: e.status ? e.message : "서버 처리에 실패했습니다.",
        },
      };
      if (actor && ["web", "car"].includes(actor))
        try {
          body.state = await api.read(actor, id);
        } catch {}
      send(e.status || 503, body);
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (e) {
    await store.release();
    throw e;
  }
  return {
    server,
    port: server.address().port,
    close: async () => {
      await new Promise((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await store.release();
    },
  };
}
