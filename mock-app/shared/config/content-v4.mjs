// Prepared prototype dialogue. Never infer private preferences or a person's current intent.
export const QUESTIONS = [
  { id: "Q1", text: "솔바람은 여행할 때 뭘 제일 좋아해?" },
  { id: "Q2", text: "처음 만나면 무슨 얘기를 하면 좋을까?" },
];
export const MESSAGES = {
  M1: {
    text: "카페에서 쉬었다가 잠깐 바다를 걷는 건 어떠세요?",
    response: "좋아요. 천천히 가도 괜찮죠? 저도 바다 보면서 쉬고 싶었어요.",
  },
  M2: {
    text: "저는 조용한 카페가 편한데, 어떤 분위기를 좋아하세요?",
    response: "저도 조용한 곳이 좋아요. 바다가 보이면 더 좋고요.",
  },
};
export const FOLLOWUP = {
  id: "F1",
  text: "사진 찍는 것과 천천히 걷는 것 중에는 뭘 더 좋아하세요?",
};
export const REPLIES = {
  R1: "저는 천천히 걷는 쪽이 좋아요. 사진은 가끔 한 장씩 찍고요.",
  R2: "사진도 좋아하지만, 오늘은 느긋하게 쉬고 싶어요. 다음 일정도 지키면서요.",
};
export const UNKNOWN = "그건 제가 아는 소개에는 없어요. 직접 물어볼까요?";
export const REPLY_DONE =
  "서로 어떤 여행을 좋아하는지 조금 알게 됐네. 이 답장만으로 만남이 정해진 건 아니야. 다음은 네가 고르면 돼.";
export function profileAnswer(questionId, peer, ownerPublicInterests = []) {
  const fields = peer?.approvedFields || [];
  const has = (key) => fields.includes(key);
  const seaCafe =
    has("interests") &&
    ["sea_walk", "cafe"].every((x) => peer.interests?.includes(x));
  if (
    questionId === "Q1" &&
    seaCafe &&
    has("pace") &&
    peer.pace === "relaxed" &&
    has("activityPreference") &&
    peer.activityPreference === "walk_first_photos_occasional" &&
    has("expressionPresetIds") &&
    peer.expressionPresetIds?.includes("slow_ok")
  )
    return "천천히 가도 괜찮죠. 솔바람은 바다를 먼저 보고, 조용한 카페에서 커피 한 잔 하는 걸 좋아해요. 사진도 좋지만 느긋하게 걷는 쪽이래요.";
  if (
    questionId === "Q2" &&
    seaCafe &&
    has("conversationStyle") &&
    peer.conversationStyle === "quiet" &&
    ["sea_walk", "cafe"].every((x) => ownerPublicInterests.includes(x))
  )
    return "둘 다 바다 산책이랑 카페를 좋아하니까, 오늘 본 바다 이야기로 시작해보면 어때요? 솔바람도 조용히 같이 있는 시간을 편하게 느낀대요.";
  return UNKNOWN;
}
