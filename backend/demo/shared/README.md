# 시연 공통 계약·정책

현재 기본 시연 서버와 차량 전달은 **schemaVersion 4**를 사용합니다.

| 경로 | 역할 |
| --- | --- |
| [contracts/](contracts/) | 명령·조회 상태·전달본 JSON Schema |
| [examples/v4/](examples/v4/) | v4 상태·명령·전달 예제 |
| `config/` | 주행 정책·대화·통화·만남·결말의 공통 설정 |
| `assets-manifest.json` | 캐릭터·준비 음성·표시 ID와 파일 연결 |

v2·v3 계약과 예제는 기존 상태의 검증·회귀를 위해 보존합니다. 변경 시 서버·모바일·차량의 소비 경로와 테스트를 함께 확인합니다.
