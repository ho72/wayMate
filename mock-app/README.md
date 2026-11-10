# wayMate 앱 실행

본인 여행(`my_trip`)의 **웹 저장 → 서버 파일 저장 → 차량 HTTP 불러오기 → 차량 ACK → 웹 수신 확인**을 구현했습니다. 첫 연결 범위와 JSON 정의는 [07 실행·계약 안내](../docs/07_첫_전달_실행_및_계약.md)를 참고하세요. 전체 팀 5명의 개발 참여·담당은 미정이며 [06 분담 가이드](../docs/06_개발_아키텍처_및_분담_가이드.md)를 유지합니다.

## 웹·서버 실행

이 디렉터리에서 Node.js **22.22.2**를 사용합니다. nvm 사용자는 `nvm install`·`nvm use`로 `.nvmrc`를 적용합니다.

```sh
npm ci --ignore-scripts
npm start
```

[내 여행 준비 화면](http://127.0.0.1:3000)을 열어 별명·친구·말투·취향을 선택하고 **프로필과 여행 저장 → 차량에 전달 준비**를 누릅니다. 여행은 명세의 강릉 고정 시연 계획입니다. 첫 저장 브라우저의 로컬 클라이언트 ID를 유지하세요.

서버는 `127.0.0.1:3000`에만 바인딩합니다. 차량은 Android Emulator의 `http://10.0.2.2:3000`을 사용합니다. 실제 휴대폰·다른 컴퓨터에서 접속하는 공개 서버는 제공하지 않습니다.

## 차량 실행

[차량 빌드·설치 안내](vehicle/README.md)대로 `mockDebug`를 실행합니다. 서버·웹 준비 후 **내 여행 불러오기**를 누르면 저장한 프로필과 여행 계획이 표시되고, 웹의 차량 수신 확인이 바뀝니다. 정차·차량 제한 확인·활성 화면·최신 서버 허용이 필요합니다.

## 검증과 공유 예제

```sh
npm test
npm run examples
```

`npm test`는 저장소와 포트가 격리된 실제 HTTP 테스트 및 공통 JSON 예제를 검증합니다. 실행 중인 시연 데이터는 바꾸지 않습니다. `npm run examples`는 [공유 예제](shared/examples/)를 재생성합니다. schema와 예제를 함께 검토하세요.

| 경로 | 책임 |
|---|---|
| `shared/contracts/`, `shared/examples/` | schemaVersion 2의 첫 전달 계약·역할별 실제 응답 예제 |
| `server/http/` | HTTP·역할 헤더·본문 제한·정적 제공 허용 목록 |
| `server/commands.mjs`, `server/store.mjs` | 단일 큐·버전·중복 영수증·원자적 파일 저장 |
| `server/domain/`, `server/projections/` | 상태 계산·조건 검증·역할별 표시 |
| `web/`, `web/shared/` | 내 여행 준비 화면·HTTP·미확인 명령 복구 |
| `vehicle/` | Compose UI·Repository·실제 차량 제한 확인 |
| `tests/` | 계약·HTTP 통합·동시성·저장 실패·웹 응답 유실 검증 |
| `runtime/` | 로컬 상태·영수증·실행 증거. Git 추적 제외 |

연결 상대·AI 대화·음성·내비 SDK·시연자 O01·업무 초기화는 구현 전입니다. 이번 결과는 W01~W05 전체 완료를 의미하지 않습니다.
