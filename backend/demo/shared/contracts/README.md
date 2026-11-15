# JSON 계약

- [handoff-v4.schema.json](handoff-v4.schema.json): 현재 기본 시연의 명령·상태·차량 전달 계약.
- [consultation-v1.schema.json](consultation-v1.schema.json): AI 상담·소개 초안 계약.
- `handoff-v2.schema.json`, `handoff-v3.schema.json`: 이전 예제·상태 회귀 계약.

형식·필수값·enum·추가 필드는 JSON Schema로, 소유권·순서·버전·차량 제한·활성화 조건은 서버 도메인 로직으로 검증합니다. 확인하지 않은 사용자 정보나 동의를 기본값으로 만들지 않습니다.
