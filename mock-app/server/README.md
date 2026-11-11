# 서버 · SERVER 담당

Node 표준 HTTP·파일 API와 Ajv로 v3 준비·전달·차량 활성화를 구현합니다. `../`에서 `npm start`를 실행합니다. [현재 계약·실행](../../docs/10_v3_여행_준비_차량_홈_및_내비_시험.md), [전체 목표](../../docs/04_개발_및_연동_명세서.md)를 구분합니다.

| 경로                          | 책임                                         |
| ----------------------------- | -------------------------------------------- |
| `main.mjs`, `http/server.mjs` | 로컬 바인딩·역할/view·정적 허용 목록         |
| `commands.mjs`                | 읽기/쓰기 단일 큐·버전·영수증·저장 조정      |
| `domain/handoff.mjs`          | 자유 답변·명시적 소개·core 전달·차량 활성화  |
| `state.mjs`, `validation.mjs` | 새 저장소·무결성·공통 v3 schema              |
| `store.mjs`                   | writer lock·temp fsync·rename·디렉터리 fsync |
| `projections/state.mjs`       | 원문을 web owner에만 제공·car 준비/복원      |
| `fixtures/trip.mjs`           | 고정 여행 원본, 정적 URL로 노출하지 않음     |

v3 상태·영수증은 `runtime/state-v3.json`에 함께 저장합니다. v2 파일은 자동 변환하지 않습니다. 중복 writer·손상 파일은 거절하며 교체 후 불확실은 503으로 쓰기를 중단합니다. 비정상 종료 뒤에는 해당 PID 종료를 확인한 후 lock을 따로 보존·정리해야 합니다. 파일을 지우는 초기화 API는 없습니다.

인증·다중 사용자·DB·외부 배포는 포함하지 않습니다. 역할 헤더는 로컬 시연용 식별이고 영수증은 자동 삭제하지 않습니다. 공개 승인/추천/내비 업무 명령은 아직 없습니다.
