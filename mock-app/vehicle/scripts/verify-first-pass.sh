#!/usr/bin/env bash
set -euo pipefail
vehicle_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$vehicle_dir/.."
npm test
cd "$vehicle_dir"
./gradlew :app:assembleMockDebug :app:assembleRealDebug :app:assembleMockDebugAndroidTest :app:testMockDebugUnitTest :app:lintMockDebug :app:lintRealDebug
if [[ "${1:-}" == "device" ]]; then
  adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
  serial="${ANDROID_SERIAL:-emulator-5554}"
  user_id="$("$adb" -s "$serial" shell am get-current-user | tr -d '\r')"
  [[ "$user_id" =~ ^[0-9]+$ ]]
  "$adb" -s "$serial" install --user "$user_id" -r app/build/outputs/apk/mock/debug/app-mock-debug.apk
  "$adb" -s "$serial" install --user "$user_id" -r -t app/build/outputs/apk/androidTest/mock/debug/app-mock-debug-androidTest.apk
  out_dir="$vehicle_dir/../runtime/first-pass"
  mkdir -p "$out_dir"
  "$adb" -s "$serial" shell am instrument --user "$user_id" -w -e class com.waymate.app.ui.screens.handoff.PreparedSpeechDeviceTest,com.waymate.app.ui.screens.handoff.FirstPassWindowTest,com.waymate.app.ui.screens.handoff.WindowPlaybackLifecycleDeviceTest com.waymate.app.mock.test/androidx.test.runner.AndroidJUnitRunner | tr -d '\r' > "$out_dir/device-tests.log"
  if ! grep -Fqx 'OK (7 tests)' "$out_dir/device-tests.log"; then cat "$out_dir/device-tests.log"; exit 1; fi
fi
