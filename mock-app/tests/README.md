# 검증 · 통합 책임

`mock-app/`에서 Node 22.22.2로 `npm test`를 실행합니다. 테스트마다 임시 디렉터리·임의의 loopback 포트를 사용해 실행 중인 시연 상태와 분리합니다.

- `contracts/examples.test.mjs`: 생성된 모든 공유 예제·지원하지 않는 캐릭터·본인 여행의 상대 정보 차단.
- `integration/handoff.test.mjs`: 실제 HTTP 저장→전달→ACK, 재시작, 역할·view·클라이언트 분리·출처, 중복·버전 경합·단일 writer, 제한 미확인/활성/비활성/만료, 원본 변경, 저장 실패·교체 후 불확실·손상 파일.
- `integration/web-recovery.test.mjs`: 실제 웹 API client에서 서버 적용 후 응답 유실·브라우저 재시작·영수증 복구와 미적용 요청의 동일 본문 재전송.

2026-11-11 자동 검증 27개 통과. 차량은 Gradle 빌드·Lint와 Pleos 실제 화면으로 별도 확인했습니다. 첫 연결의 수동 확인 항목은 [07](../../docs/07_첫_전달_실행_및_계약.md)에 있습니다. 전체 Q/V·두 결말·내비 SDK 검증은 후속입니다.
