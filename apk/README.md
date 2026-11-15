# 제출용 release APK

| 항목 | 내용 |
| --- | --- |
| 팀명 | **말할카말카** |
| 앱 이름 | **두루밋** |
| 제출 파일 | [말할카말카_두루밋_release.apk](말할카말카_두루밋_release.apk) |
| 저장소 내 경로 | `apk/말할카말카_두루밋_release.apk` |
| 빌드 변형 | **demoRelease** |
| 패키지 | `com.waymate.app.demo` |
| 버전 | `0.1.0-offline-demo` / versionCode `1` |
| Debuggable | **false** |
| 서명 | 전용 release 키, RSA 3072 / APK Signature Scheme v2 검증 통과 |
| 파일 크기 | 27,664,392바이트 · 약 26.38MiB |
| SHA-256 | `54bf2a212d1ab9405dae5b5f63733be92299a24292860f7e93a1d97c4eeacc80` |

## 설치·실행

**Pleos Connect ARM 2.1.0 / Android API 34** 에뮬레이터를 사용합니다. 전체 화면은 **2560×1440px / 160dpi**, 앱 영역은 **3분할 841×1210dp · 2분할 1682×1210dp**입니다.

저장소 루트에서:

```sh
adb devices
adb shell am get-current-user
adb install apk/말할카말카_두루밋_release.apk
```

설치한 Pleos 사용자 프로필에서 **두루밋 오프라인 시연**을 엽니다. 정차 상태에서 상단 **시연** 메뉴를 열어 준비된 장면을 선택하거나 일반 화면의 버튼으로 진행합니다.

서버·계정·인터넷·API 키가 필요하지 않습니다. 여행·친구 답장·통화 샘플·만남·경유지 승인·두 결말은 로컬 시연 데이터이며 실제 마이크 입력·상대 통신·순정 내비 변경을 실행하지 않습니다. 차량 UX 제한의 현재값·콜백에 따라 정차·주행 화면을 전환합니다.

기존 `com.waymate.app.demo` debug APK와는 서명이 다릅니다. 기존 앱을 덮어쓰지 않도록 새 에뮬레이터에서 설치하세요.

## 검증

- 실제 release APK의 전용 서명 검증 통과, `debuggable=false` 확인.
- 새 Pleos ARM 2.1.0 / API 34 환경에서 설치·콜드 실행·시연 메뉴·상대 소개 진입 성공.
- 실제 차량 신호 **P/0 → D/36km/h → P/0**에서 주행 제한과 같은 소개 화면 복귀 확인.
- Release 단위 테스트 **66개 통과**, 실패 0.
- Release Lint **Error/Fatal 0**, Warning 40.
- 기존 `demoDebug` 빌드 성공.

이는 에뮬레이터와 오프라인 시연에 대한 검증이며 실차·스토어 심사·실시간 통화나 실제 내비 실행을 뜻하지 않습니다.

## 무결성 확인·재빌드

```sh
cd apk
shasum -a 256 -c SHA256SUMS.txt
```

[Release 서명 설정과 빌드 방법](../vehicle-app/README.md#제출용-release-빌드)을 따릅니다. 서명 키와 실제 비밀번호는 로컬에만 보관하고 소스 저장소에는 포함하지 않습니다.

서명 인증서 SHA-256: `bda2ff11172e48cf053714c1ed895f55007bf112d554e4929eb12cebb3d98368`
