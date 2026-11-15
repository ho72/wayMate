# Vehicle app · Pleos 차량 목업 앱

Kotlin·Jetpack Compose로 구현한 차량 앱입니다. Android Studio에서 이 폴더를 엽니다.

| 빌드 | 용도 |
| --- | --- |
| `mockDebug` | 서버에 연결하는 시연, 모의 내비 |
| `realDebug` | 실제 NaviHelper 연동 시험 |
| `demoDebug` | 서버 없이 준비된 화면·주행 상태를 확인하는 오프라인 시연 |

## 준비 환경

JDK 21 · Android SDK 35 · Build Tools 35.0.0 · Pleos Connect API 34 에뮬레이터.

캐릭터·준비 음성·주행 정책은 `../backend/demo/`에서, 디자인 토큰은 `../shared/`에서 읽습니다.

## 빌드

저장소 루트에서:

```sh
cd vehicle-app
./gradlew :app:assembleMockDebug :app:assembleRealDebug \
  -PwaymateApiPort=3008 -PwaymatePersonalApiPort=3008
./gradlew :app:assembleDemoDebug
```

APK는 `app/build/outputs/apk/<mock|real|demo>/debug/`에 생성됩니다. 통합 백엔드는 루트의 `npm start`로 실행하며 에뮬레이터 API 주소는 `http://10.0.2.2:3008`입니다. 기본 시연 서버 3000을 사용한다면 빌드 포트도 3000으로 맞춥니다.

## 오프라인 시연

[APK 다운로드](https://github.com/ho72/wayMate/releases/tag/v0.1.0-offline-demo-20261115)

`demoDebug`는 서버·계정 없이 준비된 여행·친구 답장·통화 샘플·만남·두 결말을 재현합니다. 실제 마이크/STT·상대 통신·순정 내비 변경은 포함하지 않습니다. 실제 차량 UX 제한에 따라 정차·주행 화면을 전환합니다.

```sh
adb devices
adb shell am get-current-user
adb install -r app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

설치한 Pleos 사용자 프로필에서 **두루밋 오프라인 시연**을 엽니다. 기존 Mock·Real 앱과 패키지가 달라 함께 설치할 수 있습니다.

## 테스트·Lint

이 폴더에서:

```sh
./gradlew :app:testMockDebugUnitTest :app:testDemoDebugUnitTest \
  :app:lintMockDebug :app:lintRealDebug :app:lintDemoDebug
```

단위 검사·빌드와 실제 기기 검수는 별개입니다. `realDebug`의 내비 변경에는 운전자 승인과 확인된 실행 조건이 필요합니다.

[백엔드 설정](../backend/README.md) · [주요 UI](../README.md#주요-화면)
