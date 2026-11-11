# 공유 wire JSON 예제

현재 예제는 [v3/index.json](v3/index.json)입니다. `mock-app/`에서 `npm run examples`로 `v3/`만 재생성합니다. coordinator가 실제 명령을 실행하고 UUID 관계·시각을 고정하며 실행 중인 시연 파일은 사용하지 않습니다. `npm test`가 등록 예제를 검증합니다.

이 디렉터리 루트의 JSON과 `index.json`은 보존한 v2 기록입니다. 예제는 UI Preview·계약 검토용이며 서버 장애 때 성공 화면으로 대체하는 데이터가 아닙니다. 차량 직접 시작·복원은 HTTP 통합 테스트에서 별도로 검증합니다.
