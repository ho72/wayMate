# wayMate Pleos 차량 앱

Kotlin/Compose 차량 앱입니다. 현재 **v4 connected/my_trip 불러오기·드래곤 홈·복원·만남 동의·실제 내비 승인**을 지원합니다. [13 실행·변경 기록](../../docs_prototype/13_v4_화면_전환_및_연동.md)을 따릅니다. P02 공개 문답·말 전달과 [P03 만남 재연·P04 독립 선택/두 결말](../../docs_prototype/16_만남_재연_및_P04_두_결말.md), O01 안전한 초기화를 지원합니다. 실제 낭독·통화 샘플은 후속입니다. [현재 실행·검증](../../docs_prototype/10_v3_여행_준비_차량_홈_및_내비_시험.md)을 참고하세요.

## Android Studio

1. 이 `vehicle/` 폴더를 엽니다. JDK 21·Android SDK Platform 35·Build Tools 35.0.0을 사용합니다.
2. Gradle Sync 후 `mockDebug`, 실행 구성 `app`, Pleos API34 에뮬레이터를 선택합니다.
3. `mock-app/`의 서버와 웹 준비를 시작하고 Run을 누릅니다.

SDK 경로는 `local.properties`, JDK는 Gradle JDK 설정으로 관리합니다. 개인 경로는 커밋하지 않습니다.

## 터미널

이 `vehicle/` 폴더에서 실행합니다.

```sh
./gradlew :app:assembleMockDebug :app:assembleRealDebug :app:lintMockDebug :app:lintRealDebug :app:testMockDebugUnitTest
```

에뮬레이터가 꺼져 있을 때만 별도 터미널에서 `./scripts/run-emulator.sh`를 실행합니다. Apple Silicon 그래픽 호환을 위해 GLES·Vulkan 비활성·Cold boot를 적용했습니다. Android SDK `platform-tools`를 PATH에 넣고 실행합니다.

```sh
adb devices
adb shell am get-current-user
adb -s emulator-5554 install -r app/build/outputs/apk/mock/debug/app-mock-debug.apk
adb -s emulator-5554 shell am start --user 10 -n com.waymate.app.mock/com.waymate.app.MainActivity
```

현재 Pleos 사용자는 10입니다. 기기/사용자가 다르면 실제 값으로 바꿉니다. 차량 API는 `http://10.0.2.2:3000`이며 debug HTTP 허용도 이 주소로 제한합니다. `uses-library android.car`는 이미지 부팅 클래스 경로에서 제공되므로 optional로 선언합니다.

- 웹 전달본은 CAR_LOADED 성공 뒤 홈으로 이동합니다.
- 직접 시작은 확인 화면에 표시한 core 버전으로 CAR_START_TRIP을 보냅니다. 기본값은 준비가 전혀 없을 때만 별도 확인합니다.
- 실제 CarUxRestrictions·활성 화면·서버 허용을 함께 확인합니다. 앱 재시작은 같은 deviceId로 세션을 열고 최신 제한을 보고해 홈을 복원하며 새 ACK/시작을 만들지 않습니다.

## 코드·소재

| 경로 | 책임 |
|---|---|
| `main/.../app`, `MainActivity` | Repository→화면 상태 조립·수명주기 |
| `main/.../data/api`, `repository` | v3 JSON·HTTP·단일 요청·명령 영수증·복원 |
| `main/.../model` | 순수 Journey 표시 데이터·확인한 core 버전 |
| `main/.../ui/screens/handoff`, `ui/components`, `ui/theme` | 시작/홈·캐릭터·색/타이포, SDK 직접 호출 없음 |
| `main/res/values/strings_home.xml` | 시작·홈 문구 |
| `main/.../platform/navigation` | 순수 내비 검증 정책·POI/원문 좌표 분리·Kotlin 테스트 |
| `main/.../platform/restrictions` | 실제 차량 제한 현재값·리스너 |
| `real/.../platform/navigation` | 실제 SDK·AtomicFile 실행 기록·이중 관측 |
| `mock/.../platform/navigation` | SDK 없이 변경 차단 |
| `realDebug/.../platform/navigation` | 이전 시험 코드 보존·Activity 비활성 |

Gradle `copyCharacter`가 공통 `assets/images/characters/blue-dragon-v1/reference.png`를 빌드 중 drawable-nodpi로 복사합니다. a-01=승인한 정적 드래곤, a-02=햇살 Canvas입니다. 실제 3D/동작/립싱크·음성은 없습니다.

## 실제 내비 승인

`real` flavor는 공식 NaviHelper 3.0.5로 본인 여행 또는 현재 만남의 양쪽 동의 이후 승인한 시연 경유지 추가·제거를 지원합니다. [12 차량 앱 내비 승인 연동](../../docs_prototype/12_차량_앱_내비_승인_연동.md)에 서버 계약·실행권·기록·복구 제한을 정리했습니다.

```sh
adb -s emulator-5554 install -r app/build/outputs/apk/real/debug/app-real-debug.apk
adb -s emulator-5554 shell am start --user 10 -n com.waymate.app.real/com.waymate.app.MainActivity
adb -s emulator-5554 shell run-as com.waymate.app.real --user 10 cat files/navigation-journal-v1.json
```

순정 내비에서 목적지를 설정한 뒤 차량 홈 → 내비 경유지 → 추가/제거 승인으로 진행합니다. 소프트웨어드림센터 고정 장소만 지원하며 원래 목적지는 유지합니다. SDK 원문 0,0은 보존하고 독립 POI 조회·현재 ID·연속 관측을 대조합니다. 기존 시험 Activity는 병렬 변경을 막기 위해 비활성화했으며 당시 코드·journal·[11 검증 기록](../../docs_prototype/11_실제_내비_좌표_및_경유지_검증.md)은 보존합니다. 앱 데이터나 실행 기록을 삭제해서 잠금을 우회하지 마세요.

mock/real 앱은 서로 다른 기기 ID입니다. `mock-app`에서 `WAYMATE_STATE_FILE=runtime/state-driver-navigation.json npm start`로 별도 상태를 사용하면 기존 mock 여행을 그대로 보존하고 real 앱의 여행을 시작할 수 있습니다.

CI는 mock/real APK·Lint와 단위 테스트를 검사합니다. 실제 에뮬레이터 증거는 12 문서에 링크합니다. 실차·스토어·주행 중 전환 검증은 별도입니다.

확장 창·3분할 130% 글자 회귀는 `./scripts/verify-window-ui.sh wide|font`로 실행합니다. 먼저 실제 Pleos 창 크기를 준비해야 합니다. mockDebug 전용 오프라인 Activity를 사용하며 SDK를 호출하지 않습니다. [18 검수 범위·재현 방법](../../docs_prototype/18_확장_창_및_글자_확대_검수.md)을 참고하세요. CI는 기기 테스트 APK를 빌드하며 Pleos UI 테스트 실행을 대신하지 않습니다.

모바일의 연결·공통 시간 확인 후 connected 전달을 준비하고 차량에서 불러오세요. 차량에는 신규 후보·매칭 버튼이 없습니다. 홈 → 만남 제안 받기 → 같은 제안의 B 수락(O01) → 내비 승인으로 진행합니다. 만남 취소 뒤 추가한 경유지는 별도로 제거 승인합니다.
