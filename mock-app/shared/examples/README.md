# 역할별 계약 예제

아직 예제 JSON은 없습니다. W01에서 확정한 schema와 함께 web/car/operator용 정상·오류·공개 제외·my_trip·connected 예제를 준비합니다. 예제에는 역할·현재 회차·공개 범위를 구분하고 검증 가능한 고정 가상 데이터를 사용합니다.

전체 인물·일정·미발생 메시지가 있는 `server/fixtures/` 원본을 복사해 client 예제로 쓰지 않습니다. WEB·CAR-UI는 이 예제를 Preview·fake transport에 사용할 수 있지만, 실제 명령 적용·차량 ACK·SDK 성공과 구분합니다. API 계약 검증은 `tests/contracts/`에서 실제 schema를 대상으로 구현합니다.
