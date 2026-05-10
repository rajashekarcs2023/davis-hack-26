# CesiumSim → QGroundControl Bridge

## Quick Start

```bash
# Terminal 1 — MAVLink bridge
./start-sitl.sh

# Terminal 2 — Browser sim
npm run dev
```

Open QGroundControl. Open `http://localhost:5173` or whatever port your dev server is running on. Fly. QGC mirrors your position in real time. This is as far as I got as of 02/28/26.

## What `start-sitl.sh` Does

Launches `mavlink-bridge.py` — a single Python script that:

1. Opens a **WebSocket server** on `ws://localhost:8089`
2. Opens a **MAVLink UDP output** to `127.0.0.1:14550` (QGC's default listen port)
3. Sends **HEARTBEAT** at 1 Hz so QGC registers a quadrotor vehicle
4. Sends **SYS_STATUS** at 1 Hz (battery, system health indicators)
5. When the browser connects, streams at **10 Hz**:
   - `GLOBAL_POSITION_INT` — lat, lon, alt MSL/AGL, NED velocity, heading
   - `ATTITUDE` — roll, pitch, yaw (drives the attitude indicator)
   - `VFR_HUD` — groundspeed, heading, altitude, throttle, climb rate
   - `GPS_RAW_INT` — 3D fix status, 14 satellites, position

No ArduPilot SITL, no EKF initialization, no arming sequence. The bridge emulates a MAVLink vehicle directly.

### Data Flow

```
Browser (Cesium FPV)
  ↓ WebSocket JSON @ 10 Hz (lat, lon, alt, velocity, heading, pitch, roll, speed, throttle)
  ↓ ws://localhost:8089
mavlink-bridge.py
  ↓ MAVLink UDP @ 10 Hz (GLOBAL_POSITION_INT, ATTITUDE, VFR_HUD, GPS_RAW_INT)
  ↓ udpout:127.0.0.1:14550
QGroundControl
```

### Dependencies

Auto-installed by the script if missing:

```
pip install pymavlink websockets
```

## QGroundControl Setup

### Default Config (Usually Works Out of the Box)

QGC listens on UDP 14550 by default. No configuration needed — just open QGC before or after running the bridge. The vehicle appears automatically.

### If the Vehicle Doesn't Appear

1. **Application Settings** (gear icon, top-left) → **Comm Links**
2. Verify there is a UDP link on port **14550** with **Auto Connect** enabled
3. If missing, click **Add** → set:
   - Name: `CesiumSim`
   - Type: **UDP**
   - Port: **14550**
   - Check **Automatically Connect on Start**
4. Click **OK** → **Connect**

### What You'll See in QGC

- **Map view**: Drone icon tracks your exact position and heading from the sim
- **Compass**: Rotates with your heading in real time
- **Attitude indicator**: Shows pitch and roll as you maneuver
- **Speed readout**: Displays groundspeed matching the sim
- **Altitude readout**: Shows MSL altitude
- **Throttle bar**: Reflects current throttle level
- **GPS indicator**: Shows 3D fix with 14 satellites (top status bar)
- **Vehicle status**: Armed, GUIDED mode, healthy

### Troubleshooting

| Symptom | Fix |
|---|---|
| No vehicle in QGC | Check `./start-sitl.sh` is running and shows `MAVLink → udpout:127.0.0.1:14550` |
| Vehicle appears but doesn't move | Open browser sim (`npm run dev`) — bridge needs WebSocket data |
| Position jumps/lags | Normal at 10 Hz update rate — QGC interpolates between updates |
| Bridge says "Waiting for browser" | Open `http://localhost:5173` in your browser |
