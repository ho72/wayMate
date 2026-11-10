export const SCHEMA_VERSION = 2;
export const SCOPE = "handoff-my-trip-v1";
export const POLL_MS = 500;
export const STATUS_TTL_MS = 2000;
export const QUESTIONS = {
  interests: ["sea_walk", "cafe", "sea_walk_cafe"],
  activity: ["walk_first_photos_occasional"],
  pace: ["relaxed"],
  conversation: ["quiet"],
};
export function summaryFromAnswers(a) {
  return {
    interests:
      a.interests === "sea_walk_cafe" ? ["sea_walk", "cafe"] : [a.interests],
    activityPreference: a.activity,
    pace: a.pace,
    conversationStyle: a.conversation,
    expressionPresetIds: ["quiet-companion"],
  };
}
