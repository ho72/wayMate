# 두루밋 Pleos 오프라인 시연 APK

백엔드·계정 연결 없이 준비된 여행, 친구의 답장, 통화·만남·여행 선택 흐름을 살펴보는 별도 Android 앱이다. 기존 백엔드 연동 앱과 함께 설치할 수 있다.

- 패키지: `com.waymate.app.demo`
- 앱 이름: **두루밋 오프라인 시연**
- [GitHub APK 릴리스](https://github.com/ho72/wayMate/releases/tag/v0.1.0-offline-demo-20261115)
- [정차·주행 비교 캡처](prototype/evidence/offline-driving-2026-11-15/index.html)
- [실제 전환 검증 요약](prototype/evidence/offline-driving-2026-11-15/verification.json)

## 실행

Pleos Connect ARM 2.1.0 / API 34 에뮬레이터에서 설치하고 앱 목록의 **두루밋 오프라인 시연**을 연다. 3분할을 권장하며 2분할도 지원한다. 기기에 기존 `real`·`mock` 앱이 있어도 제거할 필요 없다.

```sh
adb install --user 10 -r durumit-pleos-offline-demo.apk
adb shell am start --user 10 -n com.waymate.app.demo/com.waymate.app.demo.OfflineDemoActivity
```

정차 상태에서 헤더의 **시연** 버튼을 누르면 38개 장면을 직접 열 수 있다. **다음 시연 장면**은 준비된 시나리오 순서로 이동한다. 일반 화면의 버튼으로 장소 찾기·답장 선택/확인·통화 종료·만남 제안·경로 확인·최종 선택도 진행할 수 있다. 이 시연 메뉴는 오프라인 APK 전용이고 주행 중에는 숨긴다.

여행·친구 응답·상대 동의·내비 반영은 로컬 시연 데이터다. 실제 상대에게 메시지나 통화를 보내거나 순정 내비를 바꾸지 않는다. 이 APK는 `INTERNET` 권한을 제거했으며 백엔드·유료 음성 API를 호출하지 않는다. 음성 출력은 APK에 포함한 준비 합성 음원과 기기 TTS를 사용한다. 새 안내 음원은 macOS Yuna로 생성했다.

## 실제 정차·주행 전환

미리보기의 주행 표시 토글이 아니라 실제 `CarUxRestrictionsManager`의 현재값·변경 콜백을 사용한다. 공유 정책의 확인된 제한 프로필에서는 주행 화면을 표시하며, 미확인·지원하지 않는 제한은 상태 확인 화면으로 처리한다.

| 보고 있던 화면 | 주행 중 표시 | 다시 정차하면 |
| --- | --- | --- |
| 홈·여행 준비·일정 | 다음 일정·복귀 시각 또는 준비 안내 | 원래 화면 |
| 친구 소개·취향·질문 | 같은 대화의 짧은 요약·답변 | 선택한 질문·대화 위치 유지 |
| 답장 확인·말 전하기 | 선택한 대화의 답장·후속 질문 또는 전송 대기 요약 | 같은 대화로 복귀, 자동 전송 없음 |
| 통화·MC | 제안 전·동의 대기·통화 중·종료 상태 | 같은 통화/MC 화면. 새 통화 자동 시작 없음 |
| 장소 질문·목록·상세 | 같은 종류의 추천 또는 선택한 장소 | 같은 목록/상세로 복귀 |
| 경로 승인 | 확인하던 장소·정차 후 재확인 안내 | 장소 상세로 돌아가 다시 승인 |
| 요청 중·성공·실패·미확인 | 해당 요청 상태 요약 | 기존 요청을 유지. 자동 재요청 없음 |
| 만남·첫 인사·최종 선택·기록 | 해당 단계의 요약 | 같은 단계로 복귀. 동의·최종 선택 자동 제출 없음 |

주행 화면은 비활성화 버튼을 나열하지 않는다. 스크롤·선택·입력·전송·경로 승인 대신 캐릭터와 짧은 카드로 표시하고, 준비된 안내를 한 번 재생한다. 통화 중에는 종료 조작을 제공한다. 주행 중 캐릭터와 음성 그래픽은 정적으로 표시하고, 정차 화면의 말하기 그래픽은 실제 재생 상태를 따라 움직인다.

**D 기어에서 속도 0이 되어도 플랫폼이 주행 제한을 유지하면 주행 화면을 유지한다.** 속도 0만 보고 정차로 바꾸지 않는다. 화면·오디오 포커스 이탈 시 음성을 중단하고 복귀만으로 다시 재생하지 않는다. 백엔드 연동 `real`·`mock` 앱에도 공통 맥락 화면을 적용하지만 음성 권한은 기존 서버의 유효 상태 확인을 따른다.

## 검증

최종 결과와 실행 환경은 [verification.json](prototype/evidence/offline-driving-2026-11-15/verification.json)에 기록한다. 실제 에뮬레이터 Console의 P/0 → D/36 → P/0과 D/0 신호를 사용하며, 규제 해제·강제 허용 목록·가짜 UX 콜백을 사용하지 않는다. 별도 AVD에서 실행해 기존 서버·공유 앱·내비 경로에 영향을 주지 않는다.

```sh
cd mock-app/vehicle
./gradlew :app:assembleDemoDebug :app:assembleDemoDebugAndroidTest :app:testDemoDebugUnitTest :app:lintDemoDebug
adb -s emulator-5556 install --user 10 -r app/build/outputs/apk/demo/debug/app-demo-debug.apk
adb -s emulator-5556 install --user 10 -r -t app/build/outputs/apk/androidTest/demo/debug/app-demo-debug-androidTest.apk
cd ..
python3 mock-app/vehicle/scripts/verify-offline-driving.py --serial emulator-5556 --output output/offline-driving-verification
```

위 검수 스크립트는 **검수 전용 AVD**에서만 실행한다. 실제 차량 신호를 제어하고 테스트를 위해 앱을 재시작한다. 종료 시 P·속도0으로 복구하고 자체 Console 세션을 닫는다. APK 자체는 이 Console 제어 도구를 포함하지 않는다.

## 검증 필요

- 실제 마이크·음성 인식(STT), 끼어들기·무응답·오인식·전송 전 음성 확인 및 취소. 현재는 마이크 권한을 요청하거나 실제로 듣는다고 표시하지 않는다. 음성 UI 미리보기의 듣기 상태는 마이크가 꺼진 시연임을 표시한다.
- 실제 상대와의 실시간 통화·메시지, 양쪽 동의, 서버 재연결 및 계정 전달. 오프라인 상대 응답은 준비된 데이터다.
- 실차·다른 지역의 제한 정책, 앱 심사 및 오디오 장치 동작. DO 선언과 에뮬레이터 검수가 심사 통과를 뜻하지 않는다.
- 실제 순정 내비 지도·GPS·경로 반영. 이 APK는 배경 지도를 추가하거나 실제 경로를 조작하지 않는다.

검수에 사용한 debug 서명 APK이며 스토어 배포용 서명·릴리스 빌드와 구분한다.
