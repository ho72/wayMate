# 기본 시연 API 서버

기본 진입점은 [main.mjs](main.mjs)와 [v4/http.mjs](v4/http.mjs)입니다. 여행·공개 정보·연결·만남·내비 승인·최종 선택·초기화 상태를 관리합니다.

| 경로 | 역할 |
| --- | --- |
| `v4/commands.mjs`, `handoff.mjs` | 명령 큐·버전·영수증·전달 |
| `v4/social.mjs`, `content.mjs`, `call.mjs`, `ending.mjs` | 연결·공개 대화·통화 샘플·독립 선택 |
| `v4/navigation.mjs`, `mock-navigation.mjs`, `reset.mjs`, `recovery.mjs` | 실제/모의 결과 구분·승인·정리·복구 |
| `ai/` | 선택적 AI 상담·차량 대사 제공자 |
| `store.mjs` | 파일 저장·writer lock·복원 |

`backend/demo/`에서 `npm start`로 실행합니다. 기본 시연은 외부 AI를 호출하지 않습니다. 실제 AI·TTS는 [.env.example](../.env.example)의 서버 전용 키와 별도 실행 명령이 필요합니다. 기본 모드의 원본 상태는 `runtime/state-v4.json`에 보관합니다.

모바일·차량 요청은 역할과 공개 범위·회차·버전을 검증합니다. 시연의 상대 응답과 모의 내비는 준비 데이터이며, 실제 상대 통신이나 실제 SDK 성공으로 바꾸지 않습니다. 결과 미확인·진행 중 정리가 있으면 새 회차를 열지 않습니다.

[실행 안내](../README.md) · [테스트](../tests/README.md) · [공통 계약](../shared/contracts/README.md)
