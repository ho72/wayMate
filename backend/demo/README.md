# Demo backend · 기본 시연 서버

키 없이 준비된 데이터로 여행·연결·만남·두 결말을 재현하는 서버입니다. 실제 계정·AI 서버는 상위 [backend/](../README.md)에 있습니다.

| 경로 | 역할 |
| --- | --- |
| `server/` | v4 상태·명령·내비·선택·시연 API |
| `shared/` | 전달 스키마·예제·주행 정책·문구 |
| `assets/` | 모바일·차량에서 함께 사용하는 캐릭터와 준비 음성 |
| `scripts/` | 시나리오 준비·소재 생성·시연본 패키징 |
| `tests/` | 상태·API·계약·클라이언트 검증 |

저장소 루트에서 `npm run start:demo`로 실행합니다. 모바일은 `http://127.0.0.1:3000`, 진행자는 `/operator`입니다. 정적 화면은 [mobile-web/demo/](../../mobile-web/demo/)에서 제공합니다.

처음부터 재시연할 때는 진행자의 초기화·차량 정리·ACK 절차를 완료합니다. 실행 중인 상태 파일을 삭제하지 않습니다.

[API 서버](server/README.md) · [공통 계약](shared/README.md) · [검사](tests/README.md)
