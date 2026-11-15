import { createHash, createHmac, randomUUID } from "node:crypto";
import { error } from "./contracts.mjs";
import {
  VEHICLE_SCOPE,
  PAIR_TTL_MS,
  fields,
  uuid,
  integer,
  uxReport,
  parked,
  tripSnapshot,
} from "./vehicle-contracts.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const pairCode = (token, id) =>
  String(
    10_000_000 +
      (createHmac("sha256", token).update(id).digest().readUInt32BE(0) %
        90_000_000),
  );
export function installVehicleSchema(db) {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,key_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,created_at INTEGER NOT NULL,seen_at INTEGER,ux TEXT);
    CREATE TABLE IF NOT EXISTS vehicle_pairings(id TEXT PRIMARY KEY,device_id TEXT NOT NULL REFERENCES vehicles(id),user_id TEXT REFERENCES users(id),code_hash TEXT UNIQUE,status TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,confirmed_at INTEGER,revoked_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS one_current_pairing ON vehicle_pairings(device_id) WHERE status IN ('pending','requested','active');
    CREATE TABLE IF NOT EXISTS vehicle_deliveries(id TEXT PRIMARY KEY,pairing_id TEXT NOT NULL REFERENCES vehicle_pairings(id),user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,body_hash TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at INTEGER NOT NULL,acknowledged_at INTEGER,UNIQUE(user_id,request_id),UNIQUE(pairing_id,revision));
    CREATE INDEX IF NOT EXISTS vehicle_pairing_owner ON vehicle_pairings(user_id,created_at);
    PRAGMA user_version=2;
    COMMIT;`);
}
export function vehicleStore({
  q,
  all,
  run,
  transaction,
  getUser,
  now = Date.now,
}) {
  const expire = () =>
    run(
      "UPDATE vehicle_pairings SET status='expired',code_hash=NULL WHERE status IN ('pending','requested') AND expires_at<=?",
      now(),
    );
  function device(id, token) {
    uuid(id);
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw error(
        401,
        "DEVICE_UNAUTHORIZED",
        "차량 연결을 다시 시작해 주세요.",
      );
    const row = q(
      "SELECT * FROM vehicles WHERE id=? AND key_hash=?",
      id,
      hash(token),
    );
    if (!row)
      throw error(
        401,
        "DEVICE_UNAUTHORIZED",
        "차량 연결을 다시 시작해 주세요.",
      );
    return row;
  }
  const currentPair = (id) =>
    q(
      "SELECT * FROM vehicle_pairings WHERE device_id=? AND status IN ('pending','requested','active')",
      id,
    );
  const latest = (id) =>
    q(
      "SELECT * FROM vehicle_deliveries WHERE pairing_id=? ORDER BY revision DESC LIMIT 1",
      id,
    );
  const deliveryView = (row) =>
    row
      ? {
          id: row.id,
          pairingId: row.pairing_id,
          revision: row.revision,
          createdAt: row.created_at,
          acknowledgedAt: row.acknowledged_at,
          snapshot: JSON.parse(row.snapshot),
        }
      : null;
  function active(id, token, pairingId, requireParked = false) {
    expire();
    const d = device(id, token),
      p = currentPair(id);
    if (!p || p.id !== pairingId || p.status !== "active")
      throw error(
        409,
        "PAIRING_CHANGED",
        "연결이 바뀌었어요. 현재 차량 연결을 확인해 주세요.",
      );
    if (requireParked && !parked(d.ux && JSON.parse(d.ux), d.seen_at, now()))
      throw error(
        409,
        "VEHICLE_BLOCKED",
        "정차 상태에서 차량 연결을 확인해 주세요.",
      );
    return p;
  }
  function owner(user, id, pairingId) {
    expire();
    const p = q(
      "SELECT * FROM vehicle_pairings WHERE id=? AND device_id=? AND user_id=?",
      uuid(pairingId),
      uuid(id),
      user,
    );
    if (!p) throw error(404, "NOT_FOUND", "연결된 차량을 찾을 수 없어요.");
    return p;
  }
  const api = {
    vehicleEnroll(body) {
      fields(body, ["deviceId", "deviceToken", "name"]);
      uuid(body.deviceId);
      if (
        typeof body.deviceToken !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.deviceToken) ||
        typeof body.name !== "string" ||
        !body.name.trim() ||
        [...body.name.trim()].length > 30
      )
        throw error(422, "INVALID_INPUT", "차량 연결 정보를 확인해 주세요.");
      return transaction(() => {
        expire();
        const exists = q("SELECT id FROM vehicles WHERE id=?", body.deviceId);
        if (exists) device(body.deviceId, body.deviceToken);
        else
          run(
            "INSERT INTO vehicles(id,key_hash,name,created_at) VALUES(?,?,?,?)",
            body.deviceId,
            hash(body.deviceToken),
            body.name.trim(),
            now(),
          );
        let p = currentPair(body.deviceId);
        if (!p) {
          let id, code;
          do {
            id = randomUUID();
            code = pairCode(body.deviceToken, id);
          } while (
            q("SELECT id FROM vehicle_pairings WHERE code_hash=?", hash(code))
          );
          run(
            "INSERT INTO vehicle_pairings(id,device_id,code_hash,status,expires_at,created_at) VALUES(?,?,?,'pending',?,?)",
            id,
            body.deviceId,
            hash(code),
            now() + PAIR_TTL_MS,
            now(),
          );
        }
        return api.vehicleState(body.deviceId, body.deviceToken);
      });
    },
    vehicleState(id, token) {
      expire();
      const d = device(id, token),
        p = currentPair(id);
      const allowed = parked(d.ux && JSON.parse(d.ux), d.seen_at, now());
      const account = p?.user_id ? getUser(p.user_id) : null;
      return {
        schemaVersion: 1,
        scope: VEHICLE_SCOPE,
        status: p?.status || "revoked",
        device: { id: d.id, name: d.name },
        canInteract: allowed,
        pairing: p
          ? {
              id: p.id,
              expiresAt: p.status === "active" ? null : p.expires_at,
              code: p.status === "pending" ? pairCode(token, p.id) : null,
              account: account
                ? {
                    displayName: account.profile.displayName,
                    avatar: account.profile.avatar,
                  }
                : null,
            }
          : null,
        delivery:
          p?.status === "active" && allowed ? deliveryView(latest(p.id)) : null,
      };
    },
    vehicleSync(id, token, body) {
      fields(body, ["ux"]);
      const ux = uxReport(body.ux);
      device(id, token);
      run(
        "UPDATE vehicles SET ux=?,seen_at=? WHERE id=?",
        JSON.stringify(ux),
        now(),
        id,
      );
      return api.vehicleState(id, token);
    },
    vehicleClaim(user, body) {
      fields(body, ["code"]);
      if (typeof body.code !== "string" || !/^\d{8}$/.test(body.code))
        throw error(
          422,
          "INVALID_CODE",
          "차량 화면의 8자리 코드를 입력해 주세요.",
        );
      return transaction(() => {
        expire();
        const p = q(
          "SELECT * FROM vehicle_pairings WHERE code_hash=? AND status IN ('pending','requested')",
          hash(body.code),
        );
        if (!p || (p.status === "requested" && p.user_id !== user))
          throw error(
            404,
            "INVALID_CODE",
            "사용할 수 없는 코드예요. 차량에서 새 코드를 확인해 주세요.",
          );
        if (p.status === "pending")
          run(
            "UPDATE vehicle_pairings SET status='requested',user_id=? WHERE id=?",
            user,
            p.id,
          );
        return {
          pairingId: p.id,
          deviceId: p.device_id,
          status: "requested",
          name: q("SELECT name FROM vehicles WHERE id=?", p.device_id).name,
        };
      });
    },
    vehicleConfirm(id, token, body) {
      fields(body, ["pairingId", "decision"]);
      uuid(body.pairingId);
      if (!["accept", "decline"].includes(body.decision))
        throw error(422, "INVALID_INPUT", "연결 선택을 확인해 주세요.");
      return transaction(() => {
        expire();
        const d = device(id, token),
          p = currentPair(id);
        if (
          !p ||
          p.id !== body.pairingId ||
          !["requested", "active"].includes(p.status)
        )
          throw error(
            409,
            "PAIRING_CHANGED",
            "현재 연결 요청을 다시 확인해 주세요.",
          );
        if (!parked(d.ux && JSON.parse(d.ux), d.seen_at, now()))
          throw error(409, "VEHICLE_BLOCKED", "정차 후 연결을 확인해 주세요.");
        if (p.status === "active") {
          if (body.decision !== "accept")
            throw error(
              409,
              "PAIRING_CHANGED",
              "이미 연결한 계정은 연결 해제로 정리해 주세요.",
            );
        } else
          run(
            "UPDATE vehicle_pairings SET status=?,code_hash=NULL,confirmed_at=? WHERE id=?",
            body.decision === "accept" ? "active" : "declined",
            now(),
            p.id,
          );
        return api.vehicleState(id, token);
      });
    },
    vehicleList(user) {
      expire();
      return all(
        "SELECT p.*,v.name,v.seen_at FROM vehicle_pairings p JOIN vehicles v ON v.id=p.device_id WHERE p.user_id=? AND p.status IN ('requested','active') ORDER BY p.created_at DESC LIMIT 20",
        user,
      ).map((p) => {
        const row = latest(p.id);
        return {
          id: p.device_id,
          pairingId: p.id,
          name: p.name,
          status: p.status,
          lastSeenAt: p.seen_at,
          delivery: row
            ? {
                id: row.id,
                revision: row.revision,
                title: JSON.parse(row.snapshot).trip.plan.title,
                createdAt: row.created_at,
                acknowledgedAt: row.acknowledged_at,
              }
            : null,
        };
      });
    },
    vehicleRevoke(user, id, body) {
      fields(body, ["pairingId"]);
      return transaction(() => {
        const p = owner(user, id, body.pairingId);
        if (["requested", "active"].includes(p.status))
          run(
            "UPDATE vehicle_pairings SET status='revoked',code_hash=NULL,revoked_at=? WHERE id=?",
            now(),
            p.id,
          );
        return { ok: true };
      });
    },
    vehicleUnpair(id, token, body) {
      fields(body, ["pairingId"]);
      uuid(body.pairingId);
      device(id, token);
      return transaction(() => {
        expire();
        const p = q(
          "SELECT * FROM vehicle_pairings WHERE id=? AND device_id=?",
          body.pairingId,
          id,
        );
        if (!p)
          throw error(409, "PAIRING_CHANGED", "연결 상태를 확인해 주세요.");
        if (["pending", "requested", "active"].includes(p.status))
          run(
            "UPDATE vehicle_pairings SET status='revoked',code_hash=NULL,revoked_at=? WHERE id=?",
            now(),
            p.id,
          );
        return api.vehicleState(id, token);
      });
    },
    vehiclePublish(user, id, body) {
      fields(body, [
        "requestId",
        "pairingId",
        "expectedRevision",
        "tripId",
        "profileVersion",
      ]);
      uuid(body.requestId);
      uuid(body.tripId);
      integer(body.expectedRevision);
      integer(body.profileVersion);
      return transaction(() => {
        const p = owner(user, id, body.pairingId);
        if (p.status !== "active")
          throw error(
            409,
            "PAIRING_CHANGED",
            "차량에서 계정 연결을 먼저 확인해 주세요.",
          );
        const bodyHash = hash(
          JSON.stringify([
            id,
            body.pairingId,
            body.expectedRevision,
            body.tripId,
            body.profileVersion,
          ]),
        );
        const existing = q(
          "SELECT * FROM vehicle_deliveries WHERE user_id=? AND request_id=?",
          user,
          body.requestId,
        );
        if (existing) {
          if (existing.body_hash !== bodyHash)
            throw error(
              409,
              "REQUEST_REUSED",
              "같은 요청 번호의 내용을 바꿀 수 없어요.",
            );
          return { delivery: deliveryView(existing), replayed: true };
        }
        const previous = latest(p.id);
        if ((previous?.revision || 0) !== body.expectedRevision)
          throw error(
            409,
            "VERSION_CONFLICT",
            "차량의 최신 전달 상태를 확인한 뒤 다시 선택해 주세요.",
          );
        const account = getUser(user);
        if (account.profileVersion !== body.profileVersion)
          throw error(
            409,
            "VERSION_CONFLICT",
            "별명과 캐릭터가 바뀌었어요. 최신 정보를 다시 확인해 주세요.",
          );
        const trip = q(
          "SELECT * FROM trips WHERE user_id=? AND id=?",
          user,
          body.tripId,
        );
        if (!trip)
          throw error(404, "NOT_FOUND", "저장한 본인 여행을 찾을 수 없어요.");
        const deliveryId = randomUUID();
        run(
          "INSERT INTO vehicle_deliveries(id,pairing_id,user_id,request_id,body_hash,revision,snapshot,created_at) VALUES(?,?,?,?,?,?,?,?)",
          deliveryId,
          p.id,
          user,
          body.requestId,
          bodyHash,
          body.expectedRevision + 1,
          JSON.stringify(tripSnapshot(account, trip)),
          now(),
        );
        return { delivery: deliveryView(latest(p.id)), replayed: false };
      });
    },
    vehicleAck(id, token, body) {
      fields(body, ["pairingId", "deliveryId", "revision"]);
      uuid(body.deliveryId);
      integer(body.revision);
      return transaction(() => {
        const p = active(id, token, uuid(body.pairingId), true),
          row = latest(p.id);
        if (
          !row ||
          row.id !== body.deliveryId ||
          row.revision !== body.revision
        )
          throw error(
            409,
            "DELIVERY_STALE",
            "새 여행이 도착했어요. 현재 여행을 다시 확인해 주세요.",
          );
        if (row.acknowledged_at === null)
          run(
            "UPDATE vehicle_deliveries SET acknowledged_at=? WHERE id=?",
            now(),
            row.id,
          );
        return api.vehicleState(id, token);
      });
    },
  };
  return api;
}
