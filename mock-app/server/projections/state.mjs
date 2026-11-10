import { allowed, fresh, canLoad } from "../domain/handoff.mjs";
export function project(s, actor, clientId, now) {
  const own = actor === "car" || !s.clientId || clientId === s.clientId;
  const actions = allowed(s, actor, clientId, now);
  return {
    schemaVersion: 2,
    scope: "handoff-my-trip-v1",
    storeId: s.storeId,
    runSeq: s.runSeq,
    runId: s.runId,
    version: s.version,
    view: actor,
    clientId: own ? s.clientId : null,
    answers: own ? s.answers : {},
    profile: own ? s.profile : null,
    profileVersion: s.profileVersion,
    publicationVersion: s.publicationVersion,
    publication: s.publication,
    trip: own ? s.trip : null,
    tripVersion: s.tripVersion,
    handoff:
      own && s.handoff
        ? {
            handoffId: s.handoff.handoffId,
            handoffVersion: s.handoff.handoffVersion,
            sourceVersions: s.handoff.sourceVersions,
            mode: "my_trip",
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
    actionBindings: Object.fromEntries(
      actions.map((a) => [
        a,
        {
          commandType: a,
          target: {},
          payload:
            a === "HANDOFF_PREPARE"
              ? { mode: "my_trip" }
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
                      mode: "my_trip",
                    }
                  : {},
        },
      ]),
    ),
    blockedActions:
      actor === "car" && !canLoad(s, now)
        ? {
            CAR_LOADED: {
              code: "RESTRICTED",
              message: "저장된 여행과 최신 정차·화면 활성 상태가 필요합니다.",
            },
          }
        : {},
  };
}
