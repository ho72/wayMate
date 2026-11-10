# wayMate 앱 개발 디렉터리

현재는 디렉터리와 Node 패키지 메타정보만 준비한 상태입니다. `main.mjs`·웹 화면·공통 JSON·Android Gradle 프로젝트·실행 스크립트는 구현 전입니다. 상세 파일명과 API는 [개발 및 연동 명세서](../docs/04_개발_및_연동_명세서.md)를 따릅니다.

| 디렉터리 | 구현할 내용 |
|---|---|
| `server/` | HTTP 서버, 상태 전환, 명령 검증, 공개 데이터 projection, 파일 저장 |
| `server/fixtures/` | 강릉 시연 원본과 준비된 응답. 웹에 직접 제공하지 않는 데이터 |
| `web/` | 모바일 M01~M04와 시연자 O01의 HTML·CSS·JavaScript |
| `web/views/` | 화면별 렌더링·상호작용 |
| `vehicle/` | Kotlin·Jetpack Compose 차량 앱. [소스 위치 안내](vehicle/README.md) |
| `shared/` | `schema.json`·`assets-manifest.json` 등 공통 계약 |
| `assets/images/`, `assets/audio/` | 공통 캐릭터·장면 이미지와 준비 음성 원본 |
| `scripts/` | 공통 소재를 차량 assets로 복사하는 동기화 등 개발 도구 |
| `tests/` | 서버 상태 전환·projection·명령·API 검증 |
| `runtime/` | 로컬 상태·영수증·SDK 실행 근거·환경 확인 기록. `.gitkeep` 외 Git 추적 제외 |

## 다음 구현 순서

1. Node `22.22.2` 환경에서 전달 서버 실행 기반과 `/health`를 구현합니다.
2. `vehicle/`에 Android Gradle 프로젝트를 만들고 `mock` 앱 빌드를 확인합니다.
3. 서버와 차량 앱 사이에서 변경한 값 한 건을 전달하고 ACK를 확인합니다.
4. 실제 SDK는 별도 시험으로 동작을 확인한 뒤 `real` 구성에 연결합니다.

Node 버전 관리에 nvm을 사용한다면 이 디렉터리에서 `nvm install`과 `nvm use`로 `.nvmrc`의 버전을 선택합니다. nvm 자체는 이 저장소에 포함하지 않습니다. `npm start`·`npm test`·`npm run sync-assets`는 해당 구현을 추가한 뒤 제공합니다.

웹은 로컬 서버의 `http://127.0.0.1:3000`, Android Emulator의 개발 서버 주소는 `http://10.0.2.2:3000`을 사용할 예정입니다. 현재 이 주소에서 실행되는 서버는 제공하지 않습니다.
