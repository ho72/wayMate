# 기본 시연 서버 테스트

저장소 루트의 `npm test` 또는 `backend/demo/`의 `npm test`로 실행합니다. 테스트마다 임시 파일·loopback 포트를 사용합니다.

| 경로 | 범위 |
| --- | --- |
| `contracts/` | v2·v3·v4 스키마와 고정 계약 예제 |
| `integration/` | 전달·ACK·버전·중복 요청·공개 범위·만남·결말·내비 상태·복구 |
| `helpers/` | 서버·클라이언트·공통 상태 검수 도구 |

외부 AI·음성은 테스트 대체 구현을 사용합니다. 실제 기기·SDK 검사는 차량 앱에서 별도로 수행합니다.

[서버 구성](../README.md) · [차량 테스트 안내](../../../vehicle-app/README.md#테스트lint)
