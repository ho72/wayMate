export const DEFAULT_TRIP_ID = "00000000-0000-4000-8000-000000000014";
export const DEFAULT_PLAN = Object.freeze({
  title: "바다를 따라, 강릉에서 하루", destination: "강릉", startDate: "2026-12-14", endDate: "2026-12-14",
  summary: "바닷가를 걷고 조용한 카페에서 쉬어가기. 마음에 드는 곳에서는 조금 더 머물고 싶어요.",
  days: [{ dayNumber: 1, date: "2026-12-14", stops: [
    { time: "13:00", title: "경포해변", description: "바다를 바라보며 천천히 걷기", category: "walk", placeQuery: "강릉 경포해변" },
    { time: "13:30", title: "강문 카페거리", description: "바다가 보이는 곳에서 커피 한 잔", category: "cafe", placeQuery: "강릉 강문 카페" },
    { time: "15:20", title: "안목 커피거리", description: "원래 계획한 오후 일정", category: "cafe", placeQuery: "강릉 안목 커피거리" },
    { time: "15:45", title: "내 숙소", description: "여유롭게 하루 마무리", category: "rest", placeQuery: null },
  ] }], notes: [],
});
export const planBody = trip => Object.fromEntries(["title","destination","startDate","endDate","summary","days","notes"].map(key=>[key,structuredClone(trip[key])]));
export const dateLabel = value => value ? value.replace(/-/g, ". ") : "날짜 미정";
export const stopCount = plan => plan.days.reduce((n,day)=>n+day.stops.length,0);
export const categoryLabels = {walk:"산책",cafe:"카페",food:"식사",culture:"문화",nature:"자연",rest:"휴식",drive:"드라이브"};
