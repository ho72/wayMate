import { journeyProjection, journeyBindings } from "./ending.mjs";
import { contentProjection, contentBindings } from "./content.mjs";
import { resetView, lastCompletedReset, resetBindings } from "./reset.mjs";
import { socialBindings, socialProjection, linked } from "./social.mjs";
import { allowed, fresh, canLoad, preparation, approval } from "./handoff.mjs";
export function project(s, actor, clientId, now) {
  const own = actor === "car" || !s.clientId || clientId === s.clientId,
    actions = allowed(s, actor, clientId, now);
  const restored =
    actor === "car" &&
    s.vehicleActivation?.deviceId === s.vehicle.deviceId &&
    fresh(s, now) &&
    s.vehicle.restrictionKnown &&
    s.vehicle.foreground;
  const social =
    own || actor === "operator" ? socialProjection(s, actor, now) : null;
  if (social && (s.reset || s.recovery)) social.pendingResponses = [];
  return {
    ...(s.navigation
      ? { navigation: actor === "car" ? s.navigation : null }
      : {}),
    reset: resetView(s, actor, clientId, now),
    lastCompletedReset: lastCompletedReset(s),
    completedRunIds: (s.resetHistory || []).map((a) => a.runId),
    completedNavigation:
      actor === "car"
        ? (s.resetHistory || [])
            .filter((a) => a.reset.requiredDeviceId)
            .map((a) => ({
              runId: a.runId,
              deviceId: a.reset.requiredDeviceId,
              settledAttemptIds:
                a.navigation?.attempts.map((x) => x.attemptId) || [],
            }))
        : [],
    recovery: s.recovery ?? null,
    journey:
      own || actor === "operator" ? journeyProjection(s, actor, now) : null,
    social: social,
    content: contentProjection(s, actor, now),
    schemaVersion: 4,
    scope: "mobile-meeting-v4",
    storeId: s.storeId,
    runSeq: s.runSeq,
    runId: s.runId,
    version: s.version,
    view: actor,
    clientId: own ? s.clientId : null,
    onboarding: actor === "web" && own ? s.onboarding : {},
    profile: actor === "web" && own ? s.profile : null,
    profileVersion: s.profileVersion,
    publicationVersion: s.publicationVersion,
    publication: s.publication,
    publicApproval: approval(s),
    trip: own ? s.trip : null,
    tripVersion: s.tripVersion,
    tripShareVersion: s.tripShareVersion,
    vehicleActivation: own ? s.vehicleActivation : null,
    journeyMode: own ? s.journeyMode : null,
    preparationPreview: actor === "car" && own ? preparation(s) : null,
    activeJourney: restored ? preparation(s) : null,
    handoff:
      own && s.handoff
        ? {
            handoffId: s.handoff.handoffId,
            handoffVersion: s.handoff.handoffVersion,
            sourceVersions: s.handoff.sourceVersions,
            mode: s.handoff.mode,
            acknowledged: s.ack?.handoffId === s.handoff.handoffId,
          }
        : null,
    vehicle: {
      vehicleSessionId: s.vehicle.vehicleSessionId,
      vehicleEpoch: s.vehicle.vehicleEpoch,
      restrictionKnown: s.vehicle.restrictionKnown && fresh(s, now),
      restricted: s.vehicle.restricted,
      foreground: s.vehicle.foreground,
      fresh: fresh(s, now),
    },
    allowedActions: actions,
    actionBindings: {
      ...Object.fromEntries(
        actions.map((a) => [
          a,
          {
            commandType: a,
            target: {},
            payload:
              a === "HANDOFF_PREPARE"
                ? { mode: linked(s) ? "connected" : "my_trip" }
                : a === "PROFILE_PRIVATE"
                  ? {
                      profileVersion: s.profileVersion,
                      publicationVersion: s.publicationVersion,
                    }
                  : a === "CAR_LOADED"
                    ? {
                        vehicleSessionId: s.vehicle.vehicleSessionId,
                        handoffId: s.handoff.handoffId,
                        handoffVersion: s.handoff.handoffVersion,
                        sourceVersions: s.handoff.sourceVersions,
                        mode: s.handoff.mode,
                      }
                    : a === "CAR_START_TRIP"
                      ? preparation(s)
                        ? {
                            origin: "stored_preparation",
                            vehicleSessionId: s.vehicle.vehicleSessionId,
                            sourceVersions: preparation(s).sourceVersions,
                          }
                        : {
                            origin: "demo_preset",
                            vehicleSessionId: s.vehicle.vehicleSessionId,
                            presetId: "gangneung-01",
                          }
                      : {},
          },
        ]),
      ),
      ...(!s.reset && !s.recovery && (own || actor === "operator")
        ? {
            ...socialBindings(s, actor, now),
            ...contentBindings(s, actor, now),
            ...journeyBindings(s, actor, now),
          }
        : {}),
      ...resetBindings(s, actor, clientId, now),
    },
    blockedActions:
      actor === "car" && !canLoad(s, now)
        ? {
            CAR_LOADED: {
              code: "RESTRICTED",
              message: "저장된 전달본과 최신 정차·화면 활성 상태가 필요합니다.",
            },
          }
        : {},
  };
}
