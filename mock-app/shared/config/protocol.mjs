export const SCHEMA_VERSION = 3;
export const SCOPE = "preparation-v3";
export const POLL_MS = 500;
export const STATUS_TTL_MS = 2000;
// Prepared demo dialogue, never a claim of language analysis or generated follow-up questions.
export const QUESTIONS = {
  interests: {
    prompt: "쉬는 날엔 뭘 할 때 제일 좋아?",
    example: "바다 보면서 멍때리다가 카페 가는 게 좋아 ㅋㅋ",
  },
  activity: {
    prompt: "여행할 때는 어떤 식으로 시간을 보내는 편이야?",
    example: "한 곳에 오래 있는 편이야. 사진도 가끔 찍고.",
  },
  conversation: {
    prompt: "처음 만난 사람이랑은 어떤 대화가 편해?",
    example: "말이 많지 않아도 편한 게 좋아.",
  },
  expression: {
    prompt: "널 소개할 땐 어떤 느낌으로 말해주면 좋겠어?",
    example: "편하게 말하고, 가벼운 농담도 조금 해줘 ㅎㅎ",
  },
  food_detail: {
    prompt: "어떤 음식 종류를 가장 좋아해?",
    example: "따뜻한 국물 요리!",
  },
};
export const BASE_QUESTIONS = [
  "interests",
  "activity",
  "conversation",
  "expression",
];
// One exact, prepared cue; arbitrary free text is not classified or converted into profile enums.
export const FOOD_CUE = "맛집 탐방을 좋아해";
export function questionOrder(onboarding) {
  return onboarding.interests?.answerText === FOOD_CUE
    ? ["interests", "food_detail", ...BASE_QUESTIONS.slice(1)]
    : BASE_QUESTIONS;
}
export function emptySummary() {
  return {
    interests: [],
    activityPreference: null,
    pace: null,
    conversationStyle: null,
    speakingStyle: null,
    expressionPresetIds: [],
    summarySource: "user_confirmed_demo",
  };
}
