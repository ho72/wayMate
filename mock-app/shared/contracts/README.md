# JSON 계약

현재 진입점은 [handoff-v3.schema.json](handoff-v3.schema.json)입니다. `$defs/command`는 ONBOARDING_ANSWER·PROFILE_CONFIRM·PROFILE_PRIVATE·TRIP_SAVE·HANDOFF_PREPARE·CAR_SESSION_OPEN·CAR_STATUS·CAR_LOADED·CAR_START_TRIP을 지원합니다. target은 `{}`이며 문서 전체의 나머지 명령은 아직 없습니다.

원문은 `onboarding[questionId]`에 보존하고 car projection에서는 빈 객체로 강제합니다. 프로필은 사용자가 확인한 `confirmedSummary`만 저장하며 미확인은 빈 배열/null입니다. `prepared_trip`은 profile/trip core 버전만 참조하고 `peer:null`입니다. publicationVersion·tripShareVersion·vehicleActivation은 별도 상태입니다.

형식·필수값·enum·추가 필드는 JSON Schema, 소유권·순서·참조 버전·최신 제한·활성화 잠금·별명 정규화는 도메인에서 검증합니다. `actionBindings`의 직접 시작값을 사용할 때 사용자가 실제로 확인한 버전을 유지해야 합니다. 새로 읽은 준비로 확인 대상을 바꾸면 안 됩니다.

[handoff-v2.schema.json](handoff-v2.schema.json)은 과거 예제 검증에만 사용합니다. 현재 서버/차량에서 v2 명령·저장소를 거절합니다.
