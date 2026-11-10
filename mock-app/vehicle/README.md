# wayMate Pleos 차량 앱

현재는 Android 소스 디렉터리만 준비한 상태입니다. Android Studio에서 열 수 있는 Gradle 프로젝트는 다음 구현 단계에서 추가합니다. `com.waymate.app`은 기본 소스 경로이며 최종 배포용 Application ID는 프로젝트 구성 시 확인합니다.

```text
app/src/
├── main/java/com/waymate/app/
│   ├── data/                   # 전달 API·모델·로컬 저장
│   ├── ui/                     # Compose 차량 화면·캐릭터·자막
│   └── platform/               # 차량 제한·음성·내비 Adapter 계약
├── mock/java/com/waymate/app/platform/
│                               # 실제 SDK 없이 빌드할 모의 구현
├── real/java/com/waymate/app/platform/
│                               # 실제 Pleos SDK 구현
└── test/java/com/waymate/app/    # JVM 단위 테스트
```

`main`의 화면은 공통 Adapter 계약을 사용하고, 실제 Pleos SDK 의존성은 `real` 구성에 추가합니다. Android Manifest·리소스·빌드 설정·Gradle Wrapper는 기본 앱을 생성할 때 추가하고 실제 빌드로 검증합니다. 빌드 목표는 `assembleMockDebug`와 `assembleRealDebug`이며, 현재 제공되는 명령은 아닙니다.

개발 기준은 Kotlin·Jetpack Compose, `minSdk 28` 이상, Pleos API 34 에뮬레이터입니다. JDK·AGP·Gradle·Kotlin 버전은 호환 조합으로 빌드한 뒤 고정합니다. SDK 경로와 키를 포함하는 로컬 설정은 Git에 커밋하지 않습니다.
