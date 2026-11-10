# 공통 계약과 예제

schemaVersion **2**의 `handoff-my-trip-v1` 범위를 코드화했습니다. 전체 시연의 schema 구현 완료를 뜻하지 않습니다. [04 전체 계약](../../docs/04_개발_및_연동_명세서.md)과 [07 지원 범위](../../docs/07_첫_전달_실행_및_계약.md)를 함께 확인합니다.

- `contracts/handoff-v2.schema.json`: JSON Schema draft 2020-12. `$defs`에 명령 8종·프로필·여행·handoff·상태·영수증·오류·health·scenario·영수증 조회·내부 저장소를 정의합니다. 서버 Ajv가 같은 파일을 읽습니다.
- `examples/`: 서버의 실제 명령 처리 코드로 생성한 역할별 wire JSON. `index.json`은 파일과 검증할 `$defs` 이름을 연결합니다.
- `config/protocol.mjs`: Node/웹의 질문 preset·요약 규칙·500ms poll·2초 상태 유효기간. 차량의 대응 값은 Repository와 동일하게 유지합니다.
- `assets-manifest.json`: 미구현. 캐릭터 원본·음성 cue·공개 조건 연결은 후속 작업입니다.

SERVER가 형식 변경을 모으고 WEB·CAR의 소비 코드와 예제를 함께 검토합니다. `npm run examples`·`npm test` 후 변경합니다. 문서 버전과 API schemaVersion은 별개입니다. 다른 버전·알 수 없는 enum·추가 필드는 조용히 기본값으로 바꾸지 않고 거절합니다.
