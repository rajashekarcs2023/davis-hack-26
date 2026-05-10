#!/usr/bin/env bash
set -euo pipefail

ASSET_DIR="public/models/so101/assets"
BASE_URL="https://raw.githubusercontent.com/TheRobotStudio/SO-ARM100/main/Simulation/SO101/assets"

FILES=(
  "base_motor_holder_so101_v1.stl"
  "base_so101_v2.stl"
  "sts3215_03a_v1.stl"
  "waveshare_mounting_plate_so101_v2.stl"
  "motor_holder_so101_base_v1.stl"
  "rotation_pitch_so101_v1.stl"
  "upper_arm_so101_v1.stl"
  "under_arm_so101_v1.stl"
  "motor_holder_so101_wrist_v1.stl"
  "sts3215_03a_no_horn_v1.stl"
  "wrist_roll_pitch_so101_v2.stl"
  "wrist_roll_follower_so101_v1.stl"
  "moving_jaw_so101_v1.stl"
)

mkdir -p "$ASSET_DIR"

log() {
  printf '[so101-assets] %s\n' "$1"
}

download_with_retry() {
  local file="$1"
  local url="${BASE_URL}/${file}"
  local dest="${ASSET_DIR}/${file}"
  local tmp="${dest}.tmp"

  for attempt in 1 2; do
    if curl -fL --silent --show-error "$url" -o "$tmp" && [ -s "$tmp" ]; then
      mv "$tmp" "$dest"
      local size
      size=$(wc -c < "$dest")
      log "OK ${file} (${size} bytes)"
      return 0
    fi
    rm -f "$tmp"
    log "WARN attempt ${attempt} failed for ${file}"
  done

  log "ERROR failed to download ${file} after retry"
  return 1
}

log "Starting SO101 STL asset download"
failures=0
for file in "${FILES[@]}"; do
  if ! download_with_retry "$file"; then
    failures=$((failures + 1))
  fi
done

log "Verifying all files are present and non-empty"
for file in "${FILES[@]}"; do
  path="${ASSET_DIR}/${file}"
  if [ ! -s "$path" ]; then
    log "ERROR missing/empty ${path}"
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then
  log "Completed with ${failures} failure(s)"
  exit 1
fi

log "Completed successfully with ${#FILES[@]} STL files"
