// Prepared local output only: no microphone, STT, or automatic playback on mode changes.
import policy from "./driving-policy.json" with { type: "json" };
export const DRIVING_ALLOWED_MASKS = Object.freeze([...policy.allowedMasks]);
export const DRIVING_NARRATION = "천천히, 안전하게 가요. 일정이랑 다음 이야기는 정차한 뒤 함께 확인해요.";
