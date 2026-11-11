# 검증

Node 22.22.2로 `mock-app/`에서 `npm test`를 실행합니다. 테스트별 임시 파일·loopback 포트를 사용해 시연 상태와 분리합니다.

- `contracts/examples.test.mjs`: 보존한 v2 golden과 상대/미지원 외형 차단.
- `contracts/v3-examples.test.mjs`: 현재 v3 golden.
- `integration/handoff.test.mjs`: 실제 HTTP 전달·ACK·직접 시작·복원·원문/Unicode·역할별 비노출·분기 무효화·공개/core 분리·웹 잠금·버전/중복/동시성·제한·원자 저장·구버전 보존.
- `integration/web-recovery.test.mjs`: 실제 웹 client의 응답 유실·동일 본문 복구·구버전 서버 거부·초안 보존.

자동 검증 52개 통과. APK/Lint·실제 웹·Pleos 검수와 내비 미완료 증거는 [10](../../docs/10_v3_여행_준비_차량_홈_및_내비_시험.md)에 기록합니다. 전체 Q/V와 SDK 추가·제거 통과를 뜻하지 않습니다.

내비 검증 정책은 vehicle의 `:app:testMockDebugUnitTest` 9개로 별도 검사합니다. 실제 SDK 추가/제거·재시작 검증과 원문 증거는 [11](../../docs/11_실제_내비_좌표_및_경유지_검증.md)에 있습니다. Node 52개와 구분하며 모의 테스트를 실제 SDK 성공으로 대신하지 않습니다.
