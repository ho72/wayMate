# wayMate 협업 안내

기능 범위와 작업 순서는 [문서 목록](docs/README.md)과 [제작 일정·검수표](docs/05_제작_일정_업무_및_검수표.md)를 기준으로 합니다.

## 작업 흐름

1. GitHub 작업 이슈에 목적·변경 영역·완료 조건을 적습니다. 관련 W·DM·화면 ID가 있으면 함께 기록합니다.
2. 최신 `main`에서 작업 브랜치를 만듭니다. 예: `feat/W02-server-base`, `fix/handoff-ack`, `docs/demo-flow`, `chore/repository-structure`.
3. 한 가지 목적의 변경을 커밋하고 `main`을 대상으로 PR을 엽니다.
4. PR에 실제 확인한 내용과 남은 작업을 적고 검토 후 반영합니다.

커밋 제목은 `feat:`, `fix:`, `docs:`, `chore:`, `test:` 중 변경에 맞는 접두어를 사용합니다. 예: `feat: add handoff acknowledgement API`.

## 코드와 데이터 위치

- `mock-app/web/`: 모바일·시연자 화면. 서버의 원본 fixture를 직접 읽지 않습니다.
- `mock-app/server/`: 기준 상태·공개 데이터·명령 검증·전달 API.
- `mock-app/vehicle/`: 차량 화면·SDK Adapter. 공통 코드는 `main`, 모의 구현은 `mock`, 실제 SDK 구현은 `real`에 둡니다.
- `mock-app/shared/`: schema와 소재 manifest. 계약 변경 시 소비하는 웹·서버·차량과 관련 문서를 함께 확인합니다.
- `mock-app/assets/`: 원본 이미지·음성. 차량용 복사 자동화는 `scripts/`에 구현합니다.
- `mock-app/runtime/`: 개인 실행 상태·명령 영수증·SDK 시험 기록. Git에는 포함하지 않습니다.

## 확인 결과 기록

구현한 변경에 맞는 빌드·테스트·시연을 실행하고 결과를 PR에 적습니다. 구조·문서만 바꾼 경우에는 경로·링크·형식을 확인합니다. 실행 스크립트와 Gradle 구성이 생기기 전에는 빌드 성공을 기록하지 않습니다.

모의 동작, 실제 SDK 동작, 아직 확인하지 않은 동작을 구분합니다. 앱이 빌드됐다는 사실만으로 차량 API 연동이 완료됐다고 표시하지 않습니다. 실행 환경과 시험 결과는 해당 검수 기록에 남깁니다.

인증 정보는 로컬 환경 설정으로 관리하고 SDK 경로는 `local.properties`를 사용합니다. Gradle Wrapper와 의존성 lockfile은 실행 기반을 구현할 때 함께 커밋합니다.
