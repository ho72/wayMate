# 차량 데이터 · CAR-PLATFORM 담당

현재 API client·Repository·저장은 구현 전입니다. [04 계약](../../../../../../../../../../docs/04_개발_및_연동_명세서.md)의 공통 봉투·세션·조회·영수증·전달 ACK를 구현합니다.

- `api/`: HTTP와 JSON DTO·직렬화. 서버 schema의 필드·enum을 독자적으로 바꾸지 않습니다.
- `repository/`: DemoRepository가 회차·조회 수명주기·사용자 명령·영수증 확인을 조정합니다. 응답 유실을 새 명령 ID의 자동 재시도로 처리하지 않습니다.
- `local/`: deviceId·미확인 명령과 향후 SDK 실행 journal. 화면 표시 기록과 물리 실행 기록을 구분합니다.

화면은 이 패키지를 직접 호출하지 않습니다. 앱 조립·향후 ViewModel이 Repository 결과를 화면용 불변 상태로 바꿉니다. UI 이동을 서버의 업무 stage나 SDK 재실행 조건으로 사용하지 않습니다.
