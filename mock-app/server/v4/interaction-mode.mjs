import { STATUS_TTL_MS } from "../../shared/config/protocol-v4.mjs";
import { DRIVING_ALLOWED_MASKS } from "../../shared/config/driving-v4.mjs";

// This first driving surface is static and contains no business actions or voice transcription.
// Only the observed emulator's baseline and NO_VIDEO|NO_SETUP profiles are enabled.
export function interactionMode(s, now) {
  const v = s.vehicle;
  if (!v.foreground || !v.restrictionKnown || v.seenAt === null ||
      now - v.seenAt >= STATUS_TTL_MS || s.reset || s.recovery || s.social.testRestricted)
    return "blocked";
  const ux = v.uxRestrictions;
  if (!v.restricted && (!ux || (!ux.requiresDo && ux.activeRestrictions === 0))) return "parked";
  if (v.restricted && ux?.requiresDo && DRIVING_ALLOWED_MASKS.includes(ux.activeRestrictions))
    return "driving_limited";
  return "blocked";
}

export function consistentRestriction(status) {
  const ux = status.uxRestrictions;
  // Expiry invalidates restrictionKnown, but retains the last observation for audit/restore.
  return !ux || status.restricted === (ux.requiresDo || ux.activeRestrictions !== 0);
}
