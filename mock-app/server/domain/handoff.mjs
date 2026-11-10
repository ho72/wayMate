import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  STATUS_TTL_MS,
  QUESTIONS,
  summaryFromAnswers,
} from "../../shared/config/protocol.mjs";
import { TRIP } from "../fixtures/trip.mjs";
export function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}
export const sources = (s) => ({
  profile: s.profileVersion,
  publication: s.publicationVersion,
  trip: s.tripVersion,
  connection: 0,
});
export const fresh = (s, now) =>
  s.vehicle.seenAt !== null && now - s.vehicle.seenAt < STATUS_TTL_MS;
export const canLoad = (s, now) =>
  !!s.handoff &&
  fresh(s, now) &&
  s.vehicle.restrictionKnown &&
  !s.vehicle.restricted &&
  s.vehicle.foreground;
export function allowed(s, actor, clientId, now) {
  if (actor === "car") return canLoad(s, now) ? ["CAR_LOADED"] : [];
  if (s.clientId && clientId !== s.clientId) return [];
  return [
    "ONBOARDING_ANSWER",
    ...(Object.keys(QUESTIONS).every((k) => QUESTIONS[k].includes(s.answers[k]))
      ? ["PROFILE_CONFIRM"]
      : []),
    ...(s.profile ? ["PROFILE_PRIVATE", "TRIP_SAVE"] : []),
    ...(s.profile && s.trip && s.publication === "private"
      ? ["HANDOFF_PREPARE"]
      : []),
  ];
}
function invalidate(s) {
  s.handoff = null;
  s.ack = null;
}
export function apply(s, c, clientId, now) {
  const p = c.payload;
  if (c.actor === "web") {
    if (s.clientId && s.clientId !== clientId)
      fail(403, "ACTOR_FORBIDDEN", "다른 웹 클라이언트의 여행입니다.");
    s.clientId ??= clientId;
  }
  if (
    c.type === "CAR_LOADED" &&
    (!s.handoff ||
      p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
      p.handoffId !== s.handoff.handoffId ||
      p.handoffVersion !== s.handoff.handoffVersion ||
      !isDeepStrictEqual(p.sourceVersions, s.handoff.sourceVersions))
  )
    fail(409, "STALE_STATE", "최신 차량 세션과 전달본을 확인하세요.");
  if (
    !["CAR_SESSION_OPEN", "CAR_STATUS"].includes(c.type) &&
    !allowed(s, c.actor, clientId, now).includes(c.type)
  ) {
    fail(
      c.actor === "car" ? 423 : 409,
      c.actor === "car" ? "RESTRICTED" : "NOT_READY",
      "현재 상태에서는 실행할 수 없습니다.",
    );
  }
  switch (c.type) {
    case "ONBOARDING_ANSWER":
      if (!QUESTIONS[p.questionId].includes(p.answerPresetId))
        fail(400, "INVALID_PAYLOAD", "질문에 맞는 선택지가 아닙니다.");
      if (s.answers[p.questionId] !== p.answerPresetId) {
        s.answers[p.questionId] = p.answerPresetId;
        s.profile = null;
        s.publication = "pending";
        invalidate(s);
      }
      break;
    case "PROFILE_CONFIRM": {
      const alias = p.alias.normalize("NFC").trim();
      if (
        !alias ||
        [...alias].length > 10 ||
        /[\r\n]/.test(alias) ||
        !isDeepStrictEqual(p.summary, summaryFromAnswers(s.answers))
      )
        fail(
          400,
          "INVALID_PAYLOAD",
          "별명 또는 확인한 요약이 올바르지 않습니다.",
        );
      s.profile = { ...p, alias };
      s.profileVersion++;
      s.publication = "pending";
      invalidate(s);
      break;
    }
    case "PROFILE_PRIVATE":
      if (
        p.profileVersion !== s.profileVersion ||
        p.publicationVersion !== s.publicationVersion
      )
        fail(409, "STALE_STATE", "프로필 버전이 바뀌었습니다.");
      if (s.publication !== "private") {
        s.publication = "private";
        s.publicationVersion++;
        invalidate(s);
      }
      break;
    case "TRIP_SAVE":
      s.trip = { ...TRIP };
      s.tripVersion++;
      invalidate(s);
      break;
    case "HANDOFF_PREPARE":
      if (s.publication !== "private")
        fail(409, "NOT_READY", "본인 여행용 비공개 선택을 먼저 확인하세요.");
      if (!s.handoff) {
        s.handoffCounter++;
        s.handoff = {
          schemaVersion: 2,
          runSeq: s.runSeq,
          runId: s.runId,
          handoffId: randomUUID(),
          handoffVersion: s.handoffCounter,
          sourceVersions: sources(s),
          mode: "my_trip",
          owner: structuredClone(s.profile),
          ownerTrip: { ...s.trip },
          peer: null,
        };
        s.ack = null;
      }
      break;
    case "CAR_SESSION_OPEN":
      if (
        s.vehicle.deviceId &&
        s.vehicle.deviceId !== p.deviceId &&
        fresh(s, now)
      )
        fail(409, "INVALID_TRANSITION", "다른 차량이 연결되어 있습니다.");
      s.vehicle = {
        deviceId: p.deviceId,
        vehicleSessionId: p.vehicleSessionId,
        vehicleEpoch: s.vehicle.vehicleEpoch + 1,
        statusSeq: 0,
        restrictionKnown: false,
        restricted: true,
        foreground: false,
        seenAt: null,
      };
      break;
    case "CAR_STATUS":
      if (
        p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
        p.statusSeq <= s.vehicle.statusSeq
      )
        fail(
          409,
          "STALE_STATE",
          "현재 세션의 증가하는 상태 번호가 필요합니다.",
        );
      Object.assign(s.vehicle, { ...p, seenAt: now });
      break;
    case "CAR_LOADED":
      s.ack = { handoffId: p.handoffId, vehicleSessionId: p.vehicleSessionId };
      break;
  }
}
