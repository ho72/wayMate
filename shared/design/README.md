# 두루밋 공통 시각 기준

`companion-tokens.json`은 모바일과 Pleos에서 함께 사용하는 색상 원본이다. 배경은 옅은 하늘색·라벤더·민트가 이어지는 한 개의 그라데이션이고, 주요 행동과 선택 상태는 딥틸 한 색으로 강조한다.

```sh
node shared/design/sync-theme.mjs
node shared/design/sync-theme.mjs --check
```

첫 명령은 웹 `companion-theme.css`와 Android `CompanionPalette.kt`를 생성한다. 두 번째 명령은 두 산출물이 원본과 일치하는지 확인한다.

모바일은 `service/web/scene.css`, 차량은 `WayMateTheme.kt`·`VehicleDesign.kt`에서 이 값을 사용한다. 승인된 B안 로고의 배경 제거 PNG도 양쪽이 같은 파일과 같은 표시 영역을 사용한다. 원본은 보존하고 `assets/durumit-logo-transparent.png`와 작업 기록 JSON을 별도로 둔다.

- 배경 위 장식용 색 번짐·점·후광은 추가하지 않는다.
- 모든 항목을 별도 카드로 쪼개지 않는다. 관련된 대화 시작 항목은 하나의 목록으로 묶는다.
- 선택하지 않은 캐릭터는 배경과 가벼운 테두리만, 선택한 캐릭터만 딥틸로 강조한다.
- 진행 숫자·영문 장식 제목처럼 같은 뜻을 반복하는 정보는 줄인다.
- 모바일 입력·메뉴는 명확히 구분하고, 차량은 기존 큰 글자와 터치 영역을 유지한다.
- 키보드 포커스와 움직임·투명도 줄이기 설정을 보존한다.

2026-11-15: 사용자 피드백에 따라 오로라 색상은 유지하되 다중 후광·진한 그림자·다색 아이콘 배경을 덜어냈다. 서비스 회귀 101개와 mock/real 빌드·mock 단위 테스트를 확인했다. 실제 차량 기기 표시 검수와는 구분한다.

참고한 공식 디자인 자료: [Material 3 Expressive](https://m3.material.io/), [Apple Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass). 두루밋은 기존 캐릭터·브랜드를 유지하며, 플랫폼별 표현을 그대로 복제하지 않는다.


2026-11-15 세부 수정: 내장 ImageGen으로 B안 로고의 흰 배경만 제거한 투명 PNG를 적용했다. 알파 모서리는 0이며 원본은 보존했다. 편집 프롬프트·해시·표시 영역은 `assets/durumit-logo-transparent.json`에 기록했다. 모바일 CSS와 차량 Canvas는 해당 표시 영역을 사용하며 배경색 혼합으로 흰 사각형을 감추지 않는다. 텍스트 버튼과 화살표는 inline-flex/center로 정렬하고, 이어하기 카드는 짧은 제목과 보조 설명·행동 링크로 정리했다. 320px 가로 넘침 없음, 관련 SVG의 세로 중심 차이 0px, mock/real APK 빌드 성공을 확인했다.
