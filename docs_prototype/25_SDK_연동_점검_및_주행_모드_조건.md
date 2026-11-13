# SDK 연동 점검과 주행 모드 조건

후속: [26번](26_캐릭터_중심_주행_정차_모드.md)에서 DO와 주행 간편 화면을 구현한다. 아래 DO=false·정차 전용·34개 음원 관측은 변경 전 SDK 점검 기록이다.

2026-11-13. 사용자 요청에 따라 현재 wayMate의 SDK 연결·설치 설정·실제 기기 응답을 확인했다. 1차 기능 구현 완료와 모든 Pleos SDK의 연동 완료는 다른 범위다. 순정 지도 배경 복구는 계속 보류한다.

## 현재 연동 범위

| 기능 | 앱 연결 | 확인 결과 |
|---|---|---|
| NaviHelper 3.0.5 | 실제 real flavor 의존성, initialize/listener/release | 현재 순정 서비스 연결·응답 성공 |
| 목적지·경유지·경로 상태 | getDestinationInfo/getWaypointInfo/getRouteStateInfo | 이번 조회: 42dot, 경유지 0개, ROUTE_GUIDING, isRouting=false |
| 시험 POI 확인 | requestTrip | 기존 검증된 소프트웨어드림센터 POI와 좌표 응답 성공. 새 길 안내 시작이나 경로 변경 아님 |
| 경유지 추가·제거 | 차량 승인→서버 실행권→SDK addWaypoint/removeWaypoint→이중 관측→보고 | 23번 실제 applied/removed·O01 ACK 근거 보존. 이번에는 변경 호출하지 않음 |
| 주행 UX 제한 | AAOS android.car의 CarUxRestrictionsManager, production VehicleRestrictions | 실제 콜백 수신. 현재 known=true, restricted=false. 명시적 `stop()` 시 unknown 복귀 검증 |
| 준비 음원·오디오 포커스 | Android MediaPlayer/AudioManager | 23번 실제 재생·경쟁 포커스·창 전환 회귀. Pleos TextToSpeech SDK와 구분 |
| Android 기기 TTS | 준비 음원 없는 문장의 선택적 대체 경로 | 이번 기기: 초기화 -1(ERROR), 엔진 목록 비어 있음. 현재 기기 TTS 성공이라고 표시하지 않음 |
| Pleos Vehicle State | 미연결 | 프로젝트에서 사용 가능하다는 사용자 확인과 앱에서 구현된 API 호출은 구분. 배터리·문·기어·공조 등 일반 상태 조회 없음 |
| Pleos Vehicle Control | 미연결 | 캐릭터를 통한 도어·공조·시트 제어 없음 |
| Pleos STT/TTS·마이크·Gleo·FusedLocation | 미연결 | 실제 음성 인식/자유 대화/위치 SDK 기능 없음. 준비 음성을 실제 상대 통신·음성 SDK 응답으로 설명하지 않음 |

`pleos.car.permission.NAVI_ROUTE`와 `NAVI_ROUTE_SEARCH`는 설치된 real 앱에서 모두 granted다. 현재 사용하는 기능에 `NAVI_CUSTOM_MAP`을 추가할 근거는 없으며 순정 내비 도로 배경 표시와 권한 이름을 연결해 해석하지 않는다.

이번 읽기 전용 기기 검사 **4개 통과**: SDK 정보/POI 응답·production 제한 수신/해제·설치된 MainActivity DO 미선언·Android TTS 상태 기록. 마지막 검사는 TTS 성공을 요구하는 검사가 아니라 실제 지원 상태를 기록하는 검사다. 실제 내비 journal 16개와 SHA-256 `91fe2f73a6fc869ccd5906eaebbe55ecade5a974edbf29ba1f6dd3854cb3d231`은 전후 동일하다. [점검 요약](evidence/sdk-driving-audit-2026-11-13.json)을 참조한다.

제한 수신 검사의 해제 단계는 앱이 `VehicleRestrictions.stop()`을 호출하면 즉시 unknown이 되는 계약을 검사한다. 차량 서비스 연결을 실제로 끊어 `createCar`의 `ready=false` 콜백을 발생시킨 검증은 아니다. PR #8 리뷰에 따라 이 두 검증 범위를 구분했다.

## 주행 중 사용에는 무엇이 필요한가

**콘솔 설정 하나로 현재 앱을 주행 허용 모드로 바꾸는 구조가 아니다.** 다음 조건을 별개로 확인해야 한다.

1. **Activity의 DO 선언.** AAOS는 주행 UX 제한 중 Activity 실행 허용 여부를 manifest의 `distractionOptimized`로 판단한다. 현재 MainActivity는 이를 선언하지 않았으며 설치된 APK에서도 false다. [AAOS 공식 선언 방식](https://source.android.com/docs/automotive/driver_distraction/guidelines)
2. **실제 제한별 UI와 기능 처리.** DO가 있어도 Pleos가 내려주는 `requiresDistractionOptimization`·`activeRestrictions`에 맞게 키보드·목록·영상·설정 등을 제한해야 한다. DO는 모든 기능을 허용하는 권한이 아니다. [Pleos 주행 규제 개발 가이드](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide)
3. **서비스 카테고리·지역·배포 심사.** 어떤 기능이 주행 중 허용되는지는 서비스 목적·지역·현재 제한과 심사 범위를 함께 확인해야 한다. Playground/App Market 서비스 카테고리와 Android의 `android:appCategory`는 같은 설정이 아니다. wayMate의 실제 프로젝트 카테고리는 아직 확인 대기다. 내비 연동이나 음원 재생이 있다는 이유로 Maps/Navigation 또는 Music/Audio로 바꾸지 않는다. [앱 카테고리](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/app-category), [지역별 정책](https://document.pleos.ai/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy), [앱 심사 제출](https://document.pleos.ai/docs/pleos-only/distribute/app-submission-guide)
4. **주행 음성의 구현·지원 검증.** 입력 경로·마이크 권한·음성 서비스 가용성·포커스·가림·제한·명시적 재개를 검증한다. 현재 준비 음원 재생 검증이 STT/TTS 서비스·실시간 대화 지원 증거를 대신하지 않는다. [음성/서버 연결 SDK 안내](https://document.pleos.ai/docs/pleos-only/create-my-project), [오디오 포커스](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/audio-focus-development-guide/audio-focus-development)

향후 주행 전용 Activity에 사용할 AAOS 선언 예시는 다음과 같다. **이번 점검에서 앱에 적용한 설정이 아니다.**

```xml
<activity android:name=".DrivingActivity">
    <meta-data android:name="distractionOptimized" android:value="true" />
</activity>
```

이 선언은 플랫폼의 실행 판정용 자기 선언이며, 그 자체가 Pleos 앱 심사 승인이나 기능 안전성·지역별 허용을 증명하지 않는다. 현재 설치된 일반 MainActivity에 표식만 붙여 전체 화면을 주행 중 열어두는 변경은 하지 않았다.

## 현재 wayMate가 주행을 차단하는 곳

- Manifest: DO 메타데이터 없음. 시스템의 주행 Activity 차단 대상이다.
- 차량: `VehicleRestrictions`는 DO 요구 또는 baseline 외 activeRestrictions가 하나라도 있으면 restricted=true로 합친다. 정차 전용 구현에 맞춘 보수적 판단이며 주행 음성 허용 판단기는 아니다.
- 서버: fresh·restrictionKnown·foreground·restricted=false를 만족해야 차량 조작을 허용한다. UI만 풀어도 통화·만남·내비 승인·최종 선택을 주행 중 실행할 수 없다.
- 음성: 실제 제한 진입·pause·창/오디오 포커스 상실에 중단하고 자동 재개하지 않는다. 주행 중 시각적 캐릭터 움직임도 허용 기능으로 보장하지 않는다.
- `interactionMode=driving_voice`와 `voiceCapability`는 04번의 목표 계약이며 현재 구현된 활성 모드가 아니다.

이번 기기의 현재 UXR는 DO=false·activeRestrictions=0이다. 기기 서비스 설정에서 idling/moving은 DO=true·0x50(NO_VIDEO | NO_SETUP)로 구성돼 있다. 이는 **현재 에뮬레이터의 설정 조회**이며 실제 주행 전환 시험이나 한국 양산차 정책 검증이 아니다. CarPackageManager의 Activity 차단은 켜져 있고 wayMate에 대한 임시 허용 목록은 비어 있다. 지역 식별은 `android.car.drivingsafetyregion.all`이므로 언어가 한국어라는 이유로 한국 지역 정책을 검증했다고 쓰지 않는다.

## 개발 시험 설정과 사용자에게 필요한 항목

[공식 ADB 가이드](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/adb-command-reference-guide)는 `cmd hmg_car_service --service drivingstate driving_regulation on/off`를 디버깅용 주행 규제 제어로 설명한다. **off는 주행 가능한 앱을 구현·승인받는 방법이 아니다.** 이 ARM 이미지에서는 읽기 목적의 help 요청조차 `Can't find service: hmg_car_service`로 응답했다. 해당 명령을 이 기기에서 사용할 수 있다고 보장하지 않으며 on/off를 실행하지 않았다.

주행 상태 시험은 [Virtual Console](https://document.pleos.ai/docs/pleos-only/app-test-guide/virtual-console-guide)의 Motion/Gear Selection 등 지원 제어와 실제 UXR 콜백을 대조해 진행해야 한다. 기어만 D로 바꾼 결과를 실제 차속·주행 상태 전체 시험으로 확대하지 않는다. 실제 기어·속도·지역·시스템 주행 규제·allowlist는 이번 점검에서 변경하지 않았다.

현재 내비/제한 수신/준비 음원에는 추가 키를 받을 필요가 없다. 공식 프로젝트 안내상 NaviHelper·Vehicle State는 신청 없이 사용 가능하며, 서버 연결형 STT/TTS의 Client ID·Secret 요구와는 다르다. 공개 안내의 STT/TTS·FusedLocation·Vehicle Control은 준비 중으로 기재돼 있으므로 실제 콘솔 가용 상태와 대조해야 한다. 앞으로 주행 사용을 확정하려면 먼저 **wayMate 프로젝트의 실제 서비스 카테고리**와 주행 중 제공할 기능 범위를 확인해야 한다. 키·Secret을 문서·채팅·APK에 넣는 작업은 하지 않는다.

다음 구현 후보는 04번의 주행 전용 최소 모드다. 정적 작은 캐릭터·짧은 상태 표시·허용된 음성 문답/중단만 검토하고, 목록·키보드·새 메시지/통화·만남 동의·내비 승인·최종 선택은 정차 기능으로 유지한다. 카테고리/지역·입력 경로·음성 지원 검증 후 계약과 서버·차량을 함께 변경하는 후속 개발이며 이번 점검에서 활성화하지 않았다.

## 반복 점검

`SdkConnectionAuditTest`는 real flavor 전용이며 기존 실제 앱 설치·순정 목적지가 준비된 기기에서 사용한다. 코드에는 경유지 추가·제거, 기어 변경, 규제 해제 호출이 없다.

```sh
cd mock-app/vehicle
./gradlew :app:assembleRealDebugAndroidTest :app:lintRealDebug
adb -s emulator-5554 install --user 10 -r -t app/build/outputs/apk/androidTest/real/debug/app-real-debug-androidTest.apk
adb -s emulator-5554 shell am instrument --user 10 -w -e class com.waymate.app.platform.SdkConnectionAuditTest com.waymate.app.real.test/androidx.test.runner.AndroidJUnitRunner
```

기기 instrumentation은 대상 앱 프로세스를 다시 시작하므로 활성 통화·내비 실행 중에는 실행하지 않는다. 시작 전 pending/unknown이 없는지 확인하고 journal을 보존해 전후 해시를 대조한다. JSON 결과는 대상 앱의 `files/sdk-audit/`에 저장되며 Git에는 비밀값이나 전체 사용자 상태를 추가하지 않는다. CI는 real 기기 테스트 APK의 빌드까지 검사하며 실제 SDK 기기 실행을 대신하지 않는다.
