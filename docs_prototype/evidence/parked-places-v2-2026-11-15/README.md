# 정차 추천 목록 · 기본 구성 적용

2026-11-15. production VehicleExtraScreen의 REST_LIST/LUNCH_LIST에 가상 여행 데이터를 전달한 정차 Debug 캡처다.

- rest-2pane.png / rest-3pane.png: 휴식 목록의 실제 1682×1210/841×1210dp 앱 창.
- lunch-2pane.png / lunch-3pane.png: 같은 규격의 점심 목록.
- rest-*-vehicle.png: 계기판 포함 전체 화면.
- third-place-detail-3pane.png / returned-list-3pane.png: 세 번째 후보 탭 후 해당 상세와 이전 복귀 확인.

각 목록의 세 후보가 초기 화면에 함께 표시된다. 전체 행 선택은 기존 상세 페이지로 이어진다. 홈과 같은 공통 캐릭터·반투명 카드·제목 정렬을 사용한다. 실제 추천·서버·음성·내비는 연결하지 않았으며 전체 기능/실차/접근성 회귀 완료를 뜻하지 않는다.
