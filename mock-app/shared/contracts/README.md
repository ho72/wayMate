# W01 공통 계약 산출물

현재는 구현할 계약의 목록입니다. schema 파일·완성된 API 예제·검증기는 아직 없습니다. 필드·enum·HTTP 동작은 [04의 3~9절](../../../docs/04_개발_및_연동_명세서.md#3-공통-데이터-구조)을 기준으로 합니다.

| 먼저 맞출 묶음 | 필요한 정상·거부 예제 | 소비자 |
|---|---|---|
| 공통 봉투·영수증·오류 | schemaVersion, 회차·역할·버전·ID, 중복·오래된 상태·응답 유실 | 전체 |
| 역할별 state·scenario | web/car/operator, 공개 제외, 미발생 B 메시지 제외, allowedActions·actionBindings | 각 client |
| handoff | my_trip·connected, sourceVersions·peer=null, 오래된 ACK 거부 | WEB·CAR |
| 차량 세션·상태 | 새 epoch·증가 번호·현재 제한·미확인·비활성·만료 | SERVER·CAR |
| 콘텐츠·만남·최종 선택 | 요청별 ID·별도 동의, A 선택 후 B 요청, terminal 결과·새 finalRound | CAR·O01 |
| 내비·초기화·복구 | source/outcome 분리, mock 결과 주입, 취소 경합·기존 실제 기록 보존 | SERVER·CAR·O01 |

첫 전달에 필요한 묶음부터 구현하고 `shared/schema.json`에 연결합니다. 예제는 `shared/examples/`에 두고 실제 schema 검증을 통과시킵니다. 파일이 생기면 구현한 부분과 남은 부분을 이 목록·04·해당 이슈에서 구분합니다. UI가 성공을 흉내 내는 데이터는 API 성공 증빙으로 사용하지 않습니다.
