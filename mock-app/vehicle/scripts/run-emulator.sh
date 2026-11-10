#!/usr/bin/env bash
set -euo pipefail

sdk_path="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
avd_name="${1:-Pleos_Connect_2_1_API_34}"

if [[ ! -x "$sdk_path/emulator/emulator" ]]; then
  printf 'Android Emulator를 찾을 수 없습니다. ANDROID_HOME을 설정해 주세요.\n' >&2
  exit 1
fi

# Apple Silicon host rendering can fail with Vulkan. Keep GLES acceleration.
# Cold boot is required for Pleos vehicle services.
exec "$sdk_path/emulator/emulator" \
  -avd "$avd_name" \
  -no-snapshot \
  -gpu host \
  -feature -Vulkan \
  -no-metrics \
  -crash-report-mode never
