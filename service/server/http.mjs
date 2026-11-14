import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { openRepository } from "./store.mjs";
import { agentRunner } from "./agent.mjs";
import { error, UUID } from "./contracts.mjs";
const derive = promisify(scrypt);
const key = () => randomBytes(32).toString("base64url");
async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return (
    salt +
    ":" +
    (
      await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 })
    ).toString("hex")
  );
}
async function passwordMatches(password, stored) {
  const [salt] = stored.split(":");
  const actual = await passwordHash(password, salt);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function throttle() {
  const entries = new Map();
  return (id, limit, period) => {
    const now = Date.now();
    if (entries.size > 10000)
      for (const [k, v] of entries) if (v.until <= now) entries.delete(k);
    if (entries.size > 10000)
      throw error(429, "BUSY", "잠시 후 다시 시도해 주세요.");
    let entry = entries.get(id);
    if (!entry || entry.until <= now)
      entries.set(id, (entry = { n: 0, until: now + period }));
    if (++entry.n > limit)
      throw error(
        429,
        "RATE_LIMITED",
        "요청이 잠시 많아요. 조금 뒤 다시 시도해 주세요.",
      );
  };
}
async function jsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw error(415, "JSON_REQUIRED", "입력 형식을 확인해 주세요.");
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32768) throw error(413, "TOO_LARGE", "메시지가 너무 길어요.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw 0;
    return value;
  } catch {
    throw error(400, "INVALID_JSON", "입력 내용을 확인해 주세요.");
  }
}
const staticFiles = new Map([
  ["/", ["../web/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["../web/app.js", "text/javascript; charset=utf-8"]],
  ["/client.mjs", ["../web/client.mjs", "text/javascript; charset=utf-8"]],
  ["/app.css", ["../web/app.css", "text/css; charset=utf-8"]],
  ["/assets/icons.svg", ["../web/assets/icons.svg", "image/svg+xml"]],
  [
    "/assets/dragon.png",
    ["../../mock-app/assets/images/design-v5/dragon.png", "image/png"],
  ],
  [
    "/assets/bear.png",
    ["../../mock-app/assets/images/design-v5/bear.png", "image/png"],
  ],
]);
export async function startService({
  file,
  port = 3004,
  host = "127.0.0.1",
  origin = `http://127.0.0.1:${port}`,
  agent,
} = {}) {
  if (!agent) throw new Error("A real agent provider is required");
  const originUrl = new URL(origin);
  if (
    !["http:", "https:"].includes(originUrl.protocol) ||
    originUrl.pathname !== "/" ||
    originUrl.username ||
    originUrl.password ||
    originUrl.search ||
    originUrl.hash
  )
    throw new Error("Invalid public origin");
  const repo = await openRepository(file),
    runner = agentRunner(repo, agent),
    limit = throttle();
  const cookieName =
    originUrl.protocol === "https:" ? "__Host-waymate" : "waymate_session";
  const cookie = (value, clear = false) =>
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 30 * 86400}${originUrl.protocol === "https:" ? "; Secure" : ""}`;
  const token = (req) => {
    const raw = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(raw || "") ? raw : null;
  };
  const dummy = await passwordHash("not-a-real-user-password");
  let authWork = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const authority =
        port === 0 ? `127.0.0.1:${server.address().port}` : originUrl.host;
      const effectiveOrigin =
        port === 0 ? `http://${authority}` : originUrl.origin;
      if (req.headers.host !== authority)
        throw error(403, "BAD_HOST", "이 주소로는 연결할 수 없어요.");
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw error(
          403,
          "BAD_ORIGIN",
          "다른 사이트에서 보낸 요청은 처리하지 않아요.",
        );
      const url = new URL(req.url, effectiveOrigin),
        method = req.method;
      if (method === "GET" && staticFiles.has(url.pathname)) {
        const [path, type] = staticFiles.get(url.pathname);
        res.writeHead(200, { "Content-Type": type });
        return res.end(await readFile(new URL(path, import.meta.url)));
      }
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204);
        return res.end();
      }
      if (method === "GET" && url.pathname === "/health")
        return send(200, {
          status: "ready",
          service: "waymate",
          agentConfigured: true,
        });
      if (!url.pathname.startsWith("/api/"))
        throw error(404, "NOT_FOUND", "페이지를 찾을 수 없어요.");
      if (!["GET", "POST", "PUT", "PATCH"].includes(method))
        throw error(405, "METHOD_NOT_ALLOWED", "지원하지 않는 요청이에요.");
      const changing = method !== "GET";
      if (changing && req.headers.origin !== effectiveOrigin)
        throw error(
          403,
          "BAD_ORIGIN",
          "페이지를 새로 연 뒤 다시 시도해 주세요.",
        );
      const rawToken = token(req),
        session = rawToken ? repo.session(rawToken) : null;
      if (method === "GET" && url.pathname === "/api/session")
        return send(
          200,
          session
            ? {
                user: repo.getUser(session.userId),
                csrf: session.csrf,
                chats: repo.listChats(session.userId),
                trips: repo.listTrips(session.userId),
              }
            : { user: null, csrf: null, chats: [], trips: [] },
        );
      if (
        method === "POST" &&
        ["/api/auth/register", "/api/auth/login"].includes(url.pathname)
      ) {
        const body = await jsonBody(req);
        const handle =
          typeof body.handle === "string"
            ? body.handle.normalize("NFKC").trim().toLowerCase()
            : "";
        if (
          !/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(handle) ||
          typeof body.password !== "string" ||
          body.password.length > 128 ||
          Buffer.byteLength(body.password) > 512
        )
          throw error(
            422,
            "INVALID_CREDENTIALS",
            "아이디와 비밀번호를 확인해 주세요.",
          );
        const ip = req.socket.remoteAddress;
        limit("auth-ip:" + ip, 30, 15 * 60000);
        limit("auth-user:" + ip + ":" + handle, 8, 15 * 60000);
        if (authWork >= 3)
          throw error(429, "BUSY", "잠시 후 다시 시도해 주세요.");
        let user;
        authWork++;
        try {
          if (url.pathname.endsWith("/register")) {
            limit("signup:" + ip, 10, 3600000);
            if (
              [...body.password].length < 12 ||
              typeof body.displayName !== "string" ||
              !body.displayName.trim() ||
              [...body.displayName.trim()].length > 30
            )
              throw error(
                422,
                "INVALID_INPUT",
                "별명은 1~30자, 비밀번호는 12자 이상으로 입력해 주세요.",
              );
            user = repo.createUser(
              handle,
              await passwordHash(body.password),
              body.displayName.trim(),
            );
          } else {
            const credentials = repo.credentials(handle);
            const valid = await passwordMatches(
              body.password,
              credentials?.password_hash || dummy,
            );
            if (!credentials || !valid)
              throw error(
                401,
                "LOGIN_FAILED",
                "아이디 또는 비밀번호가 맞지 않아요.",
              );
            user = repo.getUser(credentials.id);
          }
        } finally {
          authWork--;
        }
        if (rawToken) {
          runner.revokeSession(session?.tokenHash);
          repo.revokeSession(rawToken);
        }
        const secret = key(),
          csrf = key();
        repo.createSession(user.id, secret, csrf);
        res.setHeader("Set-Cookie", cookie(secret));
        return send(200, {
          user,
          csrf,
          chats: repo.listChats(user.id),
          trips: repo.listTrips(user.id),
        });
      }
      if (!session)
        throw error(401, "UNAUTHORIZED", "로그인하고 이야기를 이어가 주세요.");
      if (changing && !equal(req.headers["x-csrf-token"], session.csrf))
        throw error(
          403,
          "CSRF_FAILED",
          "페이지를 새로 열고 다시 시도해 주세요.",
        );
      const user = session.userId;
      if (method === "POST" && url.pathname === "/api/auth/logout") {
        runner.revokeSession(session.tokenHash);
        repo.revokeSession(rawToken);
        res.setHeader("Set-Cookie", cookie("", true));
        return send(200, { ok: true });
      }
      if (method === "POST" && url.pathname === "/api/consent") {
        const b = await jsonBody(req);
        if (typeof b.accepted !== "boolean")
          throw error(422, "INVALID_INPUT", "동의 여부를 확인해 주세요.");
        if (!b.accepted) runner.revokeUser(user);
        return send(200, { user: repo.consent(user, b.accepted) });
      }
      if (method === "PUT" && url.pathname === "/api/profile") {
        const b = await jsonBody(req);
        if (!Number.isInteger(b.version))
          throw error(422, "INVALID_INPUT", "정보 버전을 확인해 주세요.");
        return send(200, { user: repo.profile(user, b.profile, b.version) });
      }
      if (method === "GET" && url.pathname === "/api/chats")
        return send(200, {
          chats: repo.listChats(
            user,
            url.searchParams.get("archived") === "true",
          ),
        });
      if (method === "POST" && url.pathname === "/api/chats") {
        limit("new-chat:" + user, 20, 60000);
        return send(201, { chat: repo.newChat(user) });
      }
      if (method === "GET" && url.pathname === "/api/trips")
        return send(200, { trips: repo.listTrips(user) });
      let match = url.pathname.match(/^\/api\/chats\/([\da-f-]+)$/i);
      if (match && UUID.test(match[1])) {
        if (method === "GET")
          return send(200, { chat: repo.chat(user, match[1]) });
        if (method === "PATCH") {
          const b = await jsonBody(req);
          if (typeof b.archived !== "boolean")
            throw error(422, "INVALID_INPUT", "보관 여부를 확인해 주세요.");
          repo.archive(user, match[1], b.archived);
          return send(200, { ok: true });
        }
      }
      match = url.pathname.match(/^\/api\/chats\/([\da-f-]+)\/messages$/i);
      if (match && UUID.test(match[1]) && method === "POST") {
        const b = await jsonBody(req);
        if (
          !UUID.test(b.requestId) ||
          typeof b.message !== "string" ||
          !b.message.trim() ||
          [...b.message].length > 4000 ||
          !Number.isInteger(b.expectedVersion) ||
          b.expectedVersion < 0
        )
          throw error(
            422,
            "INVALID_INPUT",
            "메시지를 1~4,000자로 입력해 주세요.",
          );
        limit("send:" + user, 20, 60000);
        const turn = repo.beginTurn(user, match[1], {
          ...b,
          message: b.message.trim(),
        });
        if (!turn.replayed && turn.status === "pending")
          runner.launch(user, turn, session.tokenHash);
        return send(202, {
          turnId: turn.id,
          status: turn.status,
          attempt: turn.attempt,
          replayed: !!turn.replayed,
        });
      }
      match = url.pathname.match(
        /^\/api\/turns\/([\da-f-]+)\/(events|cancel|retry)$/i,
      );
      if (match && UUID.test(match[1])) {
        const id = match[1],
          action = match[2];
        repo.turn(user, id);
        if (method === "POST" && action === "cancel") {
          runner.cancel(user, id);
          return send(200, { ok: true });
        }
        if (method === "POST" && action === "retry") {
          const b = await jsonBody(req);
          if (!Number.isInteger(b.attempt) || b.attempt < 1)
            throw error(
              422,
              "INVALID_INPUT",
              "다시 시도할 메시지를 확인해 주세요.",
            );
          limit("send:" + user, 20, 60000);
          const turn = repo.retryTurn(user, id, b.attempt);
          if (!turn.replayed && turn.status === "pending")
            runner.launch(user, turn, session.tokenHash);
          return send(202, {
            turnId: id,
            status: turn.status,
            attempt: turn.attempt,
          });
        }
        if (method === "GET" && action === "events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders();
          const heartbeat = setInterval(() => {
            if (!res.writableEnded) res.write(": heartbeat\n\n");
          }, 10000);
          const unsubscribe = runner.subscribe(user, id, (type, data) => {
            if (res.writableEnded) return;
            if (type === "close") {
              clearInterval(heartbeat);
              res.end();
            } else
              res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
          });
          res.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
          return;
        }
      }
      match = url.pathname.match(/^\/api\/drafts\/([\da-f-]+)\/confirm$/i);
      if (match && UUID.test(match[1]) && method === "POST")
        return send(200, {
          result: repo.confirmDraft(user, match[1]),
          user: repo.getUser(user),
          trips: repo.listTrips(user),
        });
      throw error(404, "NOT_FOUND", "요청을 찾을 수 없어요.");
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      send(e.status || 500, {
        error: {
          code: e.status ? e.code : "INTERNAL",
          message: e.status
            ? e.message
            : "잠시 연결이 원활하지 않아요. 다시 시도해 주세요.",
        },
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
  } catch (e) {
    await runner.close();
    await repo.close();
    throw e;
  }
  return {
    port: server.address().port,
    repo,
    runner,
    async close() {
      await runner.close();
      await new Promise((r) => {
        server.close(r);
        server.closeIdleConnections();
      });
      await repo.close();
    },
  };
}
