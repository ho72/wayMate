# ElevenLabs TTS 서버 연동

모바일 계정 서비스(`service`, 3004)와 Pleos 시연 서버(`mock-app`, 기본 3000)가 `shared/server/`의 동일한 서버 전용 모듈을 사용한다. 클라이언트는 문장을 보내고 MP3 바이너리를 받는다. ElevenLabs API 키·실제 보이스 ID·모델은 서버에서만 관리한다. 모바일 계정 앱·시연 모바일에 답변별 **음성으로 듣기**, 중단·전송 동의 해제를 연결했고 Android `AgentSpeech`도 서버 MP3 재생을 지원한다. 연결한 계정 여행 화면에는 **여행 요약 듣기**를 추가했다.

## API 키·보이스 ID 발급

1. [ElevenLabs](https://elevenlabs.io/)에 가입하고 로그인한다.
2. 왼쪽 **Developers → API Keys → Create Key**에서 키를 만든다. 이름은 `waymate-dev`처럼 구분할 수 있게 지정한다. 메뉴 위치는 [공식 키 발급 안내](https://elevenlabs.io/docs/help-center/technical/how-do-i-authorize-myself-using-an-api-key)를 따른다.
3. 권한을 제한한다면 **Text to Speech** 접근을 허용한다. 이 구현은 보이스 목록 API를 호출하지 않으므로 음성 생성 외의 쓰기 권한은 필요하지 않다. 필요에 맞게 크레딧 한도를 설정할 수 있다. [공식 키 권한·한도 안내](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).
4. 생성한 비밀 API 키를 복사해 아래 서버 `.env`에만 넣는다. 채팅·모바일 설정·Kotlin·웹 JavaScript에는 붙여넣지 않는다.
5. 사용할 목소리를 **My Voices**에서 찾아 **⋯ → Copy voice ID**로 ID를 복사한다. **키와 보이스 ID는 서로 다른 값**이며 둘 다 필요하다. [공식 Voice ID 안내](https://elevenlabs.io/docs/help-center/technical/how-do-i-find-the-voice-id-of-my-voices-via-the-website-and-api).

보이스의 계정별 API 사용 가능 여부와 크레딧은 ElevenLabs 대시보드에서 확인한다. 이 작업에서 실제 키를 발급하거나 유료 요청을 실행하지 않았다.

## 설정과 실행

실행할 서버의 `.env`에 아래 값을 설정한다. 기존 OpenAI 설정은 유지하고 아래 항목을 추가하거나 수정한다. 같은 변수 이름을 파일 안에 중복해서 넣지 않는다.

| 용도 | 넣을 파일 | 실행 |
|---|---|---|
| 모바일 계정 서비스 + 차량 **내 계정 여행** | `wayMate/service/.env` | `wayMate/service/`에서 `npm start` |
| 시연 모바일 + 차량 기본 친구/추천/콘텐츠 | `wayMate/mock-app/.env` | `wayMate/mock-app/`에서 `npm run start:tts` |

두 흐름을 모두 사용하면 **두 파일에 같은 키·보이스 설정**을 넣는다. `service/.env`에는 기존 OpenAI 상속을 바꾸지 않는 주석 템플릿도 준비했다. 주석으로 시작하는 `# ELEVENLABS_...` 앞의 `# `를 제거하고 값을 입력하면 된다. 실제 키는 Git이나 앱 번들에 넣지 않는다.

```dotenv
ELEVENLABS_API_KEY=발급받은_API_키
ELEVENLABS_VOICE_ID=계정에서_사용할_수_있는_보이스_ID
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
# 선택: 생략하면 기본 보이스 사용
ELEVENLABS_VOICE_DRAGON=
ELEVENLABS_VOICE_BEAR=
```

키가 비어 있으면 TTS만 비활성화된다. 키를 지정했다면 기본 보이스 ID도 필수다. 보이스의 실제 이용 권한은 음성 요청 시 ElevenLabs가 확인한다. 기본 MP3 형식은 `mp3_44100_128`이다. 외부 SDK나 새 npm 의존성 없이 Node 22의 `fetch`로 [공식 Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)를 호출한다.

- **모바일 서비스**: `service/`에서 `npm start`. 기존 OpenAI 키도 필요하다. 기존 설정처럼 `mock-app/.env`와 `service/.env`를 읽으며 후자가 우선한다.
- **시연 서버**: `mock-app/`에서 `npm run start:tts`. `.env`를 읽는다. `.env.example`의 `WAYMATE_PORT=3002`를 그대로 사용했다면 접속 포트도 3002다. TTS만 사용할 때는 `WAYMATE_AI_PROVIDER=disabled`로 지정한다. 기본 `npm start`는 `.env`를 자동으로 읽지 않는다.

`ELEVENLABS_API_KEY`는 클라이언트에서 받지 않는다. 클라이언트가 보낸 임의 `voiceId`, `model`, `url`, `apiKey` 필드는 422로 거절한다. 메타데이터에도 실제 보이스 ID나 키를 반환하지 않는다.

## HTTP 계약

| 서버·경로 | 인증·동작 |
|---|---|
| 서비스 `GET /api/tts/config` | 기존 로그인 세션. 사용 가능 여부·보이스 별칭·최대 글자 수 확인 |
| 서비스 `POST /api/tts` | 로그인 세션 쿠키 + 동일 `Origin` + `X-CSRF-Token` |
| 서비스 `GET /api/vehicle/tts/config` | `X-Waymate-Device-Id` + `Authorization: Bearer 장치토큰`, 활성 페어링 필수 |
| 서비스 `POST /api/vehicle/tts` | 위 장치 인증·활성 페어링. `Cookie`, `Origin`, 브라우저 fetch 메타데이터 거절 |
| 시연 `GET /api/tts/config`, `POST /api/tts` | 기존 `X-Demo-Actor: web 또는 car`; web은 `X-Demo-Client-Id` UUID 필수. 현재 web 소유자·회차 검사 |

시연 서버의 역할 헤더는 로컬 시연용이다. 실제 계정·장치 인증이 필요한 연결은 `service` 경로를 사용한다. Android 에뮬레이터에서 서비스 장치 경로는 기존처럼 `http://10.0.2.2:3004`로 연결할 수 있다.

POST 요청은 `Content-Type: application/json`이다.

```json
{
  "requestId": "7a223f58-e4c7-476a-8efc-fb03121eef76",
  "text": "안녕하세요. 함께 여행을 시작해요.",
  "voice": "dragon",
  "consent": true
}
```

- `requestId`: 음성 요청마다 새 UUID. 동일 요청의 결과 재확인은 같은 ID와 같은 본문을 사용한다.
- `text`: 공백만 있는 입력 제외, Unicode 코드포인트 기준 최대 2,000자. 긴 답변은 클라이언트에서 문장 단위로 나눈다.
- `voice`: `default`, `dragon`(파도), `bear`(모카). 생략하면 `default`.
- `consent`: 낭독 문장을 **ElevenLabs에 전송**한다는 안내와 사용자 동의를 거쳐 `true`를 보낸다. 기존 OpenAI 전달 동의와 별개다. 앱에서 안내 없이 자동으로 true를 넣지 않는다.

성공은 `200`, `Content-Type: audio/mpeg`, `Cache-Control: no-store`와 MP3 원본이다. JSON/base64나 공개 음성 URL은 만들지 않는다. `X-TTS-Provider: elevenlabs`, `X-TTS-Replayed: true/false`도 반환한다. 전체 음성을 받은 후 응답하므로 실시간 스트리밍 재생 API는 아니다.

브라우저 요청의 기본 형태(앱에서는 `ServiceClient.speech`와 `ServerSpeech`로 연결):

```js
const response = await fetch('/api/tts', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
  body: JSON.stringify({
    requestId: crypto.randomUUID(),
    text: answerText,
    voice: 'dragon',
    consent: elevenLabsConsentAccepted,
  }),
});
if (!response.ok) throw new Error((await response.json()).error.message);
const mp3 = await response.blob();
// 플레이어에 전달. Blob URL 재생을 붙일 때는 CSP의 media-src도 설정한다.
```

Android/Pleos의 `SpeechApi`가 POST 응답을 제한된 크기의 앱 캐시 `.mp3`로 내려받고 `AgentSpeech`가 플레이어로 전달한다. 플레이어가 파일을 연 뒤 임시 파일은 삭제한다. 기존 JSON 응답 파서로 오디오를 읽지 않는다. 기존 `AgentSpeech`의 오디오 포커스·창 생명주기·UXR/주행 정책·재생 중단 검사를 유지하며, 중단되거나 회차가 바뀐 요청의 늦은 응답을 재생하지 않는다. 이 API는 차량 제어·내비 조작이나 재생 허가를 부여하지 않는다.

## 앱에서 사용

- **모바일 계정 앱**: 완료한 답변 아래 **음성으로 듣기** → 첫 동의 후 재생. 긴 답변은 1,500자 이하로 나눠 순서대로 재생한다. **음성 멈추기**, 마이의 **음성 동의 해제**를 제공하며 화면 이동·앱 숨김·로그아웃 때 재생과 대기를 중단한다. 새 답변을 자동으로 낭독하지 않는다.
- **시연 모바일**: 대화 기록의 **음성으로 듣기** → 첫 확인 후 재생. 재생 바에서 중단·동의 해제가 가능하다. 회차 초기화·화면 숨김 때 중단한다.
- **모바일 브라우저 자동 재생 제한**: 음성을 다시 생성하지 않고 받은 Blob을 유지해 **재생하기** 버튼으로 재생한다. 준비 중 같은 듣기 버튼을 다시 눌러도 새 생성 요청을 보내지 않는다.
- **플레오스 기본 화면**: 서버가 TTS를 제공하면 기존 듣기 동작이 서버 음성으로 연결된다. 처음에는 **정차 상태**에서 전송 동의를 확인한다. **동의하고 음성 켜기** 후 듣기를 다시 누른다. 동의하지 않은 주행 상태에는 기존 허용된 준비 음원만 사용한다. 동의 후에도 주행 허용 문장·유효 시간·포커스 조건을 충족해야 재생하며 제한 변화나 포커스 상실 후 자동 재개하지 않는다.
- **플레오스 내 계정 여행**: 여행을 실제로 받은 뒤 **여행 요약 듣기**를 누른다. 장치 인증·활성 페어링으로 제목·목적지·요약만 낭독한다. 정차 상태에서만 시작하며 연결 해제·화면 이탈·여행 변경 때 중단한다.
- **키 설정 전 플레오스**: TTS 설정 조회에서 비활성/연결 불가이면 기존 준비 음원·Android TTS를 사용한다. ElevenLabs 호출이 성공한 것처럼 표시하지 않는다. 서버 음성이 활성화된 뒤의 생성 오류는 재생 불가로 처리하며 자동으로 유료 재시도하지 않는다.

키를 설정한 뒤 **해당 서버를 재시작**하고 모바일은 새로고침, 플레오스는 앱을 다시 연다. 차량 시연 포트가 `.env`에서 `3002`라면 APK도 `-PwaymateApiPort=3002`로 빌드해야 한다. 기본 APK는 3000, 개인 계정 서비스는 3004에 연결한다. 릴리스 배포의 서버 주소/HTTPS 설정은 별도다.

## 오류와 호출 제한

오류는 기존 서버 형식의 `error: {code, message}` JSON이다. 시연 서버는 기존 `ok:false`와 역할별 state도 포함한다. 외부 오류 본문·인증 정보·낭독 원문은 로그나 오류 응답에 복사하지 않는다.

| 상태 | 대표 코드·의미 |
|---|---|
| 401/403 | 기존 인증/CSRF/Origin 오류, `TTS_PAIRING_REQUIRED`, `TTS_CONTEXT_CHANGED` |
| 403 | `TTS_CONSENT_REQUIRED`: ElevenLabs 전달 동의 필요 |
| 409 | `TTS_REQUEST_ID_REUSED`: 동일 ID의 문장·목소리 변경 |
| 422 | `TTS_INVALID_INPUT`, `TTS_INVALID_VOICE` |
| 429 | `TTS_BUSY`, `TTS_RATE_LIMITED` |
| 502 | `TTS_PROVIDER_ERROR`, `TTS_INVALID_AUDIO`, `TTS_AUDIO_TOO_LARGE` |
| 503 | `TTS_NOT_CONFIGURED`, `TTS_PROVIDER_BUSY`, `TTS_CACHE_FULL`, `TTS_UNAVAILABLE` |
| 503 | `TTS_PAYMENT_REQUIRED`: 제공업체 402 응답. 현재 API 키가 속한 계정의 요금제·선택한 보이스 API 이용 가능 여부·한도를 확인 |
| 504 | `TTS_TIMEOUT`: 전체 외부 호출·오디오 다운로드 25초 초과 |

계정/장치 페어링(시연은 회차·역할·클라이언트)별 신규 생성은 분당 20회, 서버 전체 분당 60회다. 동시 생성은 주체당 1개·서버 전체 4개다. 동일 ID의 동시 요청은 하나의 호출로 합친다. 성공 오디오와 실패 영수증을 완료 후 5분간 메모리에 보관한다. 영수증 64개·완료 오디오 32MiB, 응답 하나 8MiB 상한이 있으며, 유효 영수증을 강제로 지워서 중복 호출하지 않는다.

같은 주체·ID·본문을 재요청하면 5분 내 성공 바이트 또는 같은 실패를 반환한다. 실패한 요청을 자동 재시도하지 않는다. 사용자가 명시적으로 다시 생성할 때 새 ID를 사용한다. **서버 재시작·5분 만료·다중 서버 간 정확히 한 번 과금은 보장하지 않는다.** 영속 중복 방지가 필요하면 공유 저장소에 요청 영수증과 음성을 보관하는 후속 작업이 필요하다.

클라이언트 연결만 끊긴 경우 서버의 생성은 제한 시간까지 진행하며 완료 결과를 재확인할 수 있다. 서버 종료·타임아웃은 외부 요청을 취소한다. 로그아웃·차량 연결 해제·시연 초기화가 생성 도중 발생하면 완료 응답 전 권한을 다시 검사해 음성을 반환하지 않는다. 이미 전송한 문장이나 발생한 외부 과금을 되돌리지는 못한다.

서버는 음성·원문을 디스크/DB에 추가 저장하지 않는다. ElevenLabs 측 기록·보관은 해당 계정의 제공업체 정책을 따른다. 일반 계정에서 지원되지 않을 수 있는 zero-retention 옵션을 임의로 설정하지 않는다.

## 검증

`service/`와 `mock-app/`의 `npm test`로 기존 회귀와 TTS 회귀를 실행한다. 외부 API는 대역을 사용하므로 과금하지 않는다. 모바일 서비스 전체 95개와 시연 서버 전체 337개 회귀가 통과했다. Android mock/real 컴파일·JVM·Lint, Pleos API 34 에뮬레이터에서 실제 HTTP MP3 재생·중단/늦은 응답 차단 2개가 통과했다. 브라우저에서는 390px 모바일 화면의 동의·재생·중단을 직접 확인했다. 음원은 로컬 테스트 대역이며 ElevenLabs 과금은 발생하지 않았다.

키·보이스 설정 후 실제 한국어 발음·품질·지연 및 계정 권한 검수는 별도로 필요하다.

책임 경로:

- `shared/server/elevenlabs.mjs`: 환경변수·고정 ElevenLabs 주소·응답 검증·오류 정리.
- `shared/server/speech.mjs`: 요청 검증·동의·동시 호출·분당 제한·중복 영수증·종료/타임아웃.
- `shared/server/speech-http.mjs`: JSON 요청·권한 재검사·MP3 HTTP 응답.
- `service/server/http.mjs`, `vehicle-http.mjs`: 기존 계정/장치 인증과 TTS 연결.
- `mock-app/server/v4/http.mjs`, `commands.mjs`: 기존 시연 역할·최신 회차/소유자 검증과 TTS 연결.

- `service/web/speech-client.mjs`: 양쪽 모바일 웹의 분할·Blob 재생·중단·자동 재생 제한 처리.
- `vehicle/.../platform/speech/SpeechApi.kt`, `AgentSpeech.kt`, `VoiceConsentGate.kt`: 서버 음성 다운로드·안전한 재생·전송 동의.

## 실서버 검수 · 2026-11-15

- 모바일 3004는 기존 DB를 보존해 재시작했고, 시연 서버는 설치된 Pleos APK와 일치하도록 `.env`의 포트를 3000으로 맞춰 실행했다.
- 두 서버의 두루/루밋 Voice ID 매핑을 확인했다.
- 검수 계정에서 두루의 `안녕. 반가워.` 8자 문장을 실제로 한 번 요청했으나 ElevenLabs가 HTTP 402 `payment_required`를 반환했다. 성공한 합성은 없으며 이후 외부 합성 요청을 중단했다. 계정 플랜은 키의 조회 권한 제한 때문에 확인하지 않았으므로 무료 플랜이라고 단정하지 않는다.
- [공식 문서](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)에 따르면 무료 플랜은 Voice Library 보이스를 API로 사용할 수 없다. 현재 API 키가 속한 계정의 해당 보이스 이용 가능 여부와 한도를 확인해야 실시간 합성 검수를 완료할 수 있다.
- 기존 두루/Harry Kim·루밋/Han MP3를 재사용한 Pleos 재생·중단 및 결제 제한 시 잘못된 성공/로컬 대체를 방지하는 기기 회귀 4개가 통과했다. 추가 과금 호출은 없다. 설치 앱과 동일한 `SpeechApi`/`BuildConfig.API_BASE_URL`을 사용하는 실서버 설정 GET 기기 검수 1개도 통과했다.
- 임시 검수용 합성 상한/재사용 로더는 일반 서버 실행에서 제거했다. 서버는 기본 실행 명령으로 동작 중이다. 검수 증거는 Git 제외 경로 `mock-app/runtime/tts-validation-20261115/result.json`에 기록했다.
