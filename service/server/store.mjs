import { DatabaseSync } from "node:sqlite";
import { mkdir, open, unlink, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { error, validate } from "./contracts.mjs";
const parse = (value) => JSON.parse(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function openRepository(file) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const lock = await open(file + ".lock", "wx", 0o600).catch(() => {
    throw error(
      503,
      "DATABASE_BUSY",
      "서비스가 이미 실행 중이거나 이전 실행 기록 확인이 필요합니다.",
    );
  });
  await lock.writeFile(String(process.pid));
  await lock.close();
  let db;
  try {
    db = new DatabaseSync(file);
    await chmod(file, 0o600);
    db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    if (db.prepare("PRAGMA user_version").get().user_version > 1)
      throw new Error("Unsupported database version");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, profile TEXT NOT NULL, profile_version INTEGER NOT NULL DEFAULT 1, consent_at INTEGER, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,request_id TEXT NOT NULL,body_hash TEXT NOT NULL,user_text TEXT NOT NULL,assistant_text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,attempt INTEGER NOT NULL DEFAULT 1,error_code TEXT,events TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,completed_at INTEGER,UNIQUE(user_id,request_id));
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_turn ON turns(chat_id) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,kind TEXT NOT NULL,body TEXT NOT NULL,base_profile_version INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'proposed',confirmed_id TEXT,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS trips(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id),body TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS chats_owner ON chats(user_id,updated_at);
      CREATE INDEX IF NOT EXISTS turns_chat ON turns(chat_id,created_at);
      PRAGMA user_version=1;
      UPDATE turns SET status='failed',error_code='INTERRUPTED' WHERE status='pending';
    `);
  } catch (e) {
    db?.close();
    await unlink(file + ".lock");
    throw e;
  }
  const q = (sql, ...args) => db.prepare(sql).get(...args),
    all = (sql, ...args) => db.prepare(sql).all(...args),
    run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function ownerChat(user, id) {
    const row = q("SELECT * FROM chats WHERE user_id=? AND id=?", user, id);
    if (!row) throw error(404, "NOT_FOUND", "대화를 찾을 수 없어요.");
    return row;
  }
  function ownerTurn(user, id) {
    const row = q("SELECT * FROM turns WHERE user_id=? AND id=?", user, id);
    if (!row) throw error(404, "NOT_FOUND", "메시지를 찾을 수 없어요.");
    return row;
  }
  const draftView = (row) => ({
    id: row.id,
    kind: row.kind,
    body: parse(row.body),
    status: row.status,
    confirmedId: row.confirmed_id,
  });
  const userView = (row) => ({
    id: row.id,
    handle: row.handle,
    profile: parse(row.profile),
    profileVersion: row.profile_version,
    aiConsent: !!row.consent_at,
  });
  const repo = {
    getUser(id) {
      const row = q("SELECT * FROM users WHERE id=?", id);
      if (!row) throw error(401, "UNAUTHORIZED", "다시 로그인해 주세요.");
      return userView(row);
    },
    credentials(handle) {
      return q("SELECT id,password_hash FROM users WHERE handle=?", handle);
    },
    createUser(handle, passwordHash, displayName) {
      const id = randomUUID(),
        profile = {
          displayName,
          avatar: "dragon",
          interests: [],
          travelStyle: "",
          about: "",
        };
      try {
        run(
          "INSERT INTO users(id,handle,password_hash,profile,created_at) VALUES(?,?,?,?,?)",
          id,
          handle,
          passwordHash,
          JSON.stringify(profile),
          Date.now(),
        );
      } catch (e) {
        if (
          e.code?.includes("SQLITE") &&
          q("SELECT id FROM users WHERE handle=?", handle)
        )
          throw error(409, "HANDLE_TAKEN", "이미 사용 중인 아이디예요.");
        throw e;
      }
      return repo.getUser(id);
    },
    session(token) {
      const row = q(
        "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
        hash(token),
        Date.now(),
      );
      return row
        ? { userId: row.user_id, csrf: row.csrf, tokenHash: row.token_hash }
        : null;
    },
    createSession(user, token, csrf) {
      run("DELETE FROM sessions WHERE expires_at<=?", Date.now());
      run(
        "INSERT INTO sessions VALUES(?,?,?,?)",
        hash(token),
        user,
        csrf,
        Date.now() + 30 * 86400000,
      );
    },
    revokeSession(token) {
      run("DELETE FROM sessions WHERE token_hash=?", hash(token));
    },
    consent(user, accepted) {
      run(
        "UPDATE users SET consent_at=? WHERE id=?",
        accepted ? Date.now() : null,
        user,
      );
      return repo.getUser(user);
    },
    profile(user, profile, version) {
      validate("profile", profile);
      const result = run(
        "UPDATE users SET profile=?,profile_version=profile_version+1 WHERE id=? AND profile_version=?",
        JSON.stringify(profile),
        user,
        version,
      );
      if (!result.changes)
        throw error(
          409,
          "VERSION_CONFLICT",
          "다른 화면에서 정보가 바뀌었어요. 최신 내용을 확인해 주세요.",
        );
      return repo.getUser(user);
    },
    listChats(user, archived = false) {
      return all(
        "SELECT id,title,version,created_at AS createdAt,updated_at AS updatedAt FROM chats WHERE user_id=? AND archived=? ORDER BY updated_at DESC LIMIT 200",
        user,
        Number(archived),
      );
    },
    newChat(user) {
      const id = randomUUID(),
        now = Date.now();
      run(
        "INSERT INTO chats(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
        id,
        user,
        "새로운 여행 이야기",
        now,
        now,
      );
      return repo.chat(user, id);
    },
    archive(user, id, archived) {
      ownerChat(user, id);
      if (q("SELECT id FROM turns WHERE chat_id=? AND status='pending'", id))
        throw error(
          409,
          "TURN_PENDING",
          "답변이 끝나거나 중단한 뒤 보관해 주세요.",
        );
      run(
        "UPDATE chats SET archived=?,updated_at=? WHERE user_id=? AND id=?",
        Number(archived),
        Date.now(),
        user,
        id,
      );
    },
    chat(user, id) {
      const chat = ownerChat(user, id);
      const turns = all(
        "SELECT * FROM turns WHERE user_id=? AND chat_id=? ORDER BY created_at,rowid",
        user,
        id,
      ).map((t) => ({
        id: t.id,
        message: t.user_text,
        reply: t.assistant_text,
        status: t.status,
        error: t.error_code,
        createdAt: t.created_at,
        attempt: t.attempt,
        events: parse(t.events),
        drafts: all(
          "SELECT * FROM drafts WHERE user_id=? AND turn_id=? ORDER BY created_at",
          user,
          t.id,
        ).map(draftView),
      }));
      return {
        id: chat.id,
        title: chat.title,
        version: chat.version,
        archived: !!chat.archived,
        turns,
      };
    },
    turn: ownerTurn,
    beginTurn(user, chatId, { requestId, message, expectedVersion }) {
      return transaction(() => {
        const chat = ownerChat(user, chatId),
          bodyHash = hash(JSON.stringify({ chatId, message, expectedVersion }));
        const existing = q(
          "SELECT * FROM turns WHERE user_id=? AND request_id=?",
          user,
          requestId,
        );
        if (existing) {
          if (existing.body_hash !== bodyHash)
            throw error(
              409,
              "REQUEST_REUSED",
              "같은 요청 번호의 내용을 변경할 수 없어요.",
            );
          return { ...existing, replayed: true };
        }
        if (!repo.getUser(user).aiConsent)
          throw error(
            403,
            "AI_CONSENT_REQUIRED",
            "대화를 AI에 전달하는 데 먼저 동의해 주세요.",
          );
        if (
          q(
            "SELECT COUNT(*) AS n FROM turns WHERE user_id=? AND status='pending'",
            user,
          ).n >= 2
        )
          throw error(429, "TURN_LIMIT", "다른 답변이 끝난 뒤 이어가 주세요.");
        if (chat.archived)
          throw error(409, "CHAT_ARCHIVED", "보관함에서 대화를 복원해 주세요.");
        if (chat.version !== expectedVersion)
          throw error(
            409,
            "VERSION_CONFLICT",
            "새 메시지가 있어요. 대화를 새로 확인해 주세요.",
          );
        if (
          q("SELECT id FROM turns WHERE chat_id=? AND status='pending'", chatId)
        )
          throw error(409, "TURN_PENDING", "지금 답변을 준비하고 있어요.");
        if (
          q("SELECT COUNT(*) AS n FROM turns WHERE chat_id=?", chatId).n >= 100
        )
          throw error(409, "CHAT_FULL", "새 대화에서 이야기를 이어가 주세요.");
        const id = randomUUID(),
          now = Date.now();
        run(
          "INSERT INTO turns(id,user_id,chat_id,request_id,body_hash,user_text,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
          id,
          user,
          chatId,
          requestId,
          bodyHash,
          message,
          "pending",
          now,
        );
        run(
          "UPDATE chats SET title=CASE WHEN version=0 THEN ? ELSE title END,version=version+1,updated_at=? WHERE id=?",
          message.slice(0, 35),
          now,
          chatId,
        );
        return ownerTurn(user, id);
      });
    },
    retryTurn(user, id, attempt) {
      return transaction(() => {
        const turn = ownerTurn(user, id);
        ownerChat(user, turn.chat_id);
        if (!repo.getUser(user).aiConsent)
          throw error(
            403,
            "AI_CONSENT_REQUIRED",
            "AI 대화 동의를 확인해 주세요.",
          );
        if (turn.attempt !== attempt) return { ...turn, replayed: true };
        if (!["failed", "cancelled"].includes(turn.status))
          return { ...turn, replayed: true };
        if (
          q(
            "SELECT id FROM turns WHERE chat_id=? AND rowid>(SELECT rowid FROM turns WHERE id=?)",
            turn.chat_id,
            id,
          )
        )
          throw error(
            409,
            "NEWER_TURN",
            "새 메시지 이후에는 이전 요청을 다시 실행할 수 없어요.",
          );
        if (
          q(
            "SELECT id FROM turns WHERE chat_id=? AND status='pending'",
            turn.chat_id,
          )
        )
          throw error(409, "TURN_PENDING", "답변을 준비하고 있어요.");
        if (
          q(
            "SELECT COUNT(*) AS n FROM turns WHERE user_id=? AND status='pending'",
            user,
          ).n >= 2
        )
          throw error(429, "TURN_LIMIT", "다른 답변이 끝난 뒤 이어가 주세요.");
        if (ownerChat(user, turn.chat_id).archived)
          throw error(409, "CHAT_ARCHIVED", "대화를 먼저 복원해 주세요.");
        run(
          "UPDATE turns SET status='pending',assistant_text='',error_code=NULL,events='[]',attempt=attempt+1 WHERE id=?",
          id,
        );
        return ownerTurn(user, id);
      });
    },
    finishTurn(user, id, attempt, { reply, drafts, events }) {
      return transaction(() => {
        const turn = ownerTurn(user, id),
          account = repo.getUser(user);
        if (
          turn.status !== "pending" ||
          turn.attempt !== attempt ||
          !account.aiConsent
        )
          throw error(409, "TURN_CANCELLED", "중단한 답변은 저장하지 않아요.");
        for (const draft of drafts) {
          validate(draft.kind === "trip" ? "trip" : "preferences", draft.body);
          run(
            "INSERT INTO drafts(id,user_id,chat_id,turn_id,kind,body,base_profile_version,created_at) VALUES(?,?,?,?,?,?,?,?)",
            draft.id,
            user,
            turn.chat_id,
            id,
            draft.kind,
            JSON.stringify(draft.body),
            draft.baseProfileVersion,
            Date.now(),
          );
        }
        run(
          "UPDATE turns SET status='completed',assistant_text=?,events=?,completed_at=? WHERE id=?",
          reply,
          JSON.stringify(events),
          Date.now(),
          id,
        );
        run(
          "UPDATE chats SET version=version+1,updated_at=? WHERE id=?",
          Date.now(),
          turn.chat_id,
        );
      });
    },
    failTurn(user, id, attempt, code, partial = "", events = []) {
      const result = run(
        "UPDATE turns SET status=?,assistant_text=?,error_code=?,events=?,completed_at=? WHERE id=? AND user_id=? AND attempt=? AND status='pending'",
        code === "CANCELLED" ? "cancelled" : "failed",
        partial,
        code,
        JSON.stringify(events),
        Date.now(),
        id,
        user,
        attempt,
      );
      if (result.changes)
        run(
          "UPDATE chats SET version=version+1,updated_at=? WHERE id=(SELECT chat_id FROM turns WHERE id=?)",
          Date.now(),
          id,
        );
    },
    listTrips(user) {
      return all(
        "SELECT * FROM trips WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
        user,
      ).map((t) => ({ id: t.id, ...parse(t.body), createdAt: t.created_at }));
    },
    confirmDraft(user, id) {
      return transaction(() => {
        const row = q(
          "SELECT * FROM drafts WHERE id=? AND user_id=?",
          id,
          user,
        );
        if (!row) throw error(404, "NOT_FOUND", "초안을 찾을 수 없어요.");
        if (row.status === "confirmed")
          return { id: row.confirmed_id, kind: row.kind, replayed: true };
        const body = parse(row.body);
        let confirmedId = user;
        if (row.kind === "trip") {
          validate("trip", body);
          confirmedId = randomUUID();
          run(
            "INSERT INTO trips VALUES(?,?,?,?,?)",
            confirmedId,
            user,
            id,
            row.body,
            Date.now(),
          );
        } else {
          const current = repo.getUser(user);
          validate("preferences", body);
          repo.profile(
            user,
            { ...current.profile, ...body },
            row.base_profile_version,
          );
        }
        run(
          "UPDATE drafts SET status='confirmed',confirmed_id=? WHERE id=?",
          confirmedId,
          id,
        );
        return { id: confirmedId, kind: row.kind, replayed: false };
      });
    },
    async close() {
      db.close();
      await unlink(file + ".lock");
    },
  };
  return repo;
}
