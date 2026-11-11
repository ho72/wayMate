# 차량 플랫폼 · CAR-PLATFORM 담당

VehicleRestrictions로 실제 CarUxRestrictions 현재값·리스너와 재진입 확인을 구현했습니다. 음성·내비 Adapter는 구현 전입니다. [04의 7~9절](../../../../../../../../../../docs_prototype/04_개발_및_연동_명세서.md#7-차량-제한수명주기음성)에 맞춰 구현합니다.

- `restrictions/`: CarUxRestrictions의 현재값과 변경, 미확인·foreground·보고 만료를 처리합니다. mock 빌드에서도 실제 제한을 확인합니다.
- `voice/`: 준비 음성·자막·발화자와 오디오 포커스, 중단·감쇄를 관리합니다. 포커스 복귀나 앱 재진입으로 자동 재생하지 않습니다.
- `navigation/`: NaviAdapter 계약, 승인·실행권·로컬 실행 기록·호출·관측·정리를 조정합니다. 화면·polling에서 SDK를 직접 호출하지 않습니다.

실제 NaviHelper 구현·의존성은 향후 `src/real/`에만 추가합니다. 모의 내비는 서버의 mockRoute와 O01의 NAV_MOCK_RESULT를 표시하며 임의 타이머로 성공을 만들지 않습니다. 일반 음성 샘플과 제한 읽기는 mock/real에 공통으로 적용합니다.

실행 출처 source와 처리 결과 outcome을 구분하고, 취소 뒤 늦은 결과·초기화·복구의 물리 기록을 보존합니다. 현재 첫 전달·제한 검증은 음성·내비의 물리 실행 검증 결과를 대신하지 않습니다.
