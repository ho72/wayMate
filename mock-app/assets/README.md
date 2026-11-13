# 시연 소재

[파란 드래곤](images/characters/blue-dragon-v1/README.md)은 채택된 렌더 외형이다. 차량에서 같은 이미지에 최소 대기/발화/중단 동작을 적용한다. 3D rig·정교한 립싱크는 제공하지 않는다.

[준비 음성 35개](audio/prepared-v1/README.md)를 차량 APK에 복사한다. 원본은 `audio/prepared-v1`이며 `shared/assets-manifest.json`이 자막·발화자·출처·공개 조건·표현을 연결한다. 실제 사람 통신이나 마이크 수집으로 표시하지 않는다. 공개 정보와 선행 cue의 사용 가능 여부는 서버 projection이 결정하고, 음원 파일이 존재한다는 이유로 비공개/미발생 대사를 재생하지 않는다.

`node scripts/generate-prepared-speech.mjs`는 macOS에서 음원·index·공통 manifest를 함께 갱신한다. Android 빌드의 copy 작업이 이미지와 준비 음성을 자동 포함한다. 재생 실패는 자막·중단으로 처리한다.
