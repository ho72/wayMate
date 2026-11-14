# v5 여행 친구 이미지

사용자가 제공한 `말이통행_v5_Interactive.html`의 파란 용·곰 이미지를 참고해 **내장 ImageGen**으로 생성한 투명 PNG다. 지도·말풍선·잘린 문구가 포함된 원본 크롭 대신 앱 위에 자연스럽게 합성할 수 있는 전신 이미지를 사용한다.

| 파일 | 표시 | 크기 | 생성 프롬프트 |
|---|---|---|---|
| [dragon.png](dragon.png) | a-01 · 블루 드래곤 | 1254×1254 · alpha | [dragon-generation.json](dragon-generation.json) |
| [bear.png](bear.png) | a-02 · 포근한 곰 / b-01 · 상대 곰 에이전트 | 1254×1254 · alpha | [bear-generation.json](bear-generation.json) |

웹과 Android가 같은 PNG를 사용한다. ID·SHA256·경로는 `shared/assets-manifest.json`에 기록한다. 빌드 시 `blue_dragon`·`travel_bear` drawable로 복사한다. 움직임은 기존 정차 중 가벼운 transform이며 주행 중 정지한다. 3D 모델·리깅·정밀 입 모양 동기화는 아니다.
