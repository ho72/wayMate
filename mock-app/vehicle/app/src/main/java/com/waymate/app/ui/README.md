# 차량 UI

[분담 가이드](../../../../../../../../../../docs_prototype/06_개발_아키텍처_및_분담_가이드.md)와 [v5 디자인 적용](../../../../../../../../../../docs_prototype/28_v5_디자인_적용_및_검수.md)을 따른다.

- `theme/`: 하늘색·민트·청록 토큰, 큰 글자, 64dp 이상 터치 영역.
- `components/VehicleDesign.kt`: 배경·헤더·말풍선·정보 카드·큰 기본/보조 버튼. API·SDK·권한 처리가 없는 표시 컴포넌트.
- `components/AgentCharacter.kt`: 공통 투명 PNG. 정차 시 가벼운 동작, 주행 시 정지.
- `screens/handoff/`: 홈·불러오기, 콘텐츠/말 전달/통화, 만남, 내비 승인, 만남 재연·두 결말, 초기화, 주행 간편 모드.

화면은 UI state와 사용자 의도 callback만 소비한다. 서버 DTO·HTTP·파일·SDK를 직접 호출하지 않는다. 권한, 불러오기 ACK, 실제 경유지 실행, 공개 범위와 A/B 선택 비공개는 기존 repository·서버가 판정한다. `driving_limited`와 `blocked`는 정차 화면을 폐기하고 별도 제한 화면을 표시한다.

기기 검수는 mock의 API 없는 창·130% 글자·승인 회귀와 real의 Console/SDK 검수를 구분한다. `V5DesignReviewTest`는 841×1210, 100%에서 앱 영역을 잘라 비교용 화면을 저장한다. 시연자가 설정한 제품 서버 데이터로 화면별 fixture를 만들지 않는다.
