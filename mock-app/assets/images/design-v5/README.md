# 두루·루밋 캐릭터 이미지

| 파일 | 캐릭터 | 용도 |
|---|---|---|
| [dragon.png](dragon.png) | 두루 · a-01 | 기존 파란 용, 표시 이름 변경 |
| [rumit.png](rumit.png) | 루밋 · a-02 / b-01 | 긴 귀·크림색 새 여행 친구 |
| [bear.png](bear.png) | 루밋 | 기존 웹 URL의 호환 파일, rumit.png와 동일한 바이트 |
| [bear-legacy.png](bear-legacy.png) | 모카 · a-03 | 기존 곰의 별도 선택·호환 자산 |

루밋은 ‘백엔드’ 채팅에서 내장 ImageGen으로 만든 [원본](long-ear-companion-v1.png)을 수정 없이 채택했다. [생성 기록](rumit-generation.json), [원본 프롬프트](long-ear-companion-v1-generation.json). 두루·루밋의 ID/경로/SHA256은 `shared/assets-manifest.json`에 기록한다.

Android는 rumit.png를 기존 travel_bear drawable에 복사한다. a-02/b-01/bear 같은 내부 식별자는 호환성을 위해 유지하며 사용자에게는 루밋으로 표시한다. 실제 여행자 별명은 캐릭터 이름과 별개다. 전체 레이아웃은 Fit으로 귀와 발을 자르지 않는다. 말하기/듣기 주변 그래픽은 별도 UI이며 3D 리깅·입모양이나 실제 수음 분석을 의미하지 않는다.
