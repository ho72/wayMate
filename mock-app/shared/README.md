# 공통 계약과 예제

이 디렉터리는 WEB·SERVER·CAR가 맞출 데이터 계약의 위치입니다. 현재 완성된 `schema.json`·`assets-manifest.json`·serializer는 없습니다. [04 연동 계약](../../docs/04_개발_및_연동_명세서.md)의 schemaVersion 2를 W01에서 코드화하고 검증합니다.

- `contracts/`: 산출물 목록·책임·변경 기준.
- `examples/`: 계약 검증과 화면 Preview에 쓸 역할별 예제. 서버 원본과 구분.
- `schema.json`·예정: 계약 schema의 진입점. 분리한 schema가 생기면 여기서 참조.
- `assets-manifest.json`·예정: 소재 ID·발화자·공개 조건·cue·변형 연결.

형식 변경은 SERVER가 모으고 실제 소비자가 함께 검토합니다. CONTENT는 대사·소재를 준비하고 SERVER가 공개 범위와 명세 일치를 확인합니다. 계약 문서 버전 0.5와 API schemaVersion 2는 서로 다릅니다.
