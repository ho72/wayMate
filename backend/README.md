# Backend · 계정·AI·여행 서버

계정·AI 대화·여행 저장·차량 전달을 담당하는 Node.js 서버입니다. [모바일 웹](../mobile-web/)의 정적 파일과 API를 함께 제공합니다.

| 경로 | 역할 |
| --- | --- |
| `server/` | 계정·SQLite·AI 스트리밍·여행·차량 API |
| `contracts/` | 계정·차량 전달 스키마와 예제 |
| `tests/` | 서버·모바일 클라이언트 회귀 검사 |
| `demo/` | 기본 시연 서버·고정 시나리오·차량 공통 소재 |
| `runtime/` | 로컬 DB·회차 상태, Git 추적 제외 |

## 실행

Node 22.22.2 기준, 저장소 루트에서:

```sh
npm run setup
npm run start:demo       # 키 없는 시연 · 3000
npm start               # 모바일·차량 통합 시연 · 3008
npm run start:personal  # 개인 AI 서비스 · 3004
npm test
```

실제 AI 모드는 [.env.example](.env.example)을 참고해 `backend/.env`에 `OPENAI_API_KEY`를 설정합니다. `OPENAI_MODEL`의 기본값은 `gpt-4.1-mini`입니다. `backend/.env`가 우선하며 기존 시연 설정은 `backend/demo/.env`에서 읽습니다.

| 설정 | 기본값·용도 |
| --- | --- |
| `SERVICE_PORT` | 개인 서비스 3004 |
| `SERVICE_PUBLIC_ORIGIN` | `http://127.0.0.1:3004` |
| `SERVICE_DB_PATH` | `runtime/waymate.sqlite` |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | 선택적 서버 TTS |

`npm start`의 통합 시연은 전용 3008 포트·Origin·DB를 지정합니다. 모바일은 `http://127.0.0.1:3008/#trips`, 진행자는 같은 계정의 `/scenario-operator`입니다. 상대 수락·답장·만남 진행은 준비된 시나리오로 재현합니다.

## 주요 코드

- [http.mjs](server/http.mjs): HTTP API·세션·CSRF·SSE·정적 파일.
- [agent.mjs](server/agent.mjs): AI 스트리밍·도구 호출·중단.
- [store.mjs](server/store.mjs): 계정별 대화·프로필·여행 저장.
- [vehicle-http.mjs](server/vehicle-http.mjs): 페어링·확정 여행 전달·차량 ACK.
- [journey-http.mjs](server/journey-http.mjs): 여행별 연결·만남·선택·시연 API.

AI 제안은 사용자 확인 후 저장합니다. 차량 수신 완료는 확인·저장·ACK 이후 표시합니다. 로컬 서버의 공개 배포와 실사용자 매칭은 후속 범위입니다.

## 검사

저장소 루트에서 `npm test`, 통합 흐름만 확인하려면 `npm run test:scenario`를 실행합니다. 외부 AI·음성 제공자는 테스트 대체 구현을 사용합니다. 실제 모델 호출은 별도 설정이 필요합니다.

[차량 앱 설정](../vehicle-app/README.md) · [모바일 웹 구조](../mobile-web/README.md)
