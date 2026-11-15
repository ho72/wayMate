// Keep the saved dragon/bear IDs compatible with existing vehicle deliveries.
export const CHARACTERS = Object.freeze([
  { id: "dragon", name: "두루", introduction: "두루야", image: "/assets/dragon.png", together: "두루와", subject: "두루가", line: "작은 발견을 함께하는", description: "호기심 가득한 여행 친구" },
  { id: "bear", name: "루밋", introduction: "루밋이야", image: "/assets/rumit.png", together: "루밋과", subject: "루밋이", line: "설레는 여정을 함께하는", description: "긴 귀와 연두빛을 가진 여행 친구" },
  { id: "mocha", name: "모카", introduction: "모카야", image: "/assets/mocha.png", together: "모카와", subject: "모카가", line: "편안한 속도를 함께하는", description: "포근한 쉼 같은 곰 여행 친구" },
]);
export const CHARACTER_IDS = CHARACTERS.map(({ id }) => id);
export const character = (id) => CHARACTERS.find((item) => item.id === id) || CHARACTERS[0];
