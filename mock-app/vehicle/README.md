# wayMate Pleos 차량 앱

Kotlin·Jetpack Compose로 작성한 Android Automotive 앱입니다. 현재는 P01 ‘내 여행 불러오기’의 **첫 화면 미리보기**를 구현했습니다. `mockDebug` APK를 Pleos Connect 2.1.0 에뮬레이터에 설치해 화면 표시를 확인했습니다.

여행 불러오기 버튼은 비활성 상태입니다. 서버·여행 전달·차량 제한 확인·음성·실제 Pleos SDK는 아직 연결하지 않았고, 샘플 여행을 불러온 것처럼 성공을 표시하지 않습니다. 이 단계가 W04의 전체 완료나 실제 SDK 검증을 뜻하지는 않습니다.

## 확인한 개발 환경

| 항목 | 버전·설정 |
|---|---|
| 언어 / UI | Kotlin 2.1.20 / Jetpack Compose BOM 2025.04.01 |
| JDK | 21 |
| Gradle / Android Gradle Plugin | 8.11.1 / 8.9.2 |
| Android SDK | min 28 / compile 35 / target 34 |
| Android Build Tools | 35.0.0 |
| 에뮬레이터 | Pleos Connect 2.1.0, Android API 34, arm64-v8a |
| AVD | `Pleos_Connect_2_1_API_34`, 메모리 4GB, Cold boot |
| 앱 ID | `com.waymate.app.mock` |

컴파일 SDK와 에뮬레이터 OS 버전은 다를 수 있습니다. 의존성 버전은 `gradle/libs.versions.toml`과 lockfile에 고정했고, Gradle 배포 파일·Wrapper JAR의 공식 SHA-256을 확인했습니다. `gradle/gradle-daemon-jvm.properties`는 데몬이 JDK 21을 사용하도록 지정합니다.

## Android Studio에서 실행

1. **Open**에서 이 `vehicle/` 디렉터리를 선택합니다. 저장소 최상위나 `app/`만 선택하지 않습니다.
2. Gradle Sync를 완료합니다. JDK 21과 Android SDK Platform 35·Build Tools 35.0.0이 필요합니다. SDK 위치는 Android Studio가 만드는 `local.properties`로 관리합니다.
3. Build Variant에서 `mockDebug`, 실행 구성에서 `app`, 대상 기기에서 Pleos 에뮬레이터를 선택하고 **Run**을 누릅니다.

JDK 자동 탐지가 실패하면 Settings → Build, Execution, Deployment → Build Tools → Gradle에서 Gradle JDK를 설치된 JDK 21로 선택합니다. 개인 JDK·SDK 경로는 커밋하지 않습니다.

## 터미널에서 빌드·실행

저장소 루트에서 시작하는 macOS 예시입니다.

```sh
cd mock-app/vehicle
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew :app:assembleMockDebug :app:lintMockDebug
```

APK는 `app/build/outputs/apk/mock/debug/app-mock-debug.apk`에 생성됩니다. 에뮬레이터가 꺼져 있을 때만 별도 터미널에서 실행합니다.

```sh
./scripts/run-emulator.sh
```

기기 목록을 확인하고 앱을 설치·실행합니다. 다른 포트로 부팅한 경우 `emulator-5554` 대신 `adb devices`에 표시된 ID를 사용합니다. `adb`가 PATH에 없다면 Android SDK의 `platform-tools/adb`를 사용합니다.

```sh
adb devices
adb -s emulator-5554 install -r app/build/outputs/apk/mock/debug/app-mock-debug.apk
adb -s emulator-5554 shell am start -W -n com.waymate.app.mock/com.waymate.app.MainActivity
```

Apple Silicon에서 Vulkan 경로의 그래픽 오류를 확인해 실행 스크립트는 `-gpu host -feature -Vulkan`으로 GLES 하드웨어 가속을 사용합니다. 또한 Cold boot로 실행하고 통계·오류 보고 대화상자를 표시하지 않습니다. [Android 공식 문제 해결 안내](https://developer.android.com/studio/run/emulator-troubleshooting)

## 소스 구조

```text
app/src/
├── main/
│   ├── AndroidManifest.xml
│   ├── java/com/waymate/app/
│   │   ├── MainActivity.kt
│   │   ├── app/                # WayMateApp·향후 상태/route/의존성 조립
│   │   ├── ui/screens/handoff/ # P01 화면·HandoffUiState·사용자 의도 콜백
│   │   ├── ui/components/      # 공통 표시 컴포넌트
│   │   ├── ui/theme/           # 색·타이포·테마
│   │   ├── data/               # 전달 API·모델·저장 구현 예정
│   │   └── platform/           # 차량 제한·음성·내비 계약 구현 예정
│   └── res/                    # 문자열·앱 아이콘·시작 테마
├── mock/java/com/waymate/app/platform/
├── real/java/com/waymate/app/platform/
└── test/java/com/waymate/app/
```

현재 Gradle flavor는 `mock` 하나입니다. `real/` 디렉터리는 실제 SDK 연결을 위한 예약 경로이며 `assembleRealDebug`는 아직 제공하지 않습니다. 실제 SDK를 검증할 때 `real` flavor와 해당 의존성을 추가합니다.

협업 책임은 [06 개발 아키텍처·분담 가이드](../../docs/06_개발_아키텍처_및_분담_가이드.md)를 따릅니다. UI는 state·callback을 받고, `app/`·`data/`·`platform/`이 실제 전송과 플랫폼 실행을 담당합니다. 기능별 문자열은 `strings_handoff.xml`처럼 나눕니다. mock 빌드에서도 실제 주행 제한을 읽어야 하며 현재는 해당 기능이 구현 전이라 여행 불러오기를 열지 않습니다.

## 검증 기록

2026년 11월 11일 Apple Silicon 맥에서 다음을 확인했습니다.

- `:app:assembleMockDebug`: 성공.
- `:app:lintMockDebug`: 오류 0개·경고 11개. target API·의존성 버전 업데이트 안내와 백업 설정 관련 경고가 남아 있습니다.
- Android Studio 프로젝트 열기·Gradle Sync: 성공. `app` 실행 구성을 인식했습니다.
- Pleos 에뮬레이터: API 34 부팅, 앱 설치 성공, `MainActivity`의 cold launch 성공.
- 실제 에뮬레이터 화면: wayMate 로고·첫 인사·캐릭터·여행 준비 카드·미리보기 안내 표시 확인.
- 시스템의 `car_service`·VHAL 서비스 존재 확인. 앱에서 해당 서비스를 사용하거나 주행 제한을 읽는 기능은 아직 구현 전입니다.

실행 로그·스크린샷·환경 기록은 Git 추적에서 제외한 `../runtime/`에 보관합니다. 서버 연결·실제 SDK·다른 화면 크기의 기기 검수는 별도 단계입니다.

설정 기준: [Pleos 시작 안내](https://document.pleos.ai/docs/pleos-only/getting-started), [AGP 8.9 호환성](https://developer.android.com/build/releases/agp-8-9-0-release-notes), [Gradle 8.11.1 Java 호환성](https://docs.gradle.org/8.11.1/userguide/compatibility.html).
