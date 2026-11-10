import { isDeepStrictEqual } from "node:util";
import { QUESTIONS, summaryFromAnswers } from "../shared/config/protocol.mjs";
import { sources } from "./domain/handoff.mjs";
import { randomUUID } from "node:crypto";
import { assertContract } from "./validation.mjs";
export function initialState() {
  return {
    schemaVersion: 2,
    storeId: randomUUID(),
    runSeq: 1,
    runId: randomUUID(),
    version: 0,
    clientId: null,
    answers: {},
    profile: null,
    profileVersion: 0,
    publication: "pending",
    publicationVersion: 0,
    trip: null,
    tripVersion: 0,
    handoff: null,
    handoffCounter: 0,
    ack: null,
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
  if (
    s.profile &&
    (s.profile.alias !== s.profile.alias.normalize("NFC").trim() ||
      !Object.keys(QUESTIONS).every((k) =>
        QUESTIONS[k].includes(s.answers[k]),
      ) ||
      !isDeepStrictEqual(s.profile.summary, summaryFromAnswers(s.answers)))
  )
    throw new Error("잘못된 프로필 원본");
  if (s.publication === "private" && !s.profile)
    throw new Error("확인된 프로필이 없는 비공개 상태");
  if (
    s.handoff &&
    (s.handoff.runId !== s.runId ||
      s.handoff.runSeq !== s.runSeq ||
      s.handoff.handoffVersion !== s.handoffCounter ||
      !isDeepStrictEqual(s.handoff.sourceVersions, sources(s)) ||
      !isDeepStrictEqual(s.handoff.owner, s.profile) ||
      !isDeepStrictEqual(s.handoff.ownerTrip, s.trip))
  )
    throw new Error("전달본과 원본 버전이 일치하지 않습니다.");
  if (s.ack && s.ack.handoffId !== s.handoff?.handoffId)
    throw new Error("수신 확인과 전달본이 일치하지 않습니다.");
  for (const [key, v] of Object.entries(s.receipts))
    if (
      key !== `${v.command.runId}:${v.command.actor}:${v.command.commandId}` ||
      v.receipt.commandId !== v.command.commandId ||
      v.receipt.runId !== v.command.runId ||
      v.receipt.committedVersion > s.version
    )
      throw new Error("잘못된 영수증");
}
