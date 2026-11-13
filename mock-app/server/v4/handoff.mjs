import { callTypes, applyCall } from "./call.mjs";
import { consistentRestriction } from "./interaction-mode.mjs";
import { initialMockNavigation, realPending } from "./mock-navigation.mjs";
import { journeyTypes, applyJourney } from "./ending.mjs";
import { applyContent } from "./content.mjs";
import { resetBindings } from "./reset.mjs";
import {
  socialTypes,
  applySocial,
  socialBindings,
  linked,
  publicReady,
  connectionVersions,
  peer,
  unresolved,
} from "./social.mjs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  STATUS_TTL_MS,
  questionOrder,
  emptySummary,
} from "../../shared/config/protocol-v4.mjs";
import { TRIP } from "../fixtures/trip.mjs";
export function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}
export const sources = (s) => ({
  profile: s.profileVersion,
  trip: s.tripVersion,
});
export const fresh = (s, now) =>
  s.vehicle.seenAt !== null && now - s.vehicle.seenAt < STATUS_TTL_MS;
export const parked = (s, now) =>
  fresh(s, now) &&
  s.vehicle.restrictionKnown &&
  !s.vehicle.restricted &&
  consistentRestriction(s.vehicle) &&
  s.vehicle.foreground;
export const canLoad = (s, now) =>
  !s.vehicleActivation &&
  !!s.handoff &&
  parked(s, now) &&
  !s.social.testRestricted &&
  (s.handoff.mode !== "connected" ||
    (linked(s) &&
      isDeepStrictEqual(s.handoff.sourceVersions, connectionVersions(s))));
export const owner = (s) => ({
  alias: s.profile.alias,
  avatarId: s.profile.avatarId,
  speakingStyle: s.profile.privateSummary.speakingStyle,
  summary: structuredClone(s.profile.privateSummary),
});
export const preparation = (s) =>
  s.profile && s.trip
    ? {
        sourceVersions: sources(s),
        owner: owner(s),
        ownerTrip: structuredClone(s.trip),
      }
    : null;
export const approval = (s) => ({
  status: s.publication,
  profileVersion: s.profileVersion,
  publicationVersion: s.publicationVersion,
  approvedFields:
    s.publication === "published" ? [...s.social.approvedFields] : [],
  introTemplateId:
    s.publication !== "published"
      ? null
      : s.social.approvedFields.includes("speakingStyle") &&
          s.profile.privateSummary.speakingStyle
        ? s.profile.privateSummary.speakingStyle === "light_humor"
          ? "INTRO_LIGHT"
          : "INTRO_CALM"
        : "INTRO_NEUTRAL",
});
export function allowed(s, actor, clientId, now) {
  const resetActions = Object.keys(resetBindings(s, actor, clientId, now));
  if (s.reset || s.recovery || actor === "operator") return resetActions;
  const extra = Object.keys(socialBindings(s, actor, now));
  if (actor === "operator") return [];
  if (actor === "car")
    return [
      ...extra,
      ...(!s.vehicleActivation && parked(s, now) && !s.social.testRestricted
        ? [
            ...(canLoad(s, now) ? ["CAR_LOADED"] : []),
            ...(!["requested", "accepted", "linked"].includes(
              s.social.connection.status,
            ) &&
            !unresolved(s) &&
            !s.navigation?.owned &&
            (preparation(s) ||
              (!s.profile && !s.trip && !Object.keys(s.onboarding).length))
              ? ["CAR_START_TRIP"]
              : []),
          ]
        : []),
    ];
  if (s.clientId && clientId !== s.clientId) return [];
  if (s.vehicleActivation) return extra;
  if (s.social.connection.attempted)
    return [
      ...extra,
      ...(s.profile &&
      s.trip &&
      !["requested", "accepted"].includes(s.social.connection.status)
        ? ["HANDOFF_PREPARE"]
        : []),
    ];
  return [
    ...new Set([
      ...extra,
      "ONBOARDING_ANSWER",
      ...(questionOrder(s.onboarding).every((k) => s.onboarding[k]?.confirmed)
        ? ["PROFILE_CONFIRM"]
        : []),
      ...(s.profile ? ["TRIP_SAVE"] : []),
      ...(s.profile && s.trip ? ["HANDOFF_PREPARE"] : []),
    ]),
  ];
}
function invalidate(s) {
  s.handoff = null;
  s.ack = null;
}
function activate(s, origin) {
  s.vehicleActivation = {
    origin,
    profileVersion: s.profileVersion,
    tripVersion: s.tripVersion,
    deviceId: s.vehicle.deviceId,
    vehicleSessionId: s.vehicle.vehicleSessionId,
    confirmedAt: new Date().toISOString(),
  };
  s.journeyMode = origin === "handoff" ? s.handoff.mode : "my_trip";
}
export function apply(s, c, clientId, now) {
  const p = c.payload;
  if (
    callTypes.has(c.type) ||
    (c.type === "B_RESPONSE" && c.target.kind === "call")
  )
    return applyCall(s, c, now);
  if (
    journeyTypes.has(c.type) ||
    (c.type === "B_RESPONSE" && c.target.kind === "final")
  )
    return applyJourney(s, c, now);
  if (
    ["MESSAGE_SEND", "MESSAGE_REPLY"].includes(c.type) ||
    (c.type === "B_RESPONSE" && c.target.kind === "message")
  )
    return applyContent(s, c, now);
  if (socialTypes.has(c.type)) return applySocial(s, c, clientId, now);
  if (c.actor === "web") {
    if (s.clientId && s.clientId !== clientId)
      fail(403, "ACTOR_FORBIDDEN", "다른 웹 클라이언트의 여행입니다.");
    if (s.vehicleActivation)
      fail(
        409,
        "INVALID_TRANSITION",
        "차량에서 여행을 시작했어요. 웹에서는 준비 상태만 확인할 수 있어요.",
      );
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
  )
    fail(
      c.actor === "car" ? 423 : 409,
      c.actor === "car" ? "RESTRICTED" : "NOT_READY",
      "현재 상태에서는 실행할 수 없습니다.",
    );
  switch (c.type) {
    case "ONBOARDING_ANSWER": {
      if (!p.answerText.trim() || [...p.answerText].length > 500)
        fail(
          400,
          "INVALID_PAYLOAD",
          "답변은 공백을 제외한 내용이 있는 1~500자여야 합니다.",
        );
      const order = questionOrder(s.onboarding),
        index = order.indexOf(p.questionId);
      if (
        index < 0 ||
        !order.slice(0, index).every((k) => s.onboarding[k]?.confirmed)
      )
        fail(409, "NOT_READY", "현재 질문부터 답변해 주세요.");
      const old = s.onboarding[p.questionId];
      if (
        old?.answerText !== p.answerText ||
        old?.inputSource !== p.inputSource
      ) {
        s.onboardingRevision++;
        s.onboarding[p.questionId] = {
          answerText: p.answerText,
          inputSource: p.inputSource,
          confirmed: true,
          revision: s.onboardingRevision,
        };
        // Earlier edits invalidate all later replies, including a previous demo branch.
        for (const k of order.slice(index + 1)) delete s.onboarding[k];
        if (p.questionId === "interests") delete s.onboarding.food_detail;
        s.profile = null;
        s.publication = "pending";
        s.publicationVersion++;
        invalidate(s);
      }
      break;
    }
    case "PROFILE_CONFIRM": {
      const alias = p.alias.normalize("NFC").trim();
      if (!alias || [...alias].length > 10 || /[\r\n]/.test(alias))
        fail(400, "INVALID_PAYLOAD", "별명은 줄바꿈 없이 1~10자여야 합니다.");
      s.profileVersion++;
      s.profile = {
        version: s.profileVersion,
        alias,
        avatarId: p.avatarId,
        privateSummary: structuredClone(p.confirmedSummary),
        confirmed: true,
      };
      s.publication = "pending";
      s.publicationVersion++;
      invalidate(s);
      break;
    }
    case "TRIP_SAVE":
      if (!isDeepStrictEqual(s.trip, TRIP)) {
        s.trip = { ...TRIP };
        s.tripVersion++;
        invalidate(s);
      }
      break;
    case "HANDOFF_PREPARE":
      if (
        p.mode === "connected"
          ? !linked(s)
          : ["requested", "accepted", "linked"].includes(
              s.social.connection.status,
            )
      )
        fail(
          409,
          "NOT_READY",
          "모바일에서 연결과 공통 시간을 확인하거나 연결을 종료해 주세요.",
        );
      if (s.handoff?.mode !== p.mode) s.handoff = null;
      if (!s.handoff) {
        s.handoffCounter++;
        s.handoff = {
          schemaVersion: 4,
          runSeq: s.runSeq,
          runId: s.runId,
          handoffId: randomUUID(),
          handoffVersion: s.handoffCounter,
          sourceVersions:
            p.mode === "connected" ? connectionVersions(s) : sources(s),
          mode: p.mode,
          owner: owner(s),
          ownerTrip: { ...s.trip },
          peer: p.mode === "connected" ? peer : null,
          connection:
            p.mode === "connected"
              ? structuredClone(s.social.connection)
              : null,
        };
        s.ack = null;
      }
      break;
    case "CAR_SESSION_OPEN":
      if (p.navigationSource === "mock") {
        if (realPending(s) || s.navigation?.owned || s.recovery)
          fail(
            423,
            "RECOVERY_REQUIRED",
            "실제 내비 정리·복구를 모의 세션으로 대신할 수 없어요.",
          );
        s.navigationMode = "mock";
        s.mockNavigation ??= initialMockNavigation();
      } else if (!s.navigationMode)
        s.navigationMode = p.navigationSource ?? "unsupported";
      if (s.navigation) s.navigation.observation = null;
      if (s.vehicleActivation && s.vehicleActivation.deviceId !== p.deviceId)
        fail(409, "INVALID_TRANSITION", "이미 시작한 차량에서 이어가 주세요.");
      if (
        s.vehicle.deviceId &&
        s.vehicle.deviceId !== p.deviceId &&
        fresh(s, now)
      )
        fail(409, "INVALID_TRANSITION", "다른 차량이 연결되어 있습니다.");
      s.vehicle = {
        navigationSource: p.navigationSource ?? "unsupported",
        deviceId: p.deviceId,
        vehicleSessionId: p.vehicleSessionId,
        vehicleEpoch: s.vehicle.vehicleEpoch + 1,
        statusSeq: 0,
        restrictionKnown: false,
        uxRestrictions: null,
        restricted: true,
        foreground: false,
        seenAt: null,
      };
      break;
    case "CAR_STATUS":
      if (!consistentRestriction(p) || (p.uxRestrictions && !p.restrictionKnown))
        fail(400, "INVALID_TRANSITION", "제한 관측과 restricted 값이 일치하지 않습니다.");
      if (
        p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
        p.statusSeq <= s.vehicle.statusSeq
      )
        fail(
          409,
          "STALE_STATE",
          "현재 세션의 증가하는 상태 번호가 필요합니다.",
        );
      const { displayedCue: _displayedCue, ...status } = p;
      Object.assign(s.vehicle, { ...status, uxRestrictions: p.uxRestrictions ?? null, seenAt: now });
      break;
    case "CAR_LOADED":
      if (
        p.mode !== s.handoff.mode ||
        (p.mode === "connected" &&
          (!linked(s) ||
            !isDeepStrictEqual(
              s.handoff.sourceVersions,
              connectionVersions(s),
            )))
      )
        fail(
          409,
          "STALE_STATE",
          "연결과 공개 정보가 바뀌었어요. 최신 상태를 확인해 주세요.",
        );
      s.ack = { handoffId: p.handoffId, vehicleSessionId: p.vehicleSessionId };
      activate(s, "handoff");
      break;
    case "CAR_START_TRIP":
      if (p.vehicleSessionId !== s.vehicle.vehicleSessionId)
        fail(409, "STALE_STATE", "차량 세션이 바뀌었습니다.");
      if (p.origin === "stored_preparation") {
        if (!preparation(s) || !isDeepStrictEqual(p.sourceVersions, sources(s)))
          fail(409, "STALE_STATE", "저장된 준비의 버전을 다시 확인해 주세요.");
      } else {
        if (s.profile || s.trip || Object.keys(s.onboarding).length)
          fail(
            409,
            "INVALID_TRANSITION",
            "기존 준비를 기본값으로 덮어쓸 수 없습니다.",
          );
        s.profileVersion++;
        s.tripVersion++;
        s.profile = {
          version: s.profileVersion,
          alias: "여행자",
          avatarId: "a-01",
          privateSummary: emptySummary(),
          confirmed: true,
        };
        s.trip = { ...TRIP };
      }
      activate(s, p.origin);
      break;
  }
}
