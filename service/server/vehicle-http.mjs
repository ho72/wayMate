import { error, UUID } from "./contracts.mjs";
import { speechHttp } from "../../shared/server/speech-http.mjs";
export async function nativeVehicleRoute({
  req,
  path,
  method,
  repo,
  res,
  speech,
  send,
  jsonBody,
  limit,
}) {
  if (!path.startsWith("/api/vehicle/")) return false;
  if (req.headers.origin || req.headers.cookie || req.headers["sec-fetch-site"])
    throw error(403, "DEVICE_ONLY", "차량 앱에서 연결을 시작해 주세요.");
  if (method !== "POST" && !(method === "GET" && path === "/api/vehicle/tts/config"))
    throw error(405, "METHOD_NOT_ALLOWED", "지원하지 않는 차량 요청이에요.");
  const ip = req.socket.remoteAddress;
  if (path === "/api/vehicle/enroll") {
    limit("vehicle-enroll:" + ip, 20, 5 * 60_000);
    send(200, repo.vehicleEnroll(await jsonBody(req)));
    return true;
  }
  const id = req.headers["x-waymate-device-id"];
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    req.headers.authorization || "",
  );
  if (typeof id !== "string" || !UUID.test(id) || !match)
    throw error(401, "DEVICE_UNAUTHORIZED", "차량 연결을 다시 시작해 주세요.");
  limit("vehicle-ip:" + ip, 600, 60_000);
  if ((path === "/api/vehicle/tts" && method === "POST") ||
      (path === "/api/vehicle/tts/config" && method === "GET")) {
    const state = repo.vehicleState(id, match[1]);
    const pairingId = state.pairing?.id;
    await speechHttp({ req, res, speech, principal: "device:" + id + ":" + pairingId, jsonBody,
      assertAccess() {
        const current = repo.vehicleState(id, match[1]);
        if (current.status !== "active" || current.pairing?.id !== pairingId)
          throw error(403, "TTS_PAIRING_REQUIRED", "계정과 차량을 먼저 연결해 주세요.");
      },
    });
    return true;
  }
  const body = await jsonBody(req),
    token = match[1];
  if (path === "/api/vehicle/sync")
    send(200, repo.vehicleSync(id, token, body));
  else if (path === "/api/vehicle/confirm")
    send(200, repo.vehicleConfirm(id, token, body));
  else if (path === "/api/vehicle/ack")
    send(200, repo.vehicleAck(id, token, body));
  else if (path === "/api/vehicle/unpair")
    send(200, repo.vehicleUnpair(id, token, body));
  else throw error(404, "NOT_FOUND", "차량 요청을 찾을 수 없어요.");
  return true;
}
export async function accountVehicleRoute({
  req,
  path,
  method,
  user,
  repo,
  send,
  jsonBody,
  limit,
}) {
  if (path === "/api/vehicles" && method === "GET") {
    send(200, { vehicles: repo.vehicleList(user) });
    return true;
  }
  if (path === "/api/vehicles/pair" && method === "POST") {
    limit("pair-user:" + user, 10, 5 * 60_000);
    limit("pair-ip:" + req.socket.remoteAddress, 30, 5 * 60_000);
    send(200, {
      pairing: repo.vehicleClaim(user, await jsonBody(req)),
      vehicles: repo.vehicleList(user),
    });
    return true;
  }
  const match = /^\/api\/vehicles\/([\da-f-]+)\/(deliveries|revoke)$/i.exec(
    path,
  );
  if (!match || !UUID.test(match[1]) || method !== "POST") return false;
  const body = await jsonBody(req);
  if (match[2] === "deliveries") {
    limit("vehicle-send:" + user, 20, 60_000);
    const result = repo.vehiclePublish(user, match[1], body);
    send(200, { ...result, vehicles: repo.vehicleList(user) });
  } else
    send(200, {
      ...repo.vehicleRevoke(user, match[1], body),
      vehicles: repo.vehicleList(user),
    });
  return true;
}
