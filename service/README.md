# 두루밋 · 모바일 AI 여행 서비스

사용자가 가입하고 본인의 대화·취향·여행을 계속 사용하는 **실제 기능 구현**이다. 공개 배포는 하지 않았다. Node **22.22.2**에서 로컬 주소 **http://127.0.0.1:3004/**로 실행한다. 기존 `mock-app` 시연과 Pleos 서버는 그대로 유지한다.

## 사용 흐름

1. 홈에서 친구와 이야기하기 → 아이디·별명·비밀번호로 가입 또는 로그인.
2. 대화·저장한 취향·여행을 OpenAI에 전달하는 데 동의한다. 동의 전에는 생성하지 않는다.
3. 자유롭게 대화한다. 답변이 실제로 스트리밍되고, 사용한 도구의 진행 상태를 표시한다.
4. 친구가 제안한 취향은 **이 취향으로 기억해줘**, 일정은 **내 여행에 저장하기**를 눌러 확정한다. 답변만으로 프로필이나 저장 여행을 바꾸지 않는다.
5. 내 여행에서 날짜별 일정을 다시 열고, 장소 검색 링크로 지도를 확인한다. 마이에서 별명·취향·소개·파도/모카 캐릭터를 수정한다.
6. 정차한 차량의 **내 계정 여행 → 연결 시작** 코드를 **마이 → 내 차와 연결**에 입력한다. 차량에서도 본인 계정을 승인한다. **내 여행 → 저장 여행 → 이 여행을 내 차로**에서 차량·별명·캐릭터·일정을 확인하고 전송한다. 차량이 **이 여행 받기 → 확인**으로 저장한 뒤에만 수신 완료를 표시한다. 연결 해제도 확인 후 수행한다.
7. 대화를 보관·복원하고, 다시 로그인하거나 서버를 재시작한 후에도 기록을 이어간다. 동의 철회와 로그아웃은 생성 중인 답변도 중단한다.

가입은 로컬 계정이다. 이메일·소셜 로그인이나 비밀번호 찾기를 제공하는 것처럼 표시하지 않는다. 공개 배포 전까지 실제 중요 계정과 같은 비밀번호는 사용하지 않는다.

## 실행

```sh
cd service
npm ci --ignore-scripts
npm start
```

저장소의 `mock-app/.env`에 이미 설정한 `OPENAI_API_KEY`, `OPENAI_MODEL`을 서버에서 읽는다. 서비스 전용 설정은 `.env.example`을 **`.env`**로 복사해 지정한다. 기존 환경변수가 가장 우선하며, 두 env 파일에서는 `service/.env`가 우선한다. 키는 채팅·웹 코드·Git에 넣지 않는다. 키가 없으면 실행을 중단하며 준비된 답변으로 대체하지 않는다.

| 설정 | 기본값 |
|---|---|
| `OPENAI_API_KEY` | 필수, 서버 전용 |
| `OPENAI_MODEL` | `gpt-4.1-mini` |
| `SERVICE_PORT` | `3004` |
| `SERVICE_HOST` | `127.0.0.1` |
| `SERVICE_PUBLIC_ORIGIN` | `http://127.0.0.1:3004` |
| `SERVICE_DB_PATH` | `runtime/waymate.sqlite`, 실행 디렉터리 기준 |

브라우저는 **127.0.0.1 주소**로 연다. Host·Origin을 지정한 주소와 일치시킨다. 기본 서버는 외부에 열리지 않는다. 개발용 HTTP 쿠키와 공개 서비스의 HTTPS 쿠키는 다르며 `NODE_ENV=production`에서는 HTTPS Origin이 필수다. 공개 배포·리버스 프록시 운영 설정은 이번 범위 밖이다.

## 구조와 계약

- `server/contracts.mjs`: 계정 프로필·취향·최대 14일 일정의 공통 검증과 AI 도구 JSON 스키마.
- `server/store.mjs`: SQLite/WAL, 사용자별 저장·소유권, 트랜잭션·버전 충돌·요청 중복 방지.
- `server/agent.mjs`: OpenAI Responses 스트리밍과 함수 호출 루프, 실행 중단·최대 시간/횟수 제한.
- `server/http.mjs`: 세션 인증·CSRF·Origin·요청 제한·HTTP API·SSE·정적 파일.
- `web/`: 반응형 홈·채팅·여행·마이·계정 UI. 미확인 전송을 계정별 보관하고 같은 요청 번호/내용으로 결과를 확인한다.
- `tests/`: 외부 과금 없는 HTTP/SQLite/도구·클라이언트 회귀. 실제 LLM 호출은 수동 검수와 구분한다.

| 에이전트 도구 | 실제 동작 |
|---|---|
| `get_profile` | 인증한 본인의 확정 프로필 읽기 |
| `get_saved_trips` | 본인이 저장한 여행 읽기 |
| `propose_preferences` | 취향 후보 제안, 확인 전 변경 없음 |
| `propose_trip` | 날짜·장소·일별 일정 초안 제안, 확인 전 저장 없음 |

읽기 도구에 사용자 ID를 받지 않는다. 모델이 임의 계정·내비·통화 도구를 호출해도 실행하지 않는다. `store:false`와 수동 대화 문맥을 사용한다. 이는 OpenAI의 모든 데이터 보관 정책을 무보관으로 바꾼다는 뜻은 아니다. 실제 요청에는 최근 완료 대화 최대 20턴과 필요한 본인 정보만 넣는다.

## HTTP API

브라우저 변경 요청에 동일한 `Origin`과 `application/json`이 필요하다. 장치 전용 `/api/vehicle/`는 별도의 장치 인증을 사용하며 Origin·Cookie를 거절한다. 인증 이후 변경은 `X-CSRF-Token`도 필요하다. HttpOnly·SameSite=Strict 세션 쿠키를 사용하며 토큰 원문은 DB에 저장하지 않는다. HTTPS Origin은 Secure·`__Host-` 쿠키를 사용한다. 비밀번호는 개별 salt의 scrypt로 저장한다.

| 경로 | 기능 |
|---|---|
| `GET /api/session` | 현재 계정·CSRF·대화 목록·여행 목록·연결 차량 요약 |
| `POST /api/auth/register`, `/login`, `/logout` | 가입·로그인·세션 폐기 |
| `POST /api/consent` | `{accepted:boolean}` AI 전달 동의/철회 |
| `PUT /api/profile` | `{version,profile}` 직접 수정, 충돌 시 409 |
| `GET/POST /api/chats` | 목록/생성, `?archived=true`로 보관함 |
| `GET/PATCH /api/chats/:id` | 상세/`{archived:boolean}` 보관·복원 |
| `POST /api/chats/:id/messages` | `{requestId,message,expectedVersion}`, 즉시 202 |
| `GET /api/turns/:id/events` | SSE snapshot/delta/phase/done, 재연결은 생성하지 않음 |
| `POST /api/turns/:id/cancel`, `/retry` | 직접 중단/명시적 `{attempt}` 재시도 |
| `GET /api/trips` | 저장한 본인 여행 |
| `POST /api/drafts/:id/confirm` | 초안 확인, 중복 확인은 같은 결과 |
| `GET /api/vehicles`, `POST /api/vehicles/pair` | 본인의 연결 목록·코드로 차량 확인 요청 |
| `POST /api/vehicles/:id/deliveries`, `/revoke` | 확정 여행 명시 전송·연결 해제 |
| `POST /api/vehicle/enroll`, `/sync`, `/confirm`, `/ack`, `/unpair` | 장치 키로 등록·상태 보고·승인·저장 후 ACK·해제 |

메시지 원문을 먼저 저장하고 외부 생성은 그 후 시작한다. 같은 요청의 네트워크 재전송은 다시 과금하지 않는다. 실패·중단은 원문과 실패 상태를 유지하며 허위 AI 답변이나 미완료 초안을 저장하지 않는다. 재시도는 사용자가 직접 선택한다. 동시 생성은 계정당 2개, 대화당 1개이며 메시지는 최대 4,000자, 대화당 100개다. 생성 완료/실패가 대화 버전을 올리므로 오래된 화면의 새 전송은 재확인이 필요하다.

## 데이터와 복구

`runtime/`과 `.env`는 Git 추적 제외다. DB에는 대화·확정 프로필·여행·초안·동의 시각·만료 세션이 들어 있으므로 개인 데이터로 관리한다. 서버는 비밀번호/API 키/생성 원문을 로그로 출력하지 않는다. SQLite는 애플리케이션 수준에서 암호화하지 않으므로 Mac 계정과 디스크 암호화로 보호한다.

정상 종료는 `Ctrl+C` 또는 SIGTERM이다. 종료 후 `waymate.sqlite`를 백업한다. 실행 중 DB 파일만 복사하지 않는다(WAL 포함 문제가 생긴다). 동일 DB는 단일 서버만 연다. 비정상 종료로 `.lock`이 남으면 파일 안 PID의 서버가 **완전히 종료됐는지 확인하고 DB/WAL/SHM을 백업한 뒤** lock 파일만 제거한다. 실행 중인 서버의 lock이나 WAL을 제거하면 안 된다. 재시작 시 미완료 생성은 실패로 표시하며 자동으로 유료 요청을 재실행하지 않는다.

## 검증과 현재 경계

`npm test`: **73개 통과**(기존 42 + 차량 연결/계약·모바일 경합·이행·경계 회귀 31). `.github/workflows/service-checks.yml`에도 같은 검사를 추가했다. 기존 `mock-app` 테스트 **332개 통과**. 새 개인 여행 Activity·Repository와 별도 계약을 추가했으며 내비 경로를 바꾸지 않는다. 차량 기기 회귀 35개와 실제 3분할·UXR 종단 검수는 [34번](../docs_prototype/34_계정_차량_페어링_및_여행_전달.md)을 따른다.

2026-11-14 실제 로컬 검수: 가입 → 동의 → 실제 취향 후보 → 직접 기억 → 실제 1박 2일 초안 → 직접 저장 → 다른 대화에서 저장 취향/여행 조회 → 곰 선택 → 서버 재시작 후 기록 복원. 브라우저·화면 증거는 [구현 기록](../docs_prototype/29_모바일_실제_에이전트_서비스.md)과 [화면 QA](design-qa.md)에 정리한다.

현재 구현은 **개인 AI 상담·여행 준비**다. 실사용자 간 매칭·실시간 상대 통신, 장소/교통/날씨 실시간 조회·예약, 음성 입력/출력, 이메일 계정 복구, 계정 삭제/데이터 내보내기, 운영 결제/감사/모니터링은 후속이다. 준비된 상대나 가짜 성공을 표시하지 않는다.

**새 서비스의 인증된 계정↔차량 페어링·확정 여행 전달·ACK를 구현했다.** [34 계약·실행·검수](../docs_prototype/34_계정_차량_페어링_및_여행_전달.md), [공통 JSON 스키마](contracts/vehicle-v1.schema.json)와 [수신 예제](contracts/examples/received.json)를 따른다. 5분 일회용 코드·차량 직접 승인·계정/장치 소유권·연결 세대·전달 revision·idempotent requestId·유실 응답 복구를 적용한다. 본인의 별명/캐릭터와 선택 여행만 전달하며 원문 대화·비공개 소개·취향은 제외한다. 실제 UXR 정차/foreground가 확인돼야 새 연결·개인 일정 표시·수신 ACK가 가능하다. 오프라인·주행 때 저장된 개인정보를 화면에 보이지 않고, 해제·재연결 때 이전 전달을 적용하지 않는다. 기존 3000/3002 v4 시연과 내비 실행권·journal은 계속 별도다. 동적 POI/좌표·내비 연결은 후속이다.

PR #21 리뷰에서 지적한 대화 전환 지연 응답과 미선언 도구·과거 이력 방어는 [32번 리뷰·회귀 기록](../docs_prototype/32_PR19_21_리뷰_반영_및_회귀.md)을 참조한다. 단독 신규 회귀는 `node --test tests/ui-races.test.mjs tests/tool-history.test.mjs`로 실행한다. 외부 API 호출 없이 실제 브라우저 핸들러·adapter·runner·임시 DB를 검사한다.


## 차량 저장과 DB 이행

SQLite `user_version`을 1→2로 이행하며 `vehicles`, `vehicle_pairings`, `vehicle_deliveries`만 추가한다. 같은 DB를 사용하는 구 서버를 정상 종료하고 SQLite backup으로 일관된 비공개 백업을 만든 뒤 새 코드를 시작한다. 기존 계정·세션·대화·초안·여행을 지우지 않는다. 구 서버를 계속 실행해 두어도 새 API가 생기는 것은 아니다. v2 DB는 v1 서버가 열 수 없으므로 롤백 시 서버를 종료하고 이행 전 DB 백업도 함께 복원해야 한다.

차량 토큰은 256비트 임의 값이며 서버에는 해시만 저장한다. 장치 경로는 모바일 세션으로 인증할 수 없고, 세션 경로는 장치 토큰으로 인증할 수 없다. 코드/장치 등록/전송 요청은 제한한다. 로컬 HTTP의 에뮬레이터 Host 예외는 `/api/vehicle/`에만 적용하며 웹 Host/Origin/CSRF는 유지한다. UXR 보고는 인증한 클라이언트 보고이며 원격 플랫폼 attestation은 아니다.

차량은 앱 전용 SharedPreferences 자격 증명과 별도 AtomicFile 수신본을 사용한다. 정확한 전달을 저장·다시 읽어 확인한 뒤 최신 연결/전달/revision으로 ACK한다. 저장 실패 시 ACK하지 않는다. 네트워크/현재 연결 확인 전에는 캐시로 개인정보를 표시하지 않는다. Debug는 `10.0.2.2` 개발 호스트와 기기 내부 HTTP 회귀용 `localhost`만 평문을 허용하며 Release 허용 범위를 넓히지 않았다. 공개 HTTPS 주소·배포 구성은 후속이다.
