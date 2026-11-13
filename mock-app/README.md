# wayMate 1차 시연본 실행

기준은 `docs_prototype`이다. 모바일 자연어 상담 → 본인 확인 소개·공개·여행 저장 → 추천·B 수락·모바일 최종 매칭 → 폰 닫기 → Pleos 차량 수신·콘텐츠/일반 통화·만남 동의·내비 승인 → 만남 재연·독립 최종 선택·두 결말 → 재시연/O01을 제공한다. [최신 검수 기록](../docs_prototype/23_1차_개발_완료_및_검수.md)을 먼저 확인한다.

## 서버와 모바일

Node **22.22.2** (`.nvmrc`)에서:

```sh
npm ci --ignore-scripts
npm start
```

모바일: <http://127.0.0.1:3000>, 시연자 O01: <http://127.0.0.1:3000/operator>. 차량은 `http://10.0.2.2:3000`으로 접속한다. 서버는 로컬에서만 동작하며 공개 서버·실제 휴대폰 연결을 제공하지 않는다. 키나 Secret 없이 준비된 데이터로 실행한다. 원문 상담은 서버/본인 모바일에만 저장하며 소개값은 별도 확인·선택·공개한다. 최종 매칭 권한은 모바일에 있다. B는 O01에서 시뮬레이션한다.

현재 상태는 `runtime/state-v4.json`에 보존한다. 기존 v2/v3 파일·브라우저 ID·pending·실제 SDK journal을 지우지 않는다. 새 전체 시연은 O01의 **처음부터 시작**으로 진행한다. 내비 정리와 필요한 동일 기기 ACK 전에는 새 회차가 열리지 않는다. 서버가 종료되었는데 lock이 남은 경우 PID가 실제로 없는지 확인하고, 상태와 lock을 백업한 뒤 lock만 별도 이름으로 보존한다. 실행 중인 서버의 lock은 건드리지 않는다.

## 차량

[차량 실행 안내](vehicle/README.md). Pleos ARM 2.1.0/API34에서 계기판 / 순정 내비 / wayMate의 3분할을 사용한다. 앱 한 창은 **841×1210dp**, 확장 시 **1682×1210dp**다. 순정 내비 도로 배경 누락은 별도 보류 사항이다.

```sh
cd vehicle
./gradlew :app:assembleMockDebug :app:assembleRealDebug
```

`mockDebug`(`com.waymate.app.mock`)는 별도 모의 경로를 표시하고 SDK를 호출하지 않는다. 차량 승인 뒤 O01에서 성공/실패/미확인을 정한다. 실패는 새 승인으로 재시도하고 미확인은 결과 해소 전 진행/초기화를 잠근다. 실제 내비 기록을 모의 결과로 바꾸지 않는다.

`realDebug`(`com.waymate.app.real`)는 NaviHelper 실제 호출과 조회·소유권 journal을 사용한다. 시험 경유지는 **소프트웨어드림센터**, 가상 이야기 장소는 **바다쉼표 카페**다. 원래 목적지 D를 유지하며 자기 경유지 M만 추가/제거한다. 실제 경로가 준비되지 않거나 상태가 미확인이면 승인을 잠근다. 앱 갱신은 `adb install -r`로 데이터를 보존한다.

다른 검수 서버를 쓰는 경우 `-PwaymateApiPort=3001`로 별도 APK를 빌드할 수 있다. 기본값은 3000이다. 서버의 별도 상태 파일은 `WAYMATE_STATE_FILE`로 지정한다. 예: `WAYMATE_PORT=3001 WAYMATE_STATE_FILE=runtime/rehearsal-v4.json npm start`. 같은 파일을 두 서버가 동시에 사용하면 안 된다.

## 콘텐츠와 음성

캐릭터는 채택한 렌더 이미지에 대기·실제 발화·중단 동작을 적용한다. 실시간 3D·정교한 립싱크가 아니다. 한국어 준비 합성 음성 35개를 APK에 포함하며 외부 음성 서비스가 필요 없다. 자막 출처·발화자를 유지한다. 준비 음원이 없는 문장은 사용 가능한 기기 TTS로만 읽고, 둘 다 없으면 자막/중단한다. Pleos의 플랫폼 TTS 엔진 사용 가능 여부와 준비 음성 실제 재생 검증은 구분한다.

포커스 상실·가림·제한에서는 중단하고 자동 재개하지 않는다. 3분할에서도 다른 창을 터치해 wayMate의 창 포커스가 사라지면 음성을 멈춘다. wayMate를 다시 터치한 뒤 현재 문장 듣기를 직접 선택해야 재생한다. 일반 통화는 양쪽 동의 뒤 사용자가 직접 시작하는 준비 샘플이다. 마이크·실시간 통신·MC는 제공하지 않는다. DO를 선언한 주행 간편 화면은 큰 정적 캐릭터·짧은 상태·준비 한마디/중단만 제공한다. 실제 UXR와 서버의 fresh 상태를 함께 확인하며, 상세 업무 조작과 후속 음성 문답/STT는 계속 차단한다. 자세한 범위는 docs_prototype 26번을 따른다. 후기·장식·게임·선택 이유 입력도 이번 기본 시연 범위에 포함하지 않는다.

## 검사와 인계

```sh
npm test
npm run examples
cd vehicle
./gradlew :app:testMockDebugUnitTest :app:lintMockDebug :app:lintRealDebug
```

테스트는 별도 임시 상태/포트를 사용한다. `examples`는 v3/v4 golden을 갱신하며 v2 역사 예제는 보존한다. 준비 음원 재생/포커스·통화/모의 승인 기기 검사는 `FirstPassReviewTest.kt`, 실제 창/수명주기 검사는 `WindowPlaybackLifecycleDeviceTest.kt`, 기존 확장/글자 확대 검사는 `verify-window-ui.sh`를 참고한다. 기기 검사는 물리 창 조건을 맞춰 실행하고 결과가 실패하면 성공으로 기록하지 않는다.

| 위치 | 역할 |
|---|---|
| `server/v4/` | 현재 상태·역할·전이·영수증·내비/통화·O01 |
| `shared/contracts/`, `shared/examples/v4/` | v4 공통 JSON 계약·예제 |
| `web/` | 모바일 대화 준비와 O01 |
| `vehicle/app/src/main/` | 차량 화면·Repository·제한·음성 |
| `vehicle/app/src/real/`, `src/mock/` | 실제 SDK / 별도 모의 어댑터 |
| `assets/`, `shared/assets-manifest.json` | 이미지·준비 음성·자막·출처 |
| `runtime/` | 개인 상태·검수 증거·인계 묶음, Git 제외 |

이전 v3는 `npm run start:v3`로 별도 실행한다. 새 개발은 v4 경로를 사용한다. 실차·사용자 가설 V·앱마켓 심사·실시간 상대 통신을 프로토타입 기능 검수 Q와 합산하지 않는다.
