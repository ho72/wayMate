#!/usr/bin/env bash
set -euo pipefail

vehicle_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_path="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
adb="$sdk_path/platform-tools/adb"
serial="${ANDROID_SERIAL:-emulator-5554}"
mode="${1:-}"

case "$mode" in
  wide)
    test_class="ExpandedWindowReviewTest"
    expected_tests=2
    captures=(expanded-columns expanded-ending)
    ;;
  font)
    test_class="LargeFontWindowReviewTest"
    expected_tests=7
    captures=(font130-home font130-answer font130-final-review font130-own-ending font130-together-ending font130-navigation-review font130-reset-review)
    ;;
  *)
    printf '사용법: %s wide|font\nwide: 1682×1210dp 확장 창 / font: 841×1210dp 3분할 창을 먼저 준비하세요.\n' "$0" >&2
    exit 2
    ;;
esac

cd "$vehicle_dir"
export ANDROID_HOME="$sdk_path"
./gradlew :app:assembleMockDebug :app:assembleMockDebugAndroidTest

target_user="$("$adb" -s "$serial" shell am get-current-user | tr -d '\r')"
[[ "$target_user" =~ ^[0-9]+$ ]] || { printf '현재 Android 사용자를 확인하지 못했습니다.\n' >&2; exit 1; }
out_dir="$vehicle_dir/../backend/demo/runtime/window-review-$mode"
mkdir -p "$out_dir"
mock_apk="app/build/outputs/apk/mock/debug/app-mock-debug.apk"
test_apk="app/build/outputs/apk/androidTest/mock/debug/app-mock-debug-androidTest.apk"
"$adb" -s "$serial" install --user "$target_user" -r "$mock_apk"
"$adb" -s "$serial" install --user "$target_user" -r "$test_apk"

"$adb" -s "$serial" shell am instrument --user "$target_user" -w -r \
  -e class "com.waymate.app.ui.screens.handoff.$test_class" \
  com.waymate.app.mock.test/androidx.test.runner.AndroidJUnitRunner \
  | tr -d '\r' > "$out_dir/instrumentation.txt"

# am instrument can exit successfully even when a JUnit assertion fails.
if ! grep -Fqx "OK ($expected_tests tests)" "$out_dir/instrumentation.txt"; then
  cat "$out_dir/instrumentation.txt" >&2
  exit 1
fi

for capture in "${captures[@]}"; do
  for extension in json png; do
    "$adb" -s "$serial" exec-out run-as com.waymate.app.mock --user "$target_user" \
      cat "files/window-review/$capture.$extension" > "$out_dir/$capture.$extension"
  done
done
shasum -a 256 "$mock_apk" "$test_apk" > "$out_dir/apks.sha256"
printf '%s: %s개 통과 · 원본 화면/측정 결과: %s\n' "$mode" "$expected_tests" "$out_dir"
