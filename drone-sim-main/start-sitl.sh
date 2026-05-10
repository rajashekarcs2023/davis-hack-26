#!/usr/bin/env bash
# CesiumSim MAVLink Bridge
# Streams drone position from browser to QGroundControl (UDP 14550).
#
# Usage: ./start-sitl.sh
# Stop:  Ctrl+C

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check deps
if ! python3 -c "import pymavlink, websockets" 2>/dev/null; then
  echo "Installing dependencies…"
  pip install pymavlink websockets
fi

echo "=== CesiumSim MAVLink Bridge ==="
echo "  MAVLink → UDP 14550 (QGroundControl)"
echo "  WebSocket ← ws://localhost:8089 (browser sim)"
echo ""
echo "  1. Open QGroundControl"
echo "  2. Run: npm run dev"
echo "  3. Fly — QGC mirrors your position in real time"
echo ""
echo "Press Ctrl+C to stop."
echo "================================"
echo ""

exec python3 "$SCRIPT_DIR/mavlink-bridge.py"
