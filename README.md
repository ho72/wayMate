<p><img src="shared/design/assets/durumit-logo-transparent.png" width="320" alt="두루밋 로고"></p>

# 두루밋 · Doo Roo Meet

**혼자 떠나는 자동차 여행에 AI 친구와 새로운 만남을 더하는 서비스입니다.**

모바일에서 여행 준비 → Pleos에서 상대 알아가기 → 짧은 만남 → 함께 또는 각자의 여행

[제출 APK](apk/말할카말카_두루밋_release.apk) · [시연 영상](#시연-영상) · [주요 화면](#주요-화면) · [코드 구조](#코드-구조) · [실행 방법](#실행-방법) · [테스트 환경](#테스트-환경-및-필요한-설정) · [검증](#기술-및-검증)

| 개발 영역 | 바로 가기 | 담당 기능 |
| --- | --- | --- |
| **차량 목업 앱** | [vehicle-app/](vehicle-app/) | Pleos 캐릭터 UI·주행 모드·만남·내비 승인 |
| **백엔드** | [backend/](backend/) | 계정·AI 대화·여행 저장·연결·차량 전달 |
| **모바일 웹** | [mobile-web/](mobile-web/) | 여행 준비·취향 확인·일정 편집·여행자 연결 |

## 시연 영상

<table>
  <tr>
    <th><a href="https://youtu.be/jOdiGIpvDeM">목업 스토리 시연<br>▶ YouTube에서 보기 ↗</a></th>
    <th><a href="https://youtu.be/4jAi-i0g0ng">Pleos 시스템 구현 시연<br>▶ YouTube에서 보기 ↗</a></th>
  </tr>
  <tr>
    <td><a href="https://youtu.be/jOdiGIpvDeM"><img src="https://img.youtube.com/vi/jOdiGIpvDeM/hqdefault.jpg" width="320" alt="목업 스토리 시연 · 클릭하여 YouTube에서 보기"></a></td>
    <td><a href="https://youtu.be/4jAi-i0g0ng"><img src="https://img.youtube.com/vi/4jAi-i0g0ng/hqdefault.jpg" width="320" alt="Pleos 시스템 구현 시연 · 클릭하여 YouTube에서 보기"></a></td>
  </tr>
  <tr><td>스토리로 살펴보는 서비스 이용 흐름</td><td>실제 Pleos에서 확인하는 화면과 조작 흐름</td></tr>
</table>

## 주요 화면

### 모바일 · 대화로 준비하는 여행

<table>
  <tr><th>1. AI 친구와 대화</th><th>2. 여행 계획 확인·수정</th><th>3. 여행자 연결</th></tr>
  <tr>
    <td><img src="assets/screenshots/mobile-chat.png" width="250" alt="AI 친구와 여행 취향을 이야기하는 모바일 채팅"></td>
    <td><img src="assets/screenshots/mobile-trip.jpg" width="250" alt="대화 안에서 지도와 시간별 일정을 확인하는 여행 카드"></td>
    <td><img src="assets/screenshots/mobile-match.jpg" width="250" alt="여정과 공통 시간을 확인하고 여행자를 연결하는 모바일 화면"></td>
  </tr>
  <tr><td>대화를 통해 여행 취향을 파악하고,<br>사용자가 확인한 내용만 기억합니다.</td><td>대화로 만든 일정의 장소·시간을 수정하고,<br>확정한 계획을 내 여행에 저장합니다.</td><td>공개할 소개와 여행 정보를 확인하고,<br>상대와 만날 수 있는 공통 시간을 정합니다.</td></tr>
</table>

### Pleos · 알아가고 만나기

<table>
  <tr><th>4. 상대 AI 친구와 첫 인사</th><th>5. 짧은 만남 제안</th><th>6. 경유지 추가 승인</th></tr>
  <tr>
    <td><img src="assets/screenshots/vehicle-peer.png" width="270" alt="상대 여행자의 AI 친구 루밋을 소개하는 Pleos 화면"></td>
    <td><img src="assets/screenshots/vehicle-meeting.png" width="270" alt="장소와 시간, 다음 일정을 함께 확인하는 만남 제안 화면"></td>
    <td><img src="assets/screenshots/vehicle-navigation.png" width="270" alt="기존 목적지를 유지하며 만남 장소를 경유지로 추가하는 승인 화면"></td>
  </tr>
  <tr><td>상대가 공개한 소개를 AI 친구에게 듣고,<br>질문·메시지로 서로 알아갑니다.</td><td>만남 장소·시간과 다음 일정을 확인하고,<br>서로 동의한 짧은 만남을 준비합니다.</td><td>기존 목적지를 유지할지 확인한 뒤,<br>운전자가 만남 장소의 경유지 추가를 승인합니다.</td></tr>
</table>

<details>
<summary><strong>만남 이후 · 함께해도, 각자여도 이어지는 여행</strong></summary>

만남이 끝나면 두 사람은 상대의 선택을 보지 않고 독립적으로 결정합니다. 두 사람 모두 제출하기 전에는 결과를 확정하지 않습니다.

<table>
  <tr><th>7-A. 함께 여행 이어가기<br>IF: 두 사람 모두 동행 선택</th><th>7-B. 내 AI 친구와 여행 이어가기<br>IF: 한 사람이라도 각자 여행 선택</th></tr>
  <tr>
    <td><img src="assets/screenshots/ending-together.png" width="300" alt="두 사람이 모두 동행을 선택한 함께 여행 결말"></td>
    <td><img src="assets/screenshots/ending-solo.png" width="300" alt="각자의 일정으로 돌아가 내 AI 친구와 이어가는 결말"></td>
  </tr>
  <tr><td>서로의 동의를 확인하고,<br>함께 이어갈 여행을 안내합니다.</td><td>각자의 결정을 존중하고,<br>내 AI 친구와 원래 여행을 이어갑니다.</td></tr>
</table>

</details>

<details>
<summary><strong>현재 구현과 캡처 범위 · 기능별 개발 현황</strong></summary>

**제출 APK는 서버 없이 실행하는 오프라인 시연판입니다.** 아래의 계정·실제 AI·저장·차량 전달 기능은 소스 코드에 포함된 별도 서버 연동 모드에서 동작합니다. 화면 번호는 위의 주요 화면과 연결됩니다.

| 기능 | 구현한 내용 | 시연 방식·남은 범위 |
| --- | --- | --- |
| 가입·AI 친구 설정 | 계정 가입·로그인, 캐릭터 선택, 첫 대화, 취향 요약 확인·저장, 계정별 대화 복원 | 로컬 서버·SQLite 기반. 운영 서비스 배포는 후속 범위 |
| **1. AI 대화·취향** | OpenAI Responses API 스트리밍, 저장 취향·여행 조회, 취향/일정 제안 도구, 답변 중단·재시도 | 실제 AI는 API 키 필요. 캡처의 대화는 촬영용 고정 응답 |
| **2. 여행 계획** | 일정 초안 생성, 장소·시간 직접 편집, AI에 재수정 요청, 확인 후 저장, 기존 여행 업데이트 | 지도는 일정 설명용 SVG. 실시간 장소 검색·교통·경로 계산은 미구현 |
| **3. 여행자 연결** | 공개 소개·여행 정보 확인, 연결 요청·취소, 공통 시간 확인, 여행별 상태 저장 | 추천 후보는 고정 데이터. 상대 수락·답장은 진행자 패널로 재현하며 실사용자 자동 매칭은 미구현 |
| 모바일 → 차량 전달 | 연결 코드 요청·차량 승인, 확정 여행 전송, 차량 확인·저장 후 수신 확인(ACK), 연결 해제 | 서버 연동 모드의 실제 API·저장 처리. 오프라인 APK는 준비된 여행 사용 |
| **4. Pleos 교류** | 공개 프로필·AI 친구 소개, 질문·메시지 확인 흐름, 통화 동의 UI·음성 샘플 재생 | 상대 답변·통화는 시나리오. 실제 상대 통신·실시간 통화·마이크/STT는 미구현 |
| **5–6. 만남·내비** | 장소·시간 동의, 다음 일정 확인, 운전자 승인, 경유지 추가·취소·제거 상태 관리 | 제출 APK는 모의 내비. `realDebug`에서 고정 POI의 NaviHelper 추가·제거를 별도 검증했으며 실시간 만남 장소 추천은 미구현 |
| **7-A/B. 만남 이후 선택** | 독립 선택 제출, 두 사람의 제출 대기, 모두 동행 / 한 사람이라도 각자 선택 시 결과 분기 | 서버 상태 로직·차량 UI 구현. 상대의 선택은 진행자 입력, 오프라인 APK에서는 두 결과를 각각 재현 |
| 차량 사용 환경 | Pleos 차량 UX 제한 수신, 정차 상세/주행 간편 화면 전환, 2·3분할 대응, 제한·포커스 변경 시 음성 중단 | 제출 release APK도 실제 에뮬레이터의 정차·주행 전환 확인. Gleo 연동은 후속 범위 |

**캡처의 출처:** 모바일 1–3번은 실제 웹 UI의 촬영·검수 화면이며, 고정 AI 응답·여행자 후보를 사용합니다. 차량 4–7번은 Pleos 에뮬레이터의 오프라인 Debug 미리보기입니다. 번호는 서비스 이용 순서이며, 서로 다른 검수 회차의 화면이므로 날짜·별명·여행이 다를 수 있습니다.

**검증의 범위:** 서버 API·상태 전이와 차량 단위 검사, 실제 release APK 설치·실행 및 주행 전환을 확인했습니다. 캡처 자체는 실제 상대와의 전체 통합 흐름 완주나 순정 내비 변경 성공을 입증하는 자료가 아닙니다. 영역별 상세 구현·코드·검사는 [모바일 웹](mobile-web/README.md), [백엔드](backend/README.md), [차량 앱](vehicle-app/README.md)에 정리했습니다.

[캡처 안내](assets/README.md) · [통합 시나리오 테스트](backend/tests/scenario-flow.test.mjs)

</details>

## 코드 구조

```text
wayMate/
├── vehicle-app/       # 차량 목업 앱 · Kotlin / Jetpack Compose / Pleos
├── backend/           # 계정·AI·여행 API · Node.js / SQLite
│   ├── server/        # 실제 계정·AI·여행·차량 API
│   └── demo/          # 기본 시연 서버·고정 데이터·공통 소재
├── mobile-web/        # 모바일 웹 · HTML / CSS / JavaScript
│   ├── src/           # 여행 준비·AI 채팅·연결 UI
│   ├── shared/        # 모바일·서버 공통 데이터 함수
│   └── demo/          # 기본 시연 웹·진행자 패널
├── shared/            # 공통 디자인·서버 음성 모듈
├── apk/               # 말할카말카_두루밋_release.apk · 제출용 release APK
├── assets/            # README용 대표 UI 캡처
└── .github/           # 서버·차량 빌드 및 테스트 CI
```

**모바일 웹 ↔ 백엔드 ↔ 차량 앱**으로 연결합니다. 모바일 화면은 백엔드가 API와 함께 제공하며, 차량은 확인한 여행을 저장하고 ACK를 보냅니다.

## 제출 APK

**팀명: 말할카말카 · 앱 이름: 두루밋**

- 파일: [`apk/말할카말카_두루밋_release.apk`](apk/말할카말카_두루밋_release.apk)
- 빌드: **demoRelease**, `debuggable=false`, 전용 release 서명
- 실행: **Pleos Connect ARM 2.1.0 / API 34**에 설치한 뒤 **두루밋 오프라인 시연** 실행
- 설정: 서버·계정·인터넷·API 키 없이 준비된 여행·대화·만남·두 결말을 재현
- [APK 정보·설치 방법](apk/README.md) · [SHA-256](apk/SHA256SUMS.txt)

## 실행 방법

### 0. Pleos가 아직 없다면 먼저 설치해 주세요

차량 앱을 실행하려면 **Pleos Connect 에뮬레이터가 먼저 설치·실행되어 있어야 합니다.** [Pleos 공식 설치·실행 가이드](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)에 따라 Android Studio에 시스템 이미지를 추가하고 AVD를 생성해 주세요. 이 프로젝트의 검증 환경은 **Pleos Connect ARM 2.1.0 / API 34**입니다.

설치 시 **Cold boot·RAM 4GB**로 설정하고 Device Manager에서 에뮬레이터를 켭니다. 아래 명령의 `adb`는 Android SDK의 **Platform-Tools**에 포함되어 있으며, 터미널에서 실행할 수 있도록 PATH에 추가해야 합니다.

**이하 안내는 Pleos 설치와 부팅이 완료된 상태를 기준으로 합니다.** 명령은 macOS/Linux 셸 기준입니다. 에뮬레이터는 한 대만 연결하고 정차 상태에서 진행해 주세요. 여러 대라면 각 `adb` 명령에 `-s <기기 ID>`를 지정합니다.

| 실행 목적 | 따라 할 안내 | 필요한 것 |
| --- | --- | --- |
| 제출 APK의 차량 화면·시나리오 체험 | **A. 제출 APK 실행** | Pleos·ADB. 서버·API 키·소스 빌드 불필요 |
| 실제 AI·여행 저장·모바일 → 차량 연결 | **B. 서버 연동 실행** | Pleos·ADB·Node.js 22.22.2·JDK 21·Android SDK 35·OpenAI API 키 |

### A. 제출 APK 실행 · 서버와 키 없이 체험

저장소 루트에서 실행합니다. `adb devices`에 부팅한 Pleos 기기가 `device` 상태로 표시되어야 합니다.

```sh
adb devices
PLEOS_USER_ID=$(adb shell am get-current-user | tr -d '\r')
adb install --user "$PLEOS_USER_ID" apk/말할카말카_두루밋_release.apk
```

Pleos의 현재 사용자 프로필에서 **두루밋 오프라인 시연**을 엽니다. 정차 상태의 상단 **시연** 메뉴에서 장면을 선택하거나 화면 버튼으로 여행·교류·만남·두 결말을 확인할 수 있습니다.

이 APK는 **독립 실행하는 오프라인 시연판**입니다. 아래의 백엔드를 실행해도 서버 연동 앱으로 바뀌지 않습니다. [APK 상세·설치 안내](apk/README.md)

### B. 서버 연동 실행 · 모바일 웹 + 백엔드 + 차량 앱

**서버 실행 → 차량 앱 빌드·설치 → 모바일에서 여행 준비·전달 → 차량에서 불러오기**까지 진행해야 연결됩니다. `npm start`는 백엔드와 모바일 웹을 제공하고, Gradle의 `assemble` 명령은 APK를 만들기만 합니다. Pleos 설치·앱 설치·여행 전달까지 자동으로 처리하지 않습니다.

#### 1. 백엔드와 모바일 웹 실행

Node.js **22.22.2**를 준비한 뒤 저장소 루트에서 실행합니다.

```sh
npm run setup
# backend/.env가 없다면 예제 파일을 복사합니다. 기존 설정은 유지합니다.
[ -f backend/.env ] || cp backend/.env.example backend/.env
```

`backend/.env`를 열어 아래 **OpenAI API 키**를 설정합니다. [OpenAI API 키 관리 페이지](https://platform.openai.com/api-keys)에서 발급한 본인 키를 사용합니다.

```dotenv
OPENAI_API_KEY=발급받은_OpenAI_API_키
OPENAI_MODEL=gpt-4.1-mini
```

| 설정 | 필수 여부 | 용도 |
| --- | --- | --- |
| `OPENAI_API_KEY` | **서버 연동 모드 필수** | 모바일 AI 대화·취향/일정 제안. 모델을 호출할 수 있는 API 프로젝트·사용 한도 필요 |
| `OPENAI_MODEL` | 선택 | 사용할 모델. 기본값 `gpt-4.1-mini` |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | 선택 | ElevenLabs 서버 음성 합성(TTS). 사용하지 않으면 둘 다 비워 두며 AI 텍스트 대화는 사용 가능 |

차량의 AI 대사 생성은 별도 선택 사항입니다. 기본 준비 대사로도 차량 시연을 진행할 수 있고, 생성 기능을 쓰려면 `.env`에 `WAYMATE_DIALOGUE_PROVIDER=openai`를 추가해 같은 OpenAI 키를 사용합니다.

키는 백엔드의 `.env`에만 입력합니다. 웹·Android 코드나 APK에 넣지 않습니다. `.env`는 Git에서 제외됩니다. 제출 APK와 키 없는 기본 시연에는 OpenAI 키가 필요하지 않습니다.

```sh
npm start
```

이 터미널은 켜 둡니다. 브라우저에서 `http://127.0.0.1:3008`을 열면 모바일 웹을 사용할 수 있습니다. `http://127.0.0.1:3008/health`에서 `status: "ready"`를 확인합니다. 이는 서버 기동 확인이며, 실제 키·모델 호출은 웹에서 AI 답변을 받아 확인합니다.

#### 2. 서버 연동 차량 앱 빌드·설치

새 터미널에서 **JDK 21·Android SDK 35·Build Tools 35.0.0**을 준비합니다. 처음 빌드한다면 Android Studio에서 `vehicle-app/`을 열어 SDK 경로와 Gradle 동기화를 완료합니다. 저장소 루트에서 다음을 실행합니다.

```sh
cd vehicle-app
./gradlew :app:assembleMockDebug \
  -PwaymateApiPort=3008 -PwaymatePersonalApiPort=3008
adb devices
PLEOS_USER_ID=$(adb shell am get-current-user | tr -d '\r')
adb install -r --user "$PLEOS_USER_ID" \
  app/build/outputs/apk/mock/debug/app-mock-debug.apk
adb shell am start --user "$PLEOS_USER_ID" \
  -n com.waymate.app.mock/com.waymate.app.MainActivity
```

위 단계에서 설치하는 앱은 **서버 연동 `mockDebug`**이며, 제출용 `demoRelease`와 별도 패키지입니다. 모바일·백엔드는 PC의 `http://127.0.0.1:3008`, 차량 앱은 같은 PC를 가리키는 `http://10.0.2.2:3008`을 사용합니다. 백엔드는 Pleos를 실행한 **같은 PC**에서 켜 두어야 합니다. `mockDebug`의 내비는 모의 동작입니다.

#### 3. 모바일에서 준비한 여행을 Pleos로 전달

1. PC 브라우저의 `http://127.0.0.1:3008`에서 가입·로그인하고 AI 친구 설정·첫 대화를 진행합니다.
2. AI와 여행 계획을 만든 뒤 일정 카드에서 **내 여행에 저장**합니다. **내 여행**에서 저장한 여행을 열어 소개와 만날 수 있는 날짜·시간을 확인합니다.
3. 공개할 소개·여행 정보를 확인하고 연결을 요청합니다. 같은 계정으로 `/scenario-operator`를 열어 상대의 수락을 입력한 뒤 모바일에서 공통 시간을 확인합니다. 상대 역할은 진행자 패널로 재현합니다.
4. 모바일에서 **Pleos로 이어가기**를 선택합니다. 전달 준비가 끝나도 차량에서 불러오기 전에는 수신 완료가 아닙니다.
5. Pleos 앱에서 **웹에서 준비한 여행 불러오기 → 저장된 준비 확인하고 시작**을 누르고 여행을 확인한 뒤 시작합니다. 모바일의 **차량 수신 확인 완료** 표시까지 확인합니다. 이후 상대 소개·만남·경유지 승인·결말을 진행하며, 상대 응답은 진행자 패널에서 입력합니다.

<details>
<summary>추가 기능 · 내 계정 여행을 차량에 연결 코드로 보내기</summary>

위의 만남 시나리오 전달과 별도로, 저장한 개인 여행을 계정 연결로 전송할 수 있습니다.

1. 차량 앱의 **내 계정 여행 → 내 계정 연결 시작**에서 코드를 확인합니다.
2. 모바일의 **마이 → 내 차와 연결**에 코드를 입력하고, 차량에서 **이 계정과 연결**을 승인합니다.
3. 모바일에서 보낼 저장 여행을 선택해 전송하고, 차량에서 **이 여행 받기 → 확인**을 누릅니다.
4. 차량이 여행을 저장하고 ACK를 보낸 뒤 모바일에서 수신 완료를 확인합니다. 개인 여행 수신만으로 내비 경로를 변경하지 않습니다.

</details>

#### 연결 확인·문제 해결

| 확인 지점 | 정상 상태·확인할 설정 |
| --- | --- |
| Pleos 설치·ADB | `adb devices`에 `device` 표시. 앱은 설치한 현재 사용자 프로필에서 실행 |
| 백엔드 | PC에서 `/health` 응답. 3008 포트 사용 여부와 실행 터미널의 오류 확인 |
| 실제 AI | `.env`의 OpenAI 키·모델·API 사용 한도 확인 후 서버 재시작, 웹에서 답변 수신 확인 |
| 차량 → 백엔드 | 같은 PC에서 백엔드 실행, 두 Gradle 포트 모두 3008로 빌드한 `mockDebug` 설치. 제출 APK는 서버에 연결하지 않음 |
| 여행 불러오기 | 모바일에서 여행 저장·연결 준비·Pleos 전달 완료 후 차량에서 불러오기. 완료 표시는 차량 확인 이후 |
| 상세 버튼 비활성 | 실제 차량 UX 제한이 정차 상태인지 확인. 속도 0만으로 정차를 판단하지 않음 |

<details>
<summary>선택 · 키 없는 웹 기본 시연과 개발 검증</summary>

저장소 루트에서 실행합니다. 3000 기본 시연은 3008의 실제 AI·계정 통합 실행과 별도 모드입니다.

```sh
npm run setup
npm run start:demo   # http://127.0.0.1:3000 · 고정 데이터 기본 시연
```

```sh
npm test            # 백엔드·시연 서버·모바일 클라이언트 회귀 검사
```

실제 NaviHelper 시험용 `realDebug` 빌드와 release 재빌드는 [차량 앱 안내](vehicle-app/README.md)를 따릅니다. 제출 APK를 체험할 때는 release 서명 키나 재빌드가 필요하지 않습니다.

</details>

[백엔드 설정](backend/README.md) · [모바일 웹 안내](mobile-web/README.md) · [차량 빌드·설치](vehicle-app/README.md)

## 테스트 환경 및 필요한 설정

| 항목 | 검증 환경 |
| --- | --- |
| Pleos Connect 에뮬레이터 | **ARM 2.1.0 / Android API 34** |
| 전체 디스플레이 | **2560 × 1440px**, 밀도 **160dpi** |
| 3분할 앱 영역 | **841 × 1210dp** |
| 2분할 앱 영역 | **1682 × 1210dp** |
| Android 빌드 | JDK **21**, compile SDK **35**, Build Tools **35.0.0** |
| 웹·서버 | Node.js **22.22.2** |

제출용 오프라인 APK는 서버·계정·API 키 없이 실행합니다. 실제 AI를 사용하는 모바일·차량 통합 모드는 `backend/.env`의 `OPENAI_API_KEY`와 3008 서버가 필요하며, 차량의 API 주소는 `http://10.0.2.2:3008`입니다.

정차 상태에서 상세 화면과 시연 메뉴를 사용합니다. 실제 차량 UX 제한이 주행 상태이면 간편 화면으로 전환하며, 속도 0만으로 정차로 판단하지 않습니다.

## 기술 및 검증

| 영역 | 기술·검사 |
| --- | --- |
| 모바일 웹 | HTML · CSS · JavaScript, 반응형 UI |
| 백엔드 | Node.js · SQLite · OpenAI Responses API · JSON Schema · SSE |
| 차량 앱 | Kotlin · Jetpack Compose · Pleos Connect · NaviHelper |
| 자동 검증 | Node 회귀 테스트 · Kotlin/JVM · Android Lint · GitHub Actions |

[백엔드 테스트](backend/tests/) · [시연 서버 테스트](backend/demo/tests/) · [차량 단위 테스트](vehicle-app/app/src/test/) · [CI 설정](.github/workflows/)

### Pleos SDK 확장 계획 · 현재는 미구현

현재 서버 연동 모드의 모바일 AI는 OpenAI를 사용하고, 서버 음성 합성은 ElevenLabs 선택 옵션입니다. 차량에 적용할 플랫폼 기능은 다음과 같이 검토하고 있습니다.

| 영역 | 검토할 연동 | 적용 범위·조건 |
| --- | --- | --- |
| 차량 음성 출력 | [Pleos TextToSpeech SDK](https://document.pleos.ai/en/api-reference/connect-sdk-pleos/TextToSpeech/intro) | 차량 내 ElevenLabs 음성 출력 경로를 전환하는 후보. 음색·한국어 품질·재생 중단 정책은 별도 검증 필요 |
| 차량 음성 입력 | [Pleos SpeechToText SDK](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/SpeechToText/intro) | 현재 미구현인 마이크 음성 입력을 텍스트로 변환하는 확장 |
| 차량 음성 명령 | [Gleo Interface](https://document.pleos.ai/docs/pleos-only/app-integration-guide/guide/core-concepts) | 여행 조회 등 앱 기능을 Gleo가 호출하도록 App Schema·Action·Callback 연동 검토 |

Pleos TTS/STT의 서버·하이브리드 모드는 앱 등록이 필요하며, 온디바이스 모드와 제공 조건이 다릅니다. 위 연동은 **현재 APK·소스에 구현된 기능이 아니므로 외부 API 키를 생략하는 실행 방법으로 사용할 수 없습니다.**

OpenAI가 맡는 모바일 자유 대화·취향 정리·여행 계획 생성을 Gleo가 동일하게 대체하는지는 별도 검증 대상입니다. 현재 공식 [릴리스 노트](https://document.pleos.ai/en/docs/pleos-only/release-note/playground-release-note)는 LLM SDK 중단 및 Gleo Interface 사용을 안내합니다.

저장소·패키지의 내부 식별자 `wayMate` / `waymate`는 유지합니다.
