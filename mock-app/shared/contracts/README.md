# JSON 계약

현재 진입점은 [`handoff-v2.schema.json`](handoff-v2.schema.json)입니다. `$defs/command`는 ONBOARDING_ANSWER·PROFILE_CONFIRM·PROFILE_PRIVATE·TRIP_SAVE·HANDOFF_PREPARE·CAR_SESSION_OPEN·CAR_STATUS·CAR_LOADED를 지원하며 target은 `{}`입니다.

프로필 요약은 확인한 질문 preset에서만 파생하고 `my_trip`은 `peer:null`을 강제합니다. 필수 필드·enum·추가 필드 금지는 JSON Schema, 역할 소유권·전이·참조 버전·현재 제한·별명 정규화는 서버 도메인에서 검증합니다.

`actionBindings`는 고정 대상/값(전달 준비·비공개·차량 ACK)을 채워 반환합니다. 질문·프로필처럼 사용자 선택이 필요한 명령의 payload는 빈 입력 틀이며 schema와 scenario의 지원 preset으로 완성합니다. 세션 열기·상태 사실 보고는 사용자 행동 목록과 별개입니다.

전체 연결·메시지·내비 명령은 아직 이 schema에 추가하지 않았습니다. 새 명령은 04 명세·역할별 예제·소비 코드·검증을 함께 변경합니다.
