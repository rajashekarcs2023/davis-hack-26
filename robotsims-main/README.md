# RobotSim

Browser-based robot simulation dashboard for hackathon workflows where a Python script (e.g., VLM/VLA policy) commands robot actions and consumes live simulator state + wrist-camera frames.

RobotSim includes:
- A **Three.js + URDF** web simulator with two robots (`SO101` and `LeKiwi`)
- A local **bridge service** (`api-bridge.py`) exposing simple HTTP endpoints to external scripts
- Real-time action forwarding, telemetry updates, and SSE image streaming

Docs for participants:
- `HACKATHON.md` for quick API usage
- `UNDERSTANDING_GUIDE.md` for architecture, action-token concepts, and extension points

---

## What This Repo Does

This repository is designed to make "AI policy -> robot action -> visual feedback" loops fast and easy to prototype:

1. Browser simulator renders robots/environments and receives actions over WebSocket.
2. Python bridge exposes a hacker-friendly HTTP API (`/action`, `/state`, `/frames`).
3. External scripts can post actions and read robot state + wrist camera frames.

The simulator is **kinematic only** (no physics engine, no collision resolution, no gravity).

---

## Key Features

- **Two robot profiles**
  - `SO101`: 6-DOF arm
  - `LeKiwi`: holonomic mobile base + arm
- **URDF-based rendering** using `urdf-loader`
- **Action token vocabulary** for policy-friendly control
- **Live HUD telemetry**
  - joint angles (degrees)
  - last action + magnitude
  - task status
  - object count
  - bridge connection status
- **Wrist camera pipeline**
  - rendered from a dedicated `WebGLRenderTarget` (256x256)
  - streamed as base64 JPEG over SSE
- **Environment presets**
  - forest, mars, warehouse, lab
- **Spawnable objects**
  - cube, sphere, cylinder

---

## Architecture

```text
External Python script / policy
    |
    | HTTP (localhost:8767)
    v
api-bridge.py
  - POST /action
  - GET  /state
  - GET  /frames (SSE)
    |
    | WebSocket (localhost:8765)
    v
Browser simulator (Vite app)
  - Executes actions
  - Broadcasts state
  - Streams wrist-cam frames
```

---

## Tech Stack

- Frontend: `Vite`, `TypeScript`, `three`, `urdf-loader`
- Bridge: Python 3 stdlib + `websockets`
- Assets: URDF/STL models and environment textures in `public/`

---

## Project Layout

```text
src/
  robots/
    so101.ts
    lekiwi.ts
  simulator/
    scene.ts
    robot-viewer.ts
    external-api.ts
    environment.ts
    object-spawner.ts
    hud.ts
    simulator-app.ts
api-bridge.py
HACKATHON.md
public/
  models/
  environments/
```

---

## Prerequisites

- Node.js 18+ (or newer LTS)
- npm
- Python 3.10+ (recommended)

Install Python dependency:

```bash
pip install websockets
```

---

## Setup and Start

Install JavaScript dependencies:

```bash
npm install
```

Run the simulator frontend:

```bash
npm run dev
```

In another terminal, run the bridge:

```bash
python3 api-bridge.py
```

Open:

- Frontend UI: [http://localhost:5173](http://localhost:5173)
- Bridge API base: [http://localhost:8767](http://localhost:8767)

---

## API Quick Reference

### `POST /action`

Forward an action token + magnitude to the active robot.

```json
{ "action": "rotate_cw", "magnitude": 0.5 }
```

- `magnitude` range is typically `0.0` to `1.0`
- movement duration is derived from magnitude (about 2 seconds at `1.0`)

### `GET /state`

Returns latest simulator state:

```json
{
  "type": "state",
  "robot": "so101",
  "joints": { "Rotation": 0.0 },
  "base_pose": null,
  "task_status": "idle",
  "objects": [],
  "timestamp": 0
}
```

### `GET /frames` (SSE)

Streams wrist camera frames as `data:<base64-jpeg>`.

Optional:
- `GET /frames?fps=5`
- server caps frame streaming to max 10 FPS

---

## Action Tokens

### SO101

`rotate_cw`, `rotate_ccw`, `shoulder_up`, `shoulder_down`, `elbow_up`, `elbow_down`, `wrist_up`, `wrist_down`, `wrist_roll_cw`, `wrist_roll_ccw`, `grip`, `release`, `reset`

### LeKiwi

All SO101 arm actions plus:
`drive_forward`, `drive_backward`, `strafe_left`, `strafe_right`, `rotate_left`, `rotate_right`

---

## Developer Notes

- `src/simulator/simulator-app.ts` is the main orchestrator and best entry point.
- `src/simulator/robot-viewer.ts` handles URDF loading, joint drives, and wrist-cam rendering.
- `src/simulator/external-api.ts` contains browser-side WS behavior (reconnect + streaming controls).
- `api-bridge.py` handles browser disconnect/reconnect and keeps state/frame serving alive for clients.
- `HACKATHON.md` contains quick API usage for participants.

---

## Useful Commands

```bash
npm run dev       # start frontend in dev mode
npm run build     # type-check and production build
npm run preview   # preview production build
python3 api-bridge.py
```

---

## Troubleshooting

- **No bridge connection in UI**
  - ensure `python3 api-bridge.py` is running
  - verify port `8765` / `8767` is not already in use
- **`/frames` returns no data**
  - ensure frontend is open and rendering
  - check bridge logs for browser connection/disconnection
- **Blank scene or missing model**
  - verify model files exist under `public/models/`
  - confirm app is served via Vite (not direct `file://` open)

---

## License

No license file is currently defined in this repository.
