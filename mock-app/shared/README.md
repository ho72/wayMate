# 공통 계약·소재

현재 실행은 schemaVersion **3**, scope `preparation-v3`의 첫 범위입니다. [10 실행·검증](../../docs_prototype/10_v3_여행_준비_차량_홈_및_내비_시험.md)을 확인합니다. 전체 명세 v3의 모든 기능을 구현했다는 뜻은 아닙니다.

- `contracts/handoff-v3.schema.json`: 명령 9종·원문/소개 분리·prepared_trip·차량 활성·역할별 state·영수증·저장소. 런타임 Ajv가 읽습니다.
- `examples/v3/`: 실제 coordinator로 생성한 wire JSON. UUID·시각을 고정합니다.
- `contracts/handoff-v2.schema.json`, `examples/` 루트 JSON: 과거 v2. 현재 런타임에서 허용하지 않으며 원문으로 자동 복원하지 않습니다.
- `config/protocol.mjs`: 질문 차례·정확히 일치하는 준비 시연 분기·빈 소개값·500ms poll·2초 상태 유효기간. 원문→enum 분석 함수는 없습니다.
- `assets-manifest.json`: a-01 승인 드래곤 정적 이미지, a-02 햇살 도형 연결. 음성·립싱크는 미구현입니다. 소비 경로는 웹 정적 허용 목록·AgentCharacter·Gradle copy task에 함께 반영합니다.

변경 시 schema·서버·웹·차량·예제·검증을 함께 검토합니다. 알 수 없는 버전/enum/추가 필드를 조용히 기본값으로 바꾸지 않습니다.
