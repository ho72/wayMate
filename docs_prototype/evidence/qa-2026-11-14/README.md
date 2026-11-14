# 선별 QA 증거 · 2026-11-14

실행 기준은 `901a3250b6e3b3a367c59b3bcf5ace753a2930f9`의 기본 대본 시연·mock 앱이다. 최신 AI 선택 확장을 포함한 전체 검증으로 합산하지 않는다. 보고서는 [28 QA 인계](../../28_QA_시연_검증_및_수정_인계.md)를 확인한다.

- `latest-main-check.json`: 게시 기준 b84ebec의 원인 코드 비교와 APP-01/03 격리 재현. 최신 전체 회귀를 재실행한 결과는 아니다.
- `validation-summary.json`: 실행한 자동·기기 검사와 실제 취소 결함. 실행/기기 식별자는 제외했다.
- `audit-repro.json`, `reproduce-audit.mjs`: APP-01의 세 실패 경로/정상 대조와 APP-03의 공개 조건별 Q2. 스크립트는 격리 임시 coordinator에서 결과를 stdout으로 관찰하며 assertion 기반 회귀검사 자체는 아니다. 라이브 HTTP 서버·차량·공유 증거 파일을 수정하지 않는다.
- `cancel-*.png`, `cancellation-findings.json`: 실제 차량 취소 전후와 홈의 연결 잔류.
- `meeting-line-*.png/.txt`: 다음 대사 선택 전후. 스크롤/시각 차이와 별개로 표시 텍스트 27개가 동일했다.
- `mobile-sun-ax.txt`: 동일 UI 트리의 고정 드래곤 이미지 이름과 선택한 햇살 친구. 별명·음식·취향은 QA가 입력한 허구 데이터다. 하단 전달 카드만 보이는 캡처를 외형 문제의 단독 근거로 사용하지 않았다.
- `three-pane-*.png`, `full-e2e-portrait-result.json`: 오른쪽 841×1210dp production 앱의 두 결말. 모바일 준비는 정상 web API fixture이고 최초 모바일 UI는 별도 브라우저 검수다.
- `expanded-*.png`, `full-e2e-expanded-result.json`, `mobile-handoff-ready.jpg`: 최초 실제 브라우저 준비 후 모바일 종료→확장 창 차량 전체 흐름.
- `ScenarioE2ETest.kt`: 검수 시 사용한 임시 고정 기기 테스트 소스의 보관본. 일반 빌드의 sourceSet에 포함하지 않는다.
- 검사 로그는 저장소의 로그 제외 규칙에 맞춰 선별한 `.txt` 파일로 보관한다. 당시 검사 결과와 경고·실패는 유지했다. 기기 캡처/사전 조건을 보완한 초기 하네스 시도는 `harness-attempts.json`에 분리했다. 취소 검사의 expected ended / actual linked 실패는 실제 결함이다.
- `planning-findings.json`: Google Docs 링크·절과 저장소 근거를 연결한 기획 정합성 요약. 원문 전체·개인 신청 정보는 포함하지 않는다.

독립 재현은 Node 22.22.2와 `mock-app`의 잠금 파일 기준 의존성을 준비한 뒤 저장소 루트에서 실행한다.

```sh
node docs_prototype/evidence/qa-2026-11-14/reproduce-audit.mjs
```

원본 상태·SDK journal·API 세션 로그·인증값·전체 Google Docs 원문은 포함하지 않았다. `SHA256SUMS`는 선별 증거의 파일 무결성 확인용이며 테스트 통과 자체를 대신하지 않는다.
