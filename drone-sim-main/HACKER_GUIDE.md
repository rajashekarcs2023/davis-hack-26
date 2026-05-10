# DAC CesiumSim Hacker Guide (Stage 0)

This repo is a **starting platform** for hackathon teams building VLA/VLM-controlled autonomy.
It is intentionally minimal, understandable, and easy to extend.

If you are new to the codebase, read this file first.

## What This Simulator Is

DAC CesiumSim is a browser FPV drone simulator built on CesiumJS.
The simulator loop runs in the browser and updates:

- drone position
- velocity
- heading / orientation
- camera view
- collision and mission metrics

The key design idea: **movement is driven by keyboard state** (`keyState`), not direct position teleport hacks.
This makes external control robust and consistent with the existing flight model.

## Core Architecture

There are 3 pieces in the external-control stack:

1. **Browser simulator** (`src/simulator/external-api.ts`):
   - connects out to `ws://localhost:8765`
   - sends simulator state continuously
   - receives action commands
   - injects key codes into `keyState`
2. **Bridge process** (`api-bridge.py`):
   - WebSocket server for browser (`:8765`)
   - HTTP API for hacker scripts (`:8766`)
   - forwards actions to browser
   - exposes state and frame stream
3. **Your Python/agent code**:
   - calls HTTP endpoints (`/action`, `/state`, `/frames`)
   - runs your VLM/VLA loop

This architecture exists because browsers cannot host local WebSocket servers directly in this setup.

## Action Tokens (Most Important Concept)

Your model should output one of these action tokens:

- `forward`
- `backward`
- `left`
- `right`
- `ascend`
- `descend`
- `rotate_cw`
- `rotate_ccw`

The browser maps each token to an internal key code:

- `forward` -> `ArrowUp`
- `backward` -> `ArrowDown`
- `left` -> `KeyA`
- `right` -> `KeyD`
- `ascend` -> `KeyW`
- `descend` -> `KeyS`
- `rotate_cw` -> `ArrowRight`
- `rotate_ccw` -> `ArrowLeft`

## Magnitude Semantics

`magnitude` is in `[0.0, 1.0]`.
It controls **key-hold duration**, not speed directly.

- movement actions: `durationMs = magnitude * 2000`
- rotation actions: scaled so `1.0 ~ 2s yaw hold`

Important runtime behavior:

- if a new action arrives while one is active, current action is canceled immediately
- no action queueing

This keeps control reactive for model-in-the-loop inference.

## API Endpoints

Bridge is at `http://localhost:8766`.

- `POST /action`
  - body: `{ "action": "<token>", "magnitude": 0.0..1.0 }`
  - forwards to browser bridge socket
- `GET /state`
  - returns latest state emitted by simulator
- `GET /frames` (SSE, 2 fps default)
- `GET /frames?fps=N` (capped at 10 fps)

Frame events are SSE lines:

`data: <base64-jpeg>\n\n`

## Where to Look in Code

- Simulator entry: `src/simulator/simulator-app.ts`
- External browser API client: `src/simulator/external-api.ts`
- Bridge server: `api-bridge.py`
- HUD and status UI: `src/simulator/hud.ts`
- Hackathon quick start: `HACKATHON.md`

## Local Run

1. `npm run dev`
2. `python api-bridge.py`
3. Open the local simulator URL from Vite

Then from your own script, call:

- `GET /frames` for images
- run model inference
- `POST /action` with token + magnitude
- optionally poll `GET /state` for telemetry

## Teleport Tooling for Debug

The simulator UI includes:

- `UC Davis` quick teleport
- custom `lat, lon[, alt]` teleport input

Use this to quickly move the drone to test scenarios without changing simulator code.

## Stage-0 Mindset (How to Extend)

This project is intentionally Stage 0: a clean baseline.
Expected team extensions:

- smarter token selection (rule-based or model-based)
- closed-loop planning using `state` + `frames`
- richer token vocab (e.g. hover, brake, orbit, waypoint-follow)
- mission scripts and scoring logic
- latency-aware action smoothing

Good pattern: keep simulator core stable, evolve your external controller.

## Safety and Practical Notes

- Keep frame fps <= 10 to avoid choking your model loop.
- Use small magnitudes initially (0.2 to 0.5) while tuning.
- If bridge is down or disconnected, simulator keeps running normally.
- Use browser console `window.DACSimAPI` for quick manual debugging.

---

If your team can reliably map perception -> action tokens with low latency, you are already building the core of a deployable autonomy loop.
