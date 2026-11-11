# wayMate Pleos 차량 앱

Kotlin/Compose 차량 앱입니다. 현재 **v3 준비 불러오기/직접 시작 → 드래곤 홈·복원**을 지원합니다. 목표 P06/P07·콘텐츠·만남·두 결말은 후속입니다. [현재 실행·검증](../../docs/10_v3_여행_준비_차량_홈_및_내비_시험.md)을 참고하세요.

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
| `realDebug/.../platform/navigation` | 제품과 분리한 실제 NaviHelper 시험 |

Gradle `copyCharacter`가 공통 `assets/images/characters/blue-dragon-v1/reference.png`를 빌드 중 drawable-nodpi로 복사합니다. a-01=승인한 정적 드래곤, a-02=햇살 Canvas입니다. 실제 3D/동작/립싱크·음성은 없습니다.

## 실제 내비 시험

`real` flavor는 공식 Maven의 NaviHelper 3.0.5를 사용하고 의존성 lockfile을 유지합니다. 시험 Activity/권한은 `realDebug`에만 둡니다. 제품의 운전자 승인·서버 NAV_REPORT는 아직 연결하지 않았습니다.

```sh
adb -s emulator-5554 install -r app/build/outputs/apk/real/debug/app-real-debug.apk
adb -s emulator-5554 shell am start --user 10 -n com.waymate.app.real/com.waymate.app.platform.navigation.NaviProbeActivity
adb -s emulator-5554 shell run-as com.waymate.app.real --user 10 cat files/navi-probe.json
```

정차·제한 확인·새 관측·시험 경로 일치·기록 저장을 요구합니다. 물리 호출은 사용자가 누를 때만 한 번 수행하며 unknown/기존 경로/다른 M이면 잠급니다. 앱 재시작·영수증 복원으로 SDK를 재호출하지 않습니다. 앱 데이터 삭제로 시험 journal을 지우면 안 됩니다.

D는 좌표로 요청하고 M은 독립 조회로 위치를 먼저 확인한 POI ID를 사용해, 실제 추가·제거·D 유지·앱 재시작 무재호출을 확인했습니다. M 좌표 0,0 원문은 보존하고 현재 M ID와 SDK 위치 조회 근거를 대조합니다. **M POI 위치 확인 → 시험 D 설정(이미 D만 있으면 생략) → M 추가 → 필요 시 재시작/POI 재조회 → 내 M만 제거** 순서입니다. 정책·제약·실제 증거는 [11](../../docs/11_실제_내비_좌표_및_경유지_검증.md)을 참고하세요.

CI는 mock/real debug APK와 Lint를 검사합니다. 빌드 성공은 에뮬레이터·실제 SDK 추가/제거·실차·스토어 통과를 뜻하지 않습니다.
