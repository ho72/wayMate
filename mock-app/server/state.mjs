import { isDeepStrictEqual } from "node:util";
import { questionOrder } from "../shared/config/protocol.mjs";
import { randomUUID } from "node:crypto";
import { sources, owner, approval } from "./domain/handoff.mjs";
import { assertContract } from "./validation.mjs";
export function initialState() {
  return {
    schemaVersion: 3,
    storeId: randomUUID(),
    runSeq: 1,
    runId: randomUUID(),
    version: 0,
    clientId: null,
    onboarding: {},
    onboardingRevision: 0,
    profile: null,
    profileVersion: 0,
    publication: "pending",
    publicationVersion: 0,
    publicApproval: {
      status: "pending",
      profileVersion: 0,
      publicationVersion: 0,
      approvedFields: [],
      introTemplateId: null,
    },
    trip: null,
    tripVersion: 0,
    tripShareVersion: 0,
    handoff: null,
    handoffCounter: 0,
    ack: null,
    vehicleActivation: null,
    journeyMode: null,
    vehicle: {
      deviceId: null,
      vehicleSessionId: null,
      vehicleEpoch: 0,
      statusSeq: 0,
      restrictionKnown: false,
      restricted: true,
      foreground: false,
      seenAt: null,
    },
    receipts: {},
  };
}
export function validateStore(s) {
  assertContract("store", s);
  if (!isDeepStrictEqual(s.publicApproval, approval(s)))
    throw new Error("공개 승인 버전 불일치");
  for (const a of Object.values(s.onboarding))
    if (!a.answerText.trim() || a.revision > s.onboardingRevision)
      throw new Error("잘못된 답변 원본");
  if (s.publication === "private" && !s.profile)
    throw new Error("프로필 없는 비공개 상태");
  if (
    s.profile &&
    s.vehicleActivation?.origin !== "demo_preset" &&
    !questionOrder(s.onboarding).every((k) => s.onboarding[k]?.confirmed)
  )
    throw new Error("미확인 답변의 프로필");
  if (
    s.profile &&
    (s.profile.alias !== s.profile.alias.normalize("NFC").trim() ||
      s.profile.version !== s.profileVersion)
  )
    throw new Error("잘못된 프로필 원본");
  if (
    s.handoff &&
    (s.handoff.runId !== s.runId ||
      s.handoff.runSeq !== s.runSeq ||
      s.handoff.handoffVersion !== s.handoffCounter ||
      !isDeepStrictEqual(s.handoff.sourceVersions, sources(s)) ||
      !isDeepStrictEqual(s.handoff.owner, owner(s)) ||
      !isDeepStrictEqual(s.handoff.ownerTrip, s.trip))
  )
    throw new Error("전달본과 원본 버전이 일치하지 않습니다.");
  if (s.ack && s.ack.handoffId !== s.handoff?.handoffId)
    throw new Error("수신 확인 불일치");
  if (
    s.vehicleActivation &&
    (!s.profile ||
      !s.trip ||
      s.vehicleActivation.profileVersion !== s.profileVersion ||
      s.vehicleActivation.tripVersion !== s.tripVersion)
  )
    throw new Error("활성 여정 불일치");
  for (const [key, v] of Object.entries(s.receipts))
    if (
      key !== `${v.command.runId}:${v.command.actor}:${v.command.commandId}` ||
      v.receipt.commandId !== v.command.commandId ||
      v.receipt.runId !== v.command.runId ||
      v.receipt.committedVersion > s.version
    )
      throw new Error("잘못된 영수증");
}
