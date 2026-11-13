import { validateCall } from "./call.mjs";
import { validateMockNavigation } from "./mock-navigation.mjs";
import { initialStory, validateEnding } from "./ending.mjs";
import { initialContent, validateContent } from "./content.mjs";
import { initialSocial, connectionVersions, linked } from "./social.mjs";
import { validateNavigation, validEvidence, identity } from "./navigation.mjs";
import { isDeepStrictEqual } from "node:util";
import { questionOrder } from "../../shared/config/protocol-v4.mjs";
import { randomUUID } from "node:crypto";
import { sources, owner, approval } from "./handoff.mjs";
import { assertContract } from "./validation.mjs";
export function initialState() {
  return {
    storyContext: initialStory(),
    finalCheckpoint: null,
    finalRound: 0,
    final: null,
    finalHistory: [],
    replayContext: { mode: "normal", checkpointId: null },
    content: initialContent(),
    call: null,
    mockNavigation: null,
    navigationMode: null,
    reset: null,
    resetHistory: [],
    lateNavigationFacts: [],
    recovery: null,
    social: initialSocial(),
    schemaVersion: 4,
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
const validatedReceipts = new WeakSet();
const validatedArchives = new WeakSet();
const archiveVersions = new WeakMap();
// Validation deeply freezes receipts/archives. Reuse their exact JSON bytes while still
// encoding every mutable business field on each fsync; no history or payload is discarded.
const encodedAudit = new WeakMap();
const OPEN = Buffer.from("{"),
  CLOSE = Buffer.from("}"),
  COMMA = Buffer.from(",");
const ARRAY_OPEN = Buffer.from("["),
  ARRAY_CLOSE = Buffer.from("]");
function auditJSON(value, key = null) {
  const immutable =
    validatedReceipts.has(value) || validatedArchives.has(value);
  const cached = immutable ? encodedAudit.get(value) : null;
  if (cached?.key === key) return cached.bytes;
  const bytes = Buffer.from(
    (key === null ? "" : JSON.stringify(key) + ":") + JSON.stringify(value),
  );
  if (immutable) encodedAudit.set(value, { key, bytes });
  return bytes;
}
export function serializeStore(s) {
  const chunks = [OPEN];
  let first = true;
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) continue;
    if (!first) chunks.push(COMMA);
    first = false;
    chunks.push(Buffer.from(JSON.stringify(key) + ":"));
    if (key === "receipts") {
      chunks.push(OPEN);
      let firstReceipt = true;
      for (const [id, entry] of Object.entries(value)) {
        if (!firstReceipt) chunks.push(COMMA);
        firstReceipt = false;
        chunks.push(auditJSON(entry, id));
      }
      chunks.push(CLOSE);
    } else if (key === "resetHistory") {
      chunks.push(ARRAY_OPEN);
      value.forEach((entry, index) => {
        if (index) chunks.push(COMMA);
        chunks.push(auditJSON(entry));
      });
      chunks.push(ARRAY_CLOSE);
    } else chunks.push(Buffer.from(JSON.stringify(value)));
  }
  chunks.push(CLOSE);
  return Buffer.concat(chunks);
}
function freezeReceipt(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeReceipt(child);
    Object.freeze(value);
  }
}
export function validateStore(s) {
  // Existing entries are deeply immutable. Revalidate new entries only, while
  // keeping every receipt and still validating all business state and invariants.
  assertContract("store", { ...s, receipts: {}, resetHistory: [] });
  if (s.resetHistory !== undefined && !Array.isArray(s.resetHistory))
    throw new Error("잘못된 초기화 기록 목록");
  if (
    !s.receipts ||
    typeof s.receipts !== "object" ||
    Array.isArray(s.receipts)
  )
    throw new Error("잘못된 영수증 저장소");
  for (const value of Object.values(s.receipts))
    if (!validatedReceipts.has(value)) {
      assertContract("receiptEntry", value);
      freezeReceipt(value);
      validatedReceipts.add(value);
    }
  validateNavigation(s);
  validateContent(s);
  validateCall(s);
  validateMockNavigation(s);
  validateEnding(s);
  const history = s.resetHistory || [],
    ids = new Set();
  for (const a of history) {
    if (ids.has(a.runId) || a.runSeq >= s.runSeq)
      throw new Error("초기화 회차 순서 불일치");
    if (validatedArchives.has(a)) {
      if (archiveVersions.get(a) > s.version)
        throw new Error("과거 영수증 버전 불일치");
      ids.add(a.runId);
      continue;
    }
    assertContract("resetArchive", a);
    validateMockNavigation(a);
    if (
      a.mockNavigation?.owned ||
      a.mockNavigation?.attempts.some((x) =>
        ["pending", "unknown"].includes(x.outcome),
      )
    )
      throw new Error("정리가 끝나지 않은 모의 내비 보존 기록");
    if (
      ids.has(a.runId) ||
      a.runSeq >= s.runSeq ||
      a.reset.runId !== a.runId ||
      !a.reset.completedAt ||
      a.reset.newRunId === a.runId ||
      a.navigation?.owned ||
      a.navigation?.attempts.some((x) =>
        ["pending", "unknown"].includes(x.outcome),
      )
    )
      throw new Error("잘못된 초기화 보존 기록");
    ids.add(a.runId);
    validateNavigation(a);
    if (
      a.reset.navigationRequired !== !!a.navigation?.attempts.length ||
      a.reset.requiredDeviceId !== (a.vehicleActivation?.deviceId ?? null)
    )
      throw new Error("과거 초기화 정리 범위 불일치");
    if (a.reset.navigationRequired) {
      const e = a.reset.carAck?.payload.evidence;
      if (
        !e ||
        !validEvidence(e) ||
        !a.navigation.attempts
          .filter((x) => x.operation === "add")
          .every(
            (x) =>
              identity(e.second.destination, x.baseline) &&
              e.second.waypoints.length === x.before.second.waypoints.length &&
              e.second.waypoints.every((w, i) =>
                identity(w, x.before.second.waypoints[i]),
              ),
          )
      )
        throw new Error("실제 경로 증빙 없는 완료 기록");
    }
    if (
      (a.reset.requiredWebClientId && !a.reset.webAck) ||
      (a.reset.requiredDeviceId && !a.reset.carAck)
    )
      throw new Error("필수 ACK 없는 완료 기록");
    if (
      a.reset.carAck &&
      a.reset.carAck.payload.deviceId !== a.reset.requiredDeviceId
    )
      throw new Error("과거 차량 ACK 대상 불일치");
    const maxVersion = Object.values(a.receipts).reduce(
      (max, v) => Math.max(max, v.receipt.committedVersion),
      0,
    );
    if (maxVersion > s.version) throw new Error("과거 영수증 버전 불일치");
    freezeReceipt(a);
    validatedArchives.add(a);
    archiveVersions.set(a, maxVersion);
  }
  Object.freeze(history);
  if (
    s.reset &&
    (s.reset.navigationRequired !== !!s.navigation?.attempts.length ||
      s.reset.requiredDeviceId !== (s.vehicleActivation?.deviceId ?? null) ||
      s.reset.requiredWebClientId !==
        (!s.vehicleActivation ? s.clientId : null))
  )
    throw new Error("현재 초기화 대상 불일치");
  if (
    s.reset &&
    (s.reset.runId !== s.runId ||
      s.reset.runSeq !== s.runSeq ||
      s.reset.completedAt ||
      s.reset.newRunId)
  )
    throw new Error("현재 초기화 회차 불일치");
  const c = s.social.connection,
    m = s.social.meeting;
  if (!c.attempted && c.status !== "none") throw new Error("연결 시도 불일치");
  if (
    ["requested", "accepted", "linked"].includes(c.status) &&
    (!c.id || !c.requestId || !c.createdBy)
  )
    throw new Error("연결 요청 ID 불일치");
  if (
    (["proposed", "confirmed", "started", "ended"].includes(m.status) ||
      (m.status === "cancelled" && m.proposalId !== null)) &&
    (!m.proposalId || !m.requestId || m.connectionId !== c.id)
  )
    throw new Error("만남 제안 ID 불일치");
  if (
    s.publication === "published" &&
    (!s.profile ||
      !s.social.approvedFields.includes("alias") ||
      !s.social.approvedFields.includes("avatarId"))
  )
    throw new Error("공개 소개 승인 불일치");
  if (
    s.social.meeting.status === "confirmed" &&
    (!s.social.meeting.aConsent || !s.social.meeting.bConsent || !linked(s))
  )
    throw new Error("만남 동의 불일치");
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
    !s.vehicleActivation &&
    (s.handoff.runId !== s.runId ||
      s.handoff.runSeq !== s.runSeq ||
      s.handoff.handoffVersion !== s.handoffCounter ||
      !isDeepStrictEqual(
        s.handoff.sourceVersions,
        s.handoff.mode === "connected" ? connectionVersions(s) : sources(s),
      ) ||
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
