import { error, UUID, validate } from "./contracts.mjs";
export const VEHICLE_SCOPE = "account-trip-v1";
export const PAIR_TTL_MS = 5 * 60_000;
export const VEHICLE_FRESH_MS = 12_000;
export function fields(body, names) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== names.length ||
    names.some((k) => !Object.hasOwn(body, k))
  )
    throw error(422, "INVALID_INPUT", "요청 내용을 다시 확인해 주세요.");
}
export function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value))
    throw error(422, "INVALID_INPUT", "요청 번호를 확인해 주세요.");
  return value;
}
export function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw error(422, "INVALID_INPUT", "정보 버전을 확인해 주세요.");
  return value;
}
export function uxReport(ux) {
  fields(ux, ["known", "requiresDo", "activeRestrictions", "foreground"]);
  if (
    [ux.known, ux.requiresDo, ux.foreground].some(
      (x) => typeof x !== "boolean",
    ) ||
    !Number.isInteger(ux.activeRestrictions) ||
    ux.activeRestrictions < 0 ||
    ux.activeRestrictions > 511
  )
    throw error(422, "INVALID_INPUT", "차량 상태를 확인해 주세요.");
  return ux;
}
export function parked(ux, seenAt, now) {
  return (
    !!ux &&
    now >= seenAt &&
    now - seenAt < VEHICLE_FRESH_MS &&
    ux.known &&
    ux.foreground &&
    !ux.requiresDo &&
    ux.activeRestrictions === 0
  );
}
export function tripSnapshot(user, trip) {
  const plan = JSON.parse(trip.body);
  validate("trip", plan);
  return {
    profileVersion: user.profileVersion,
    owner: {
      displayName: user.profile.displayName,
      avatar: user.profile.avatar,
    },
    trip: { id: trip.id, plan },
  };
}
