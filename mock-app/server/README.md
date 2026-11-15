# wayMate 백엔드

현재 기본 서버는 **v4 모바일·차량 연결**이다. Node.js 22.22.2의 HTTP·파일 API와 Ajv로 프로필/공개·여행·모바일 매칭·차량 전달·콘텐츠/통화·만남·내비 승인·결말·안전한 초기화를 처리한다. v2/v3 경로는 과거 계약·실행 기록으로 보존한다.

선택 기능으로 **실제 AI 상담·소개 초안 생성**을 연결했다. OpenAI Responses API를 서버에서 호출하며 준비된 대본 모드와 구분한다. [27 실제 AI 상담 개발·검수](../../docs_prototype/27_실제_AI_상담_및_소개_초안.md)와 [공통 계약](../../docs_prototype/04_개발_및_연동_명세서.md)을 따른다.

## 실행

`mock-app/`에서 기본 시연 서버는 `npm start`로 실행한다. 환경 설정이 없으면 외부 AI를 호출하지 않는다.

실제 AI는 `.env.example`을 로컬 `.env`로 복사해 `OPENAI_API_KEY`를 설정하고 `npm run start:ai`로 실행한다. 예제는 기존 3000번 시연과 섞이지 않게 **3002번·별도 상태 파일**을 사용한다. 키는 채팅·웹/차량 코드·Git에 넣지 않는다. `OPENAI_MODEL`로 모델을 지정하며 기본값은 `gpt-4.1-mini`다.

```sh
cp .env.example .env
# 로컬 편집기에서 OPENAI_API_KEY 설정
npm run start:ai
```

AI 모바일 주소는 <http://127.0.0.1:3002>다. 외부 AI 전송에 동의하고 `AI와 이야기 시작`을 선택한다. 이미 시연 답변·프로필·연결·차량 여정이 있는 회차에 AI 대화를 섞지 않는다. 새 회차는 O01의 정리·ACK 절차를 사용한다. 역할 헤더/브라우저 ID는 로컬 시연용이며 운영 인증·다중 사용자 서비스가 아니다.

## 책임 경로

ElevenLabs TTS는 AI 상담과 독립적인 선택 기능이다. 서버 `.env`의 `ELEVENLABS_API_KEY`·`ELEVENLABS_VOICE_ID`를 설정하고 `npm run start:tts`로 실행한다. TTS만 사용할 때는 `WAYMATE_AI_PROVIDER=disabled`를 지정한다. 기존 web/car 역할로 `GET /api/tts/config`, `POST /api/tts`를 호출하면 MP3를 받는다. 키는 차량·웹에 전달하지 않는다. [공통 TTS 설정·계약·제한](../../docs_개발/ElevenLabs_TTS.md)을 따른다. 키가 설정된 서버에는 모바일 듣기와 차량 음성 재생을 연결했고, 미설정 시 차량은 기존 로컬 음성을 유지한다.

| 경로 | 책임 |
|---|---|
| `main.mjs`, `v4/http.mjs` | 실행 설정·로컬 접속·역할·정적 허용 목록·HTTP API·정상 종료 |
| `v4/commands.mjs`, `v4/handoff.mjs` | 단일 업무 큐·버전·영수증·저장·공개·차량 활성화 |
| `v4/social.mjs`, `content.mjs`, `call.mjs`, `ending.mjs` | 모바일 매칭·말 전달·통화 샘플·만남·독립 선택·결말 |
| `v4/navigation.mjs`, `mock-navigation.mjs`, `reset.mjs`, `recovery.mjs` | 실제/모의 내비 구분·실행권·결과·정리·ACK·미확정 잠금 |
| `v4/consultation.mjs`, `ai/openai.mjs` | AI 전송 전 조건·동시 요청·25초 제한·응답 검증·저장 후 재사용, OpenAI 호출 |
| `v4/state.mjs`, `validation.mjs`, `projection.mjs` | 상태/계약 검증·역할별 공개 범위·복원 |
| `store.mjs` | writer lock·temp fsync·rename·디렉터리 fsync·저장 불확실 차단 |

기본 상태는 `runtime/state-v4.json`, AI 개발 예제는 `runtime/ai-consultation-v4.json`이다. 같은 파일을 두 서버가 동시에 사용하지 않는다. 전체 로그·개인 상태·SDK journal은 Git에 포함하지 않는다.

## AI 데이터와 승인 경계

- `POST /api/consultation/turns`: web 소유자만 호출한다. 회차·메시지 UUID·대화 revision·원문·전송 동의를 검증한다.
- 모델에는 해당 상담의 사용자 원문과 이전 AI 답변만 전달한다. 상대 정보·차량 상태·업무 명령·도구는 제공하지 않는다. `store:false`를 사용한다.
- 대화와 자유 서술 소개는 본인 web projection에만 표시한다. 사용자가 수정·확인한 요약을 `PROFILE_CONFIRM`으로 저장하고, 공개는 기존 별도 승인으로 처리한다. 자유 소개 문장 자체는 차량·상대에게 전달하지 않는다.
- 차량에는 확인한 요약만 `summarySource=user_confirmed_ai`로 전달한다. 미확인 `ai_generated`는 차량 파서가 거부한다. AI가 동의·매칭·내비·차량 제어를 실행하지 않는다.
- 외부 호출은 업무 큐 밖에서 기다리고, 저장 전 회차·잠금·대화 버전을 다시 검사한다. 초기화 중 초안은 숨기고 완료 시 대화/소개를 보존 기록에서 제외한다.
- 호출 전 검사는 대화를 예약·저장하지 않는다. 첫 성공 응답과 소유자를 함께 저장하므로 실패 후 기본 시연·차량 직접 시작이 유지된다. 브라우저는 확정된 AI 실패에서 원문을 보존해 시연 전환을 제공하고, 저장 불확실은 먼저 결과를 확인한다. 기존 빈 예약만 시작 시 정리한다.
- 저장 완료된 메시지는 같은 ID로 재확인해도 모델을 다시 호출하지 않는다. 동시 동일 요청도 한 호출로 모은다. 저장 전 서버 중단·유실은 외부 호출의 정확히 한 번 실행을 보장하지 못하므로 자동 재시도하지 않는다.

## 검증·후속

`mock-app/`에서 `npm test`, `npm run examples`를 실행한다. AI 회귀는 `tests/integration/v4-consultation*.test.mjs`, 계약 예제는 `shared/examples/consultation-v1/`에 있다. 자동 테스트는 응답 대역을 사용하고 실제 과금 API 호출과 구분한다. 실제 모델·브라우저·차량 파서 검수는 27번에 기록한다.

운영 로그인·다중 사용자 분리·DB·외부 배포·실제 상대 접속은 후속이다. 현재 AI 상담은 추천 알고리즘이나 실제 상대 매칭을 LLM으로 대체하지 않는다.


## 차량 대사 API와 독립 기기 검증

플레오스용 기본 주소는 같은 앱 실행 안에서 state/handoff/commands/dialogue/tts가 모두 일치해야 한다. 실제 시연은 3000, 외부 유료 API 없는 검증은 3015를 사용한다. 모바일 계정용 3004 연결은 별도 작업이며 이 경로로 자동 전환하지 않는다.

| 요청 | 입력 및 결과 |
|---|---|
| `GET /api/state?view=car` | `storeId`와 `runId`, 차량·공개 정보·연결·만남·선택 상태의 기준 |
| `GET /api/handoff` | 현재 `handoffId`, `handoffVersion`, `sourceVersions`를 포함한 전달본 |
| `POST /api/commands` | 서버가 내려준 `actionBindings`의 type/target/payload와 최신 버전 사용; 재전송은 동일 commandId |
| `GET /api/commands/:id?runId=...` | 응답 유실 시 기존 명령 결과 조회; 새 ID로 중복 실행하지 않음 |
| `POST /api/agent/dialogue` | `{ "scope": "<storeId>:<runId>" }`; 임의 프롬프트나 텍스트를 받지 않음 |
| `GET /api/tts/config` | `available`, `voices`, `consentRequired`, `maxCharacters` |
| `POST /api/tts` | `{requestId,text,voice,consent:true}`; 정상 응답은 `audio/mpeg` |

차량 요청은 `X-Demo-Actor: car`를 사용한다. 대사 응답의 안정된 필드는 `source`(`openai`/`fallback`), `lines`, `scope`, `contextKey`, `replayed`이며, `fallbackSlots`와 `reason`은 보조 필드다. 추가 서버 메타데이터는 앱에서 무시할 수 있다. `lines`는 준비된 경우 30개 슬롯이고, 기본 대사를 사용해야 하는 응답은 빈 객체일 수 있다. 슬롯 이름은 `server/ai/vehicle-dialogue.mjs`의 `SLOTS`를 기준으로 한다.

`source=openai`는 OpenAI에서 작성해 검토한 대사라는 뜻이며, 지금 새로 생성했다거나 음성을 재생 중이라는 뜻이 아니다. `replayed=true`이면 저장 결과다. `fallbackSlots`는 사실·역할·말투 검증에서 기본 시연 문장으로 보완한 슬롯이다. 화면의 말하기/완료/중단 표시는 실제 재생기의 상태를 따라야 한다. 대사 제한은 일반 슬롯 140자, `drive.*` 70자 이내 한 문장이다.

새 생성은 정차 상태에서만 시작한다. 디스크 작업 이후와 외부 요청 직전에 현재 회차/문맥/정차를 다시 확인하고, 응답을 보내기 전에도 문맥을 확인한다. `409 DIALOGUE_CHANGED`는 이전 문맥을 버려야 한다는 뜻이다. `423 DIALOGUE_NOT_READY` 또는 `DIALOGUE_PARKED_ONLY`이면 새 생성 대신 해당 화면의 기본 안내를 사용한다. 같은 오류를 상태 폴링마다 재전송하지 않는다. 이미 저장한 대사는 유료 provider가 꺼져 있어도 `vehicleDialogue=true`로 사용 가능하다.

대사 파일에도 단일 writer `.lock`을 적용한다. 서버 실행 중 같은 파일에 CLI로 prewarm하지 않는다. 정상 SIGTERM/SIGINT 종료 시 상태와 대사 락을 모두 해제하며, 두 번째 writer나 실행 포트 충돌은 기존 데이터를 바꾸지 않고 실패한다.

유료 요청을 시작하기 전에 문맥 키별 영수증도 저장한다. 응답 저장 전에 서버가 중단되면 재시작 후 같은 요청을 자동 재구매하지 않고 기본 안내를 사용한다. 중단된 요청을 다시 생성하려고 캐시나 영수증을 임의 삭제하지 않는다.

3015 검증 서버는 `node scripts/start-pleos-validation.mjs`로 시작한다. 최초 실행 때 원본의 준비 완료 상태·대사 캐시를 별도 파일과 baseline으로 복제하며 storeId/runId는 보존한다. 이후 반복 검증은 **3015 서버를 정상 종료한 다음** `node scripts/start-pleos-validation.mjs --refresh`로 검증 baseline만 복원한다. 원본 3000 회차는 초기화하지 않는다. 검증 서버는 OpenAI/ElevenLabs provider를 구성하지 않으므로 외부 생성이 일어나지 않는다. `tts.available=false`가 정상이며 이를 ElevenLabs 재생 성공으로 표시하면 안 된다. 앱의 실제 재생은 준비된 MP3 또는 기기 TTS의 실제 결과로 따로 검증한다.
