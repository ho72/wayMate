import { callBusy, callResponses, closeCall } from "./call.mjs";
import { mockPending } from "./mock-navigation.mjs";
import {
  closeContent,
  messageResponses,
  contentAvailable,
} from "./content.mjs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { fail, parked, sources } from "./handoff.mjs";
export const peer = Object.freeze({
  alias: "솔바람",
  avatarId: "b-01",
  publicProfileVersion: 1,
  description: "바다를 먼저 보고, 조용한 카페에서 쉬는 여행을 좋아해요.",
  interests: ["sea_walk", "cafe"],
  speakingStyle: "calm",
  approvedFields: [
    "alias",
    "avatarId",
    "interests",
    "pace",
    "activityPreference",
    "conversationStyle",
    "expressionPresetIds",
    "speakingStyle",
  ],
  pace: "relaxed",
  activityPreference: "walk_first_photos_occasional",
  conversationStyle: "quiet",
  expressionPresetIds: ["slow_ok"],
});
export const initialSocial = () => ({
  connection: {
    id: null,
    requestId: null,
    status: "none",
    version: 0,
    attempted: false,
    sharedWindow: ["14:00", "15:00"],
  },
  meeting: {
    proposalId: null,
    requestId: null,
    connectionId: null,
    status: "none",
    placeId: "fiction-cafe-01",
    name: "바다쉼표 카페",
    date: "2026-11-14",
    start: "14:15",
    end: "14:35",
    aConsent: false,
    bConsent: false,
  },
  tripShareApproved: false,
  approvedFields: [],
  testRestricted: false,
  cancelledCommands: [],
});
export const publicReady = (s) =>
  !!s.profile &&
  !!s.trip &&
  s.publication === "published" &&
  s.social.approvedFields.includes("alias") &&
  s.social.approvedFields.includes("avatarId") &&
  s.social.tripShareApproved;
export const linked = (s) =>
  publicReady(s) && s.social.connection.status === "linked";
export const connectionVersions = (s) => ({
  ...sources(s),
  publication: s.publicationVersion,
  tripShare: s.tripShareVersion,
  connection: s.social.connection.version,
});
export const unresolved = (s) =>
  mockPending(s) ||
  s.navigation?.attempts.some((a) =>
    ["pending", "unknown"].includes(a.outcome),
  ) ||
  false;
export const canSocial = (s, now) =>
  !!s.vehicleActivation &&
  s.vehicleActivation.deviceId === s.vehicle.deviceId &&
  s.journeyMode === "connected" &&
  linked(s) &&
  parked(s, now) &&
  !s.social.testRestricted &&
  !unresolved(s);
export const socialTypes = new Set([
  "PROFILE_PUBLISH",
  "TRIP_SHARE_CONFIRM",
  "CONNECT_REQUEST",
  "CONNECT_CANCEL",
  "CONFIRM_WINDOW",
  "CONNECT_END",
  "MEETING_PROPOSE",
  "MEETING_CANCEL",
  "MEETING_DECLINE",
  "B_RESPONSE",
  "SET_TEST_RESTRICTION",
  "PROFILE_PRIVATE",
]);
const binding = (commandType, target = {}, payload = {}) => ({
  commandType,
  target,
  payload,
});
export function socialBindings(s, actor, now) {
  const c = s.social.connection,
    m = s.social.meeting,
    b = {};
  if (
    actor === "web" &&
    !s.vehicleActivation &&
    s.profile &&
    s.trip &&
    !c.attempted
  ) {
    b.PROFILE_PUBLISH = binding(
      "PROFILE_PUBLISH",
      {},
      {
        profileVersion: s.profileVersion,
        approvedFields: ["alias", "avatarId"],
      },
    );
    b.TRIP_SHARE_CONFIRM = binding(
      "TRIP_SHARE_CONFIRM",
      {},
      { tripVersion: s.tripVersion, approved: true },
    );
    if (publicReady(s))
      b.CONNECT_REQUEST = binding(
        "CONNECT_REQUEST",
        {},
        { candidateId: "B", sourceVersions: connectionVersions(s) },
      );
  }
  if (
    actor === "web" &&
    !s.vehicleActivation &&
    ["requested", "accepted"].includes(c.status)
  )
    b.CONNECT_CANCEL = binding("CONNECT_CANCEL", {
      connectionId: c.id,
      requestId: c.requestId,
    });
  if (
    actor === "web" &&
    !s.vehicleActivation &&
    c.status === "accepted" &&
    publicReady(s)
  )
    b.CONFIRM_WINDOW = binding(
      "CONFIRM_WINDOW",
      { connectionId: c.id, requestId: c.requestId },
      { sharedWindow: c.sharedWindow },
    );
  if (
    ["web", "car"].includes(actor) &&
    ["requested", "accepted", "linked"].includes(c.status) &&
    ((actor === "web" && !s.vehicleActivation) ||
      (actor === "car" && s.vehicleActivation))
  )
    b.CONNECT_END = binding("CONNECT_END", { connectionId: c.id });
  if (
    ["web", "car"].includes(actor) &&
    s.profile &&
    !["requested", "accepted", "linked"].includes(c.status) &&
    (actor === "car" ? !!s.vehicleActivation : !s.vehicleActivation)
  )
    b.PROFILE_PRIVATE = binding(
      "PROFILE_PRIVATE",
      {},
      {
        profileVersion: s.profileVersion,
        publicationVersion: s.publicationVersion,
      },
    );
  if (
    actor === "car" &&
    canSocial(s, now) &&
    m.status === "none" &&
    !callBusy(s)
  ) {
    b.MEETING_PROPOSE = binding(
      "MEETING_PROPOSE",
      { connectionId: c.id },
      { placeId: m.placeId },
    );
    b.MEETING_DECLINE = binding("MEETING_DECLINE", { connectionId: c.id });
  }
  // Cancellation is a stop action and remains available under vehicle/SDK locks.
  if (
    actor === "car" &&
    s.vehicleActivation &&
    ["proposed", "confirmed"].includes(m.status)
  )
    b.MEETING_CANCEL = binding("MEETING_CANCEL", {
      connectionId: m.connectionId,
      proposalId: m.proposalId,
    });
  return b;
}
function webOwner(s, id) {
  if (s.clientId && s.clientId !== id)
    fail(403, "ACTOR_FORBIDDEN", "준비한 브라우저에서 계속해 주세요.");
  s.clientId ??= id;
}
function targetConnection(s, t) {
  if (t.connectionId !== s.social.connection.id)
    fail(409, "STALE_STATE", "현재 연결을 다시 확인해 주세요.");
}
function cancelMeeting(s) {
  closeContent(s);
  const m = s.social.meeting;
  if (["proposed", "confirmed"].includes(m.status)) {
    m.status = "cancelled";
    m.aConsent = false;
    m.bConsent = false;
  }
}
export function applySocial(s, c, id, now) {
  const p = c.payload,
    t = c.target,
    a = c.actor,
    con = s.social.connection,
    m = s.social.meeting;
  if (a === "web") webOwner(s, id);
  if (
    [
      "PROFILE_PUBLISH",
      "TRIP_SHARE_CONFIRM",
      "CONNECT_REQUEST",
      "CONFIRM_WINDOW",
      "CONNECT_CANCEL",
    ].includes(c.type) &&
    s.vehicleActivation
  )
    fail(409, "INVALID_TRANSITION", "차량에서 여행을 이어가고 있어요.");
  if (
    ["PROFILE_PUBLISH", "TRIP_SHARE_CONFIRM"].includes(c.type) &&
    con.attempted
  )
    fail(
      409,
      "INVALID_TRANSITION",
      "연결 요청 후에는 준비를 다시 설정할 수 없어요.",
    );
  if (c.type === "SET_TEST_RESTRICTION") {
    s.social.testRestricted = p.enabled;
    return;
  }
  if (c.type === "B_RESPONSE") {
    targetConnection(s, t);
    if (t.kind === "connection") {
      if (
        t.requestId !== con.requestId ||
        t.proposalId !== null ||
        con.status !== "requested" ||
        !["accept", "reject"].includes(p.decision)
      )
        fail(409, "STALE_STATE", "응답할 현재 연결 요청이 없어요.");
      con.status = p.decision === "accept" ? "accepted" : "declined";
      con.version++;
      s.handoff = null;
      s.ack = null;
      return;
    }
    if (
      t.proposalId !== m.proposalId ||
      t.requestId !== m.requestId ||
      t.connectionId !== m.connectionId
    )
      fail(409, "STALE_STATE", "응답할 현재 만남 제안이 아니에요.");
    if (
      p.decision === "cancel" &&
      ["proposed", "confirmed"].includes(m.status)
    ) {
      cancelMeeting(s);
      return;
    }
    if (
      m.status !== "proposed" ||
      !canSocial(s, now) ||
      !["accept", "reject"].includes(p.decision)
    )
      fail(
        423,
        "RESTRICTED",
        "정차·활성 차량에서 현재 만남 제안을 확인해 주세요.",
      );
    m.bConsent = p.decision === "accept";
    m.status = p.decision === "accept" ? "confirmed" : "declined";
    if (m.status === "declined") closeContent(s);
    return;
  }
  const actions = socialBindings(s, a, now);
  if (!actions[c.type])
    fail(
      a === "car" ? 423 : 409,
      a === "car" ? "RESTRICTED" : "NOT_READY",
      "현재 상태에서는 이 동작을 실행할 수 없어요.",
    );
  switch (c.type) {
    case "PROFILE_PUBLISH":
      if (
        p.profileVersion !== s.profileVersion ||
        !p.approvedFields.includes("alias") ||
        !p.approvedFields.includes("avatarId")
      )
        fail(409, "STALE_STATE", "현재 소개와 최소 공개 항목을 확인해 주세요.");
      if (
        s.publication !== "published" ||
        !equal(p.approvedFields, s.social.approvedFields)
      ) {
        s.publication = "published";
        s.publicationVersion++;
        s.social.approvedFields = [...p.approvedFields];
        s.handoff = null;
        s.ack = null;
      }
      break;
    case "TRIP_SHARE_CONFIRM":
      if (p.tripVersion !== s.tripVersion)
        fail(409, "STALE_STATE", "현재 여행 요약을 다시 확인해 주세요.");
      if (s.social.tripShareApproved !== p.approved) {
        s.social.tripShareApproved = p.approved;
        s.tripShareVersion++;
        s.handoff = null;
        s.ack = null;
      }
      break;
    case "PROFILE_PRIVATE":
      if (
        p.profileVersion !== s.profileVersion ||
        p.publicationVersion !== s.publicationVersion
      )
        fail(409, "STALE_STATE", "현재 소개 버전을 확인해 주세요.");
      if (s.publication !== "private") {
        s.publication = "private";
        s.publicationVersion++;
        s.social.approvedFields = [];
        if (!s.vehicleActivation) {
          s.handoff = null;
          s.ack = null;
        }
      }
      break;
    case "CONNECT_REQUEST":
      if (!equal(p.sourceVersions, connectionVersions(s)))
        fail(409, "STALE_STATE", "공개 소개와 계획 버전이 바뀌었어요.");
      con.createdBy = c.commandId;
      con.id = randomUUID();
      con.requestId = randomUUID();
      con.attempted = true;
      con.status = "requested";
      con.version++;
      s.handoff = null;
      s.ack = null;
      break;
    case "CONFIRM_WINDOW":
      targetConnection(s, t);
      if (
        t.requestId !== con.requestId ||
        !equal(p.sharedWindow, con.sharedWindow)
      )
        fail(409, "STALE_STATE", "수락한 공통 시간을 확인해 주세요.");
      con.status = "linked";
      con.version++;
      s.handoff = null;
      s.ack = null;
      break;
    case "CONNECT_CANCEL":
      targetConnection(s, t);
      if (t.requestId !== con.requestId)
        fail(409, "STALE_STATE", "취소할 요청이 바뀌었어요.");
      con.status = "cancelled";
      con.version++;
      s.handoff = null;
      s.ack = null;
      break;
    case "CONNECT_END":
      targetConnection(s, t);
      con.status = "ended";
      con.version++;
      cancelMeeting(s);
      if (!s.vehicleActivation) {
        s.handoff = null;
        s.ack = null;
      }
      break;
    case "MEETING_PROPOSE":
      targetConnection(s, t);
      m.createdBy = c.commandId;
      m.connectionId = con.id;
      m.proposalId = randomUUID();
      m.requestId = randomUUID();
      m.aConsent = true;
      m.bConsent = false;
      m.status = "proposed";
      break;
    case "MEETING_CANCEL":
      if (t.connectionId !== m.connectionId || t.proposalId !== m.proposalId)
        fail(409, "STALE_STATE", "취소할 만남이 바뀌었어요.");
      cancelMeeting(s);
      break;
    case "MEETING_DECLINE":
      targetConnection(s, t);
      m.status = "declined";
      con.status = "ended";
      con.version++;
      closeContent(s);
      break;
  }
}
export function socialProjection(s, actor, now) {
  const c = s.social.connection,
    m = s.social.meeting;
  const pending = [
    ...messageResponses(s, actor, now),
    ...callResponses(s, actor),
  ];
  if (actor === "operator" && c.status === "requested")
    pending.push({
      kind: "connection",
      requestId: c.requestId,
      connectionId: c.id,
      proposalId: null,
    });
  if (actor === "operator" && ["proposed", "confirmed"].includes(m.status))
    pending.push({
      kind: "meeting",
      requestId: m.requestId,
      connectionId: m.connectionId,
      proposalId: m.proposalId,
    });
  const candidates =
    actor === "web" && !s.vehicleActivation && publicReady(s) && !c.attempted
      ? [
          {
            id: "B",
            name: "솔바람",
            reason:
              s.social.approvedFields.includes("interests") &&
              s.profile.privateSummary.interests.some((i) =>
                peer.interests.includes(i),
              )
                ? "공개한 관심사와 공통 시간이 맞아요."
                : "같은 날 강릉 해변권 · 공통 시간 14:00~15:00",
            detailAvailable: true,
          },
          {
            id: "C",
            name: "후보 C",
            reason: "비교용 요약 · 활동 위주의 여행",
            detailAvailable: false,
          },
          {
            id: "D",
            name: "후보 D",
            reason: "비교용 요약 · 다른 시간대의 여행",
            detailAvailable: false,
          },
        ]
      : [];
  const activePeer =
    linked(s) && (actor !== "car" || s.journeyMode === "connected");
  return {
    connection: structuredClone(c),
    meeting: structuredClone(m),
    peer: activePeer || (actor === "web" && publicReady(s)) ? peer : null,
    testRestricted: s.social.testRestricted,
    tripShareApproved: s.social.tripShareApproved,
    approvedFields: s.social.approvedFields,
    candidates,
    cleanupRequired:
      (!!s.navigation?.owned || !!s.mockNavigation?.owned) &&
      ["cancelled", "ended"].includes(m.status),
    pendingResponses: pending,
    callResponseEnabled:
      actor === "operator" && canSocial(s, now) && !s.reset && !s.recovery,
    messageResponseEnabled:
      actor === "operator" &&
      contentAvailable(s) &&
      canSocial(s, now) &&
      !s.reset &&
      !s.recovery,
    navMapping: {
      storyPlace: "바다쉼표 카페",
      sdkPlace: "소프트웨어드림센터",
      source: "separate_sdk_fixture",
    },
  };
}

export function cancelPending(s, c, id) {
  const { originalCommandId, originalType } = c.payload;
  if (c.actor === "web") webOwner(s, id);
  const permitted =
    c.actor === "web"
      ? ["CONNECT_REQUEST"]
      : ["MEETING_PROPOSE", "NAV_APPROVE", "MESSAGE_SEND", "CALL_PROPOSE"];
  if (!permitted.includes(originalType))
    fail(403, "ACTOR_FORBIDDEN", "취소할 수 있는 생성 요청이 아니에요.");
  const hit = s.receipts[`${s.runId}:${c.actor}:${originalCommandId}`];
  if (hit && (hit.command.type !== originalType || hit.clientId !== id))
    fail(409, "STALE_STATE", "원래 요청의 역할과 종류를 확인해 주세요.");
  if (
    !s.social.cancelledCommands.some((x) => x.commandId === originalCommandId)
  )
    s.social.cancelledCommands.push({
      commandId: originalCommandId,
      type: originalType,
      actor: c.actor,
    });
  if (originalType === "CONNECT_REQUEST") {
    if (hit && s.social.connection.createdBy !== originalCommandId)
      fail(409, "STALE_STATE", "현재 연결과 다른 요청이에요.");
    if (
      (!hit && !s.social.connection.attempted) ||
      (hit &&
        ["requested", "accepted", "linked"].includes(
          s.social.connection.status,
        ))
    ) {
      s.social.connection.attempted = true;
      s.social.connection.status = "cancelled";
      s.social.connection.version++;
      cancelMeeting(s);
      if (!s.vehicleActivation) {
        s.handoff = null;
        s.ack = null;
      }
    }
  } else if (originalType === "MEETING_PROPOSE") {
    if (hit) {
      if (s.social.meeting.createdBy !== originalCommandId)
        fail(409, "STALE_STATE", "현재 제안과 다른 요청이에요.");
      cancelMeeting(s);
    } else if (s.social.meeting.status === "none") {
      // Reserve a cancelled first attempt, but never replace another proposal.
      mStatusCancelled(s);
    }
  } else if (hit && originalType === "CALL_PROPOSE") {
    if (s.call?.createdBy !== originalCommandId)
      fail(409, "STALE_STATE", "현재 통화와 다른 요청이에요.");
    closeCall(s);
  } else if (hit && originalType === "NAV_APPROVE") {
    const mock = s.mockNavigation?.attempts.find(
      (a) => a.approvalCommandId === originalCommandId,
    );
    if (mock?.outcome === "pending") {
      mock.outcome = "not_dispatched";
      mock.dispatch = "settled";
    }
    const a = s.navigation?.attempts.find(
      (a) => a.approvalCommandId === originalCommandId,
    );
    if (a?.dispatch === "not_started" && a.outcome === "pending")
      a.outcome = "not_dispatched";
    // Cancelling a navigation approval neither revokes meeting consent nor
    // claims that an already dispatched physical operation has been undone.
  }
}

function mStatusCancelled(s) {
  closeContent(s);
  const m = s.social.meeting;
  m.status = "cancelled";
  m.aConsent = false;
  m.bConsent = false;
  m.connectionId = s.social.connection.id;
}
