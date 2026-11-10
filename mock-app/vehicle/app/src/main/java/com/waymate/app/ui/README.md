# 차량 UI · CAR-UI 담당

[분담 가이드](../../../../../../../../../../docs/06_개발_아키텍처_및_분담_가이드.md)의 경계를 따릅니다. 현재 P01 기본 미리보기만 구현됐습니다.

- `screens/handoff/`: P01 HandoffScreen과 HandoffUiState. 화면은 state와 onLoadJourney를 받아 그립니다.
- `screens/conversation/`, `meeting/`, `ending/`: P02~P04 예약 경로. 아직 화면 구현은 없습니다.
- `components/`: 화면 사이에 공유할 표시 컴포넌트. 현재 TravelFriend가 있습니다.
- `theme/`: 색·타이포·테마. 여러 화면이 소비하므로 변경 시 함께 확인합니다.

기능 문자열은 `res/values/strings_handoff.xml`처럼 화면별로 나누고 앱 공통 이름은 strings.xml에 둡니다. 각 화면의 Preview로 HTTP 없이 표시 상태를 확인할 수 있습니다.

UI는 서버 DTO·HTTP client·파일 저장·Pleos SDK를 직접 참조하지 않습니다. 앱 조립 영역이 데이터를 화면 상태로 바꾸고 사용자 의도를 처리합니다. 화면의 loadEnabled는 표시용이며 실제 전송·승인은 현재 서버와 로컬 제한 조건을 다시 확인해야 합니다. 첫 미리보기는 항상 비활성 상태로 유지합니다.
