# 이미지·음성 원본 · CONTENT 담당

`images/`·`audio/`는 웹과 차량이 함께 쓸 소재 원본 위치입니다. [파란 아기 드래곤](images/characters/blue-dragon-v1/README.md)을 캐릭터 외형 기준으로 채택해 정적 시안을 보관했습니다. 실제 3D 모델·동작/음성 소재와 동기화 스크립트는 준비되지 않았습니다. 기존 차량 화면의 Compose 캐릭터는 기본 화면용 그림이며 채택 시안의 앱 적용은 후속 구현입니다.

02번의 문장 ID·발화자·표현·공개 조건·선행 cue·fallback을 함께 확인합니다. A의 변경 가능한 별명은 자막의 저장값으로 표시하고 고정 녹음으로 덮지 않습니다. 방문 캐릭터 소개와 상대 사용자 메시지·통화 샘플의 출처를 구분합니다.

CONTENT가 파일·자막을 준비하고 SERVER가 manifest 형식과 공개 조건을 맞춥니다. W01에서 `shared/assets-manifest.json`을 확정한 뒤 WEB·CAR가 같은 assetId를 사용합니다. 차량용 복사는 향후 `scripts/sync-assets.mjs`로 자동화하고 각 담당자가 따로 복사한 파일을 원본으로 삼지 않습니다.
