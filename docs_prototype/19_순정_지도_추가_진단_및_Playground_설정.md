# 순정 지도 추가 진단·Playground 설정

2026-11-12. [17번](17_3분할_검수_및_순정_지도_진단.md)·[18번](18_확장_창_및_글자_확대_검수.md)의 후속이다. **도로 배경은 미해결이다. 별도 새 AVD에서 wayMate 설치·사용자 프로젝트 키 입력 없이도 같은 누락이 재현됐다.** 현재 증거는 기존 wayMate 저장 데이터나 사용자 프로젝트 키 누락을 원인으로 지목하지 않는다. 지도 데이터 내용·동적 합성·GPU·위치 품질 중 정확한 원인은 확정하지 않았다.

## 새 AVD 비교

기존 `emulator-5554`를 재시작하거나 초기화하지 않고 별도 `WayMate_Native_Map_Probe` / `emulator-5556`을 만들었다. 공식 설치 이미지·42dot `Pleos_Connect_v2_0` 프로필, RAM 4GB, 2560×1440px·160dpi, cold boot, host GLES·Vulkan 비활성을 사용했다. 기존 AVD의 userdata를 복사하지 않았다. wayMate·테스트 APK를 설치하거나 Playground 프로젝트 키·CRN·Client ID/Secret을 입력하지 않았다.

첫 실행은 차량 정보 확인 화면에 머물렀다. 로그에서 초기화 완료를 확인한 뒤 **임시 AVD의 순정 내비 프로세스만 재시작**해 지도 화면에 진입했다. 이 과정을 생략한 최초 부팅 성공으로 설명하지 않는다.

- 순정 내비 `3.3.2-rc5-hotfix.3`, 자체 `CCG` 인증 성공, `AuthComplete / NaviEngineComplete / MapComplete`, 지도 스타일 로드·static image tile provider 시작을 확인했다.
- 현재 위치 표식·한국 지역명·지도 터치에 따른 주소 조회는 표시되지만 도로 배경은 없다. 사용자 목적지 설정·경로 안내 요청은 하지 않았다.
- 새 AVD의 `MapView`와 `TextureView`는 각각 **1682×1210**으로 생성됐다. 기존 3분할 내비의 두 뷰도 **841×1210**이다. 지도 뷰 크기가 0이거나 wayMate가 덮어서 비는 현상으로 재현되지 않는다.
- 두 AVD의 UTC는 호스트와 일치한다. 새 AVD의 최초 표시 시간대가 LA였던 것은 UTC 오차와 구분했다.
- 새 AVD에서도 GL `0x501` 및 스타일 레이어 누락 경고가 동반됐다. 경고와 증상의 동시 관찰이며, 단독 원인 확정은 아니다.

[새 AVD 원본](evidence/native-map-fresh-avd-2026-11-12.png), [기존 3분할 원본](evidence/native-map-followup-three-pane-2026-11-12.png), [진단 JSON·해시](evidence/native-map-followup-2026-11-12.json)에 범위를 기록했다. 비교용 AVD는 정상 종료했고 기존 AVD만 실행 중이다. 기존 실제 앱 SDK journal 11개 기록은 전후 바이트가 동일하다.

## 인증·지도 요청에서 확인한 점

기존 내비의 현재 로그에서 지도 타일 호스트 `a.tile.static.maps-stage.umos.ai`의 요청 9개에 대해 **401 수신 → 내비 자체 인증 갱신 성공 → 재요청 304**가 기록됐다. 사용자 앱의 키를 수동 대입하거나 내비 인증값을 추출해 HTTP 요청에 재사용하지 않았다.

이 기록은 지속적인 사용자 프로젝트 키 미입력 오류와 구분해야 한다. 다만 **304는 캐시 재사용 응답이므로 지도 데이터가 정상·비어 있지 않음·디코딩/합성 성공을 증명하지 않는다.** 과거 로그의 충전 사업자 조회 API 401도 지도 타일 인증 실패로 바꿔 해석하지 않는다.

순정 로그에 나타난 공개 coral `connect_empty` 스타일은 인증 없이 200이며, `coastline` 소스와 background/fill/slot 레이어로 구성됐다. stage의 같은 경로를 인증 없이 조회하면 401이었다. 다른 환경의 응답을 서로 대체하지 않는다. 최소 스타일이라는 사실만으로 설정 오류를 단정할 수 없으며, 순정 앱의 추가 지도 합성 구조 확인이 필요하다.

후속 [20번](20_지도_스타일_분기_및_배포본_확인.md)에서 공식 factory APK의 `coral` 환경이 이 URL을 직접 선택하는 분기를 확인했다. 공개 수정본 목록·일반 설정·자동 GPS 갱신 비활성 비교도 추가했으며, 도로 표시를 위한 공식 전환 설정 또는 수정본을 제공사 확인 대상으로 좁혔다. 지도 복구는 아직 미완료다.

기존 AVD의 인터넷 validated·내비 INTERNET/정밀 위치 권한 부여, 별도 전역 HTTP 프록시 미설정을 확인했다. 공개 서버 루트에 대한 호스트 DNS/TLS 도달 확인은 **게스트의 실제 인증된 지도 요청 성공 증거를 대신하지 않는다.**

## GPS 시험의 한계 보완

기존 시험 좌표에서 체크섬을 계산한 GGA/RMC/GSA를 12초간 입력했다. 별도 GGA 명령에 대해 에뮬레이터 console의 `OK` 수락도 확인했다. 그러나 내비 로그에는 이후에도 `*47` 체크섬의 GGA/RMC 오류가 계속 남았고 도로 배경은 복구되지 않았다.

따라서 **유효한 문장을 console에 입력한 것과 순정 parser가 그 문장을 정상 소비한 것은 같은 검증이 아니다.** 17번의 유효 NMEA 입력 결과로 GPS/NMEA 의존성을 완전히 배제하지 않는다. 올바른 입력의 end-to-end 수신, 위치 품질과 지도 표시의 관계는 추가 확인 대상이다. 별도 root/시스템 APK 수정·NMEA 검증 우회는 하지 않았다.

## Playground에서 필요한 항목

아래는 2026-11-12 [공식 프로젝트·SDK 사용 안내](https://document.pleos.ai/docs/pleos-only/create-my-project)를 기준으로 한다. 같은 날 사용자가 개인 프로젝트의 **NaviHelper와 Vehicle State 모두 ‘사용 가능’**이라고 확인했다. 사용자 보고에 따른 확인이며 로그인 화면을 도구로 직접 조회한 결과는 아니다. 현재 두 SDK의 추가 사용 신청이나 지도 복구용 사용자 키 전달을 요구할 근거는 없다.

| 항목 | 현재 필요한 조치 | 지도 누락과의 관계 |
|---|---|---|
| 프로젝트 생성 | 사용자가 생성 완료한 프로젝트 사용 | 순정 지도 복구를 위한 새 프로젝트 생성 요구 없음 |
| SDK → NaviHelper | 사용자 확인: 사용 가능. 추가 신청 불필요 | 앱 경로/경유지 API 접근 범위 |
| SDK → Vehicle State | 사용자 확인: 사용 가능. 추가 신청 불필요 | 차량 상태 조회 범위 |
| CRN | Emulator 2.1.0 이후 입력 불필요 | 현재 버전에서 추가 등록을 요청하지 않음 |
| 프로젝트 ID(Key) | 앱 심사 제출 시 사용 | 현재 순정 내비 창의 지도 키로 대입하는 설정이 아님 |
| Client ID / Secret | 서버 연결형 SDK의 앱 등록에 사용. 현재 지도 진단에는 요청하지 않음 | 순정 내비의 자체 인증과 구분 |
| 서버 TTS/STT | 실제 프로젝트의 SDK 제공·사용 상태 및 등록 절차를 음성 연동 시 확인 | 지도 진단과 별도 후속 |
| ON_DEVICE TTS | [공식 안내](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/intro)상 서버 앱 등록 불필요. 실제 엔진 동작은 별도 검증 | 지도 복구 조건이 아님 |

현재 앱은 `com.waymate.app.real`에서 `NAVI_ROUTE`와 `NAVI_ROUTE_SEARCH`를 사용하고 별도 순정 내비 창을 함께 띄운다. [권한 안내](https://document.pleos.ai/en/api-reference/connect-sdk-pleos/NaviHelper/declaring-permissions)의 `NAVI_CUSTOM_MAP`은 `requestNavigationScreen()`용이다. 현재 순정 창의 배경 문제를 이유로 이 권한이나 별도 외부 지도 SDK 키를 추가하는 근거는 없다.

서버 TTS를 선택할 때에는 [registerApp 안내](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/app-registration)에 따라 Client ID/Secret을 사용한다. Secret은 채팅·커밋·진단 첨부에 넣지 않는다. 현재 지도 진단을 위해 사용자에게 추가로 요청할 프로젝트 정보는 없다. 사용 가능 상태만으로 순정 내비의 모든 타일·렌더링 기능이 정상임을 증명하거나 지도 원인을 확정하지는 않는다.

## 제공사 확인용 재현 내용

외부 문의는 아직 발송하지 않았다. 아래 내용을 선별 캡처·JSON과 함께 문의할 수 있다. 원문 로그에는 인증값이 포함될 수 있어 첨부하지 않는다.

> Apple M3 Pro/18GB, Emulator 37.2.13, 공식 Pleos 2.1.0/API34 ARM64 이미지, 순정 내비 3.3.2-rc5-hotfix.3에서 도로 배경이 표시되지 않습니다. 기존 3분할뿐 아니라 wayMate 미설치·프로젝트 자격 증명 미입력의 별도 새 AVD에서도 재현됩니다. 내비 자체 CCG 인증·스타일 로드·MapComplete가 성공하고 위치 표식/지역명/주소 조회는 표시됩니다. MapView/TextureView는 정상 크기입니다. 일부 타일 요청은 401 뒤 자체 갱신·304 재응답을 기록합니다. GL 0x501·누락 레이어·NMEA 체크섬 오류가 함께 관찰됩니다.

확인할 질문:

1. 공개 ARM64 이미지에서 도로 배경 표시가 지원되는지, Apple Silicon에서 알려진 렌더링 문제가 있는지.
2. 이 순정 내비/이미지 조합에서 도로 레이어 합성에 필요한 공식 설정이나 수정 이미지·APK가 있는지.
3. `geo nmea` 수락 후에도 순정 parser가 `*47` 오류를 받는 경우 권장 GPS/NMEA 공급 방법이 무엇인지.
4. [FAQ의 지역 속성](https://document.pleos.ai/docs/pleos-only/vehicle-app-developer-guide/vehicle-app-faq) 등 추가 에뮬레이터 지역 설정이 필요한지. 현재 비어 있는 지역 속성을 임의 변경하지 않았다.

Mac용 ARM 이미지는 [공식 설치 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)에 제공된다. [GPU 요구사항](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/configure-pleos-connect-emulator)의 NVIDIA/AMD 목록만으로 M3 지원 여부를 확정하지 않는다. SDK 소스·AVD·시연 데이터는 그대로 보존하며 제공사의 지원 조건·수정본 또는 검증 가능한 설정에 따라 다음 비교를 진행한다.
