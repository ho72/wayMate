# 공유 wire JSON 예제

`mock-app/`에서 `npm run examples`로 재생성합니다. `scripts/update-contract-examples.mjs`가 실제 서버 command coordinator를 호출하며 UUID 관계는 유지한 채 값만 고정합니다. 실행 중인 시연 파일은 사용하지 않습니다.

`index.json`에 파일과 JSON Schema `$defs` 이름이 있습니다. 명령·web 전달 대기/수신 확인·car 준비·최신 my_trip 전달본·저장 영수증을 제공합니다. `npm test`가 모든 등록 예제를 검증합니다. 예제는 UI Preview와 계약 확인용이며 서버 연결 실패 때 성공 상태로 대신 표시하지 않습니다.
