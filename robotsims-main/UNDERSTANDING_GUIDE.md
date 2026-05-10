# RobotSim Understanding Guide (Hackathon Track)

This repository is the stage-0 baseline for a VLA/VLM robotics stack: a simple, working loop from model output to robot motion to visual/state feedback.

If you are building for the hackathon track, think of this codebase as a controllable robot "sandbox API" where your model emits action tokens, and the simulator returns state + wrist-camera frames.

## What You Are Looking At

RobotSim has two halves:

1. A browser simulator (`Vite` + `TypeScript` + `three` + `urdf-loader`)
2. A local Python bridge (`api-bridge.py`) that exposes easy HTTP endpoints for your policy code

Core loop:

1. Your script posts an action token to `POST /action`
2. Bridge forwards that action to the simulator over WebSocket
3. Simulator executes the action over time
4. Simulator publishes telemetry (`/state`) and wrist frames (`/frames`)
5. Your script decides the next action

This is intentionally kinematic and lightweight (no physics engine): fast iteration > physical realism.

## Why Action Tokens Exist

Action tokens are a compact control vocabulary for policies.

Instead of directly writing low-level joint values every step, your model chooses from human-readable primitives like:

- `shoulder_up`
- `wrist_roll_cw`
- `grip`
- `drive_forward` (LeKiwi only)

This has three advantages for hackathon workflows:

- Smaller action space for prompts and model heads
- Safer control boundaries (tokens map to clamped joint/base updates)
- Easier debugging in logs/HUD (`last_action`, task state, joint readouts)

## Action Token Contract

Every token maps to an `ActionSpec` in robot configs:

- `src/robots/so101.ts`
- `src/robots/lekiwi.ts`

`ActionSpec` kinds:

- `joint_delta`: move a joint continuously in `+/-` direction for a duration
- `joint_set`: snap a joint to min/max bound (`grip`, `release`)
- `base_motion`: move or rotate LeKiwi base
- `reset`: reset all joints to defaults

Magnitude semantics:

- Input is clamped to `[0, 1]`
- Duration is `magnitude * 2000ms`
- For `joint_delta` and `base_motion`, update happens every animation frame until duration ends
- For `joint_set` and `reset`, action applies immediately

## Where Execution Happens

Main orchestrator: `src/simulator/simulator-app.ts`

Key flow:

1. `startAction(token, magnitude)` validates token against active robot config
2. Valid token becomes `activeAction` with start time + computed duration
3. `updateAction(dt)` is called every animation frame
4. Robot state changes through `RobotViewer` methods:
   - `addJointDelta`
   - `setJointToBound`
   - `moveBase`
   - `rotateBase`
   - `resetJointState`

Invalid token behavior:

- Action is rejected (`false` returned by `startAction`)
- No robot state update is applied
- HUD test panel surfaces rejection message

## State and Observation Surfaces

### `/state`

`GET /state` returns latest simulator snapshot:

- active robot id
- joint angles (degrees)
- base pose (`lekiwi` only)
- task status (`idle`, `in_progress`, `complete`)
- spawned object list
- timestamp

This is usually enough for simple closed-loop policies.

### `/frames` (SSE)

`GET /frames?fps=5` streams base64 JPEG frames from wrist camera.

Use this when your VLM needs visual feedback. Frame rate is capped at 10 FPS.

## Robots and Capabilities

### SO101

6-DOF arm + gripper tokens:
`rotate_cw`, `rotate_ccw`, `shoulder_up`, `shoulder_down`, `elbow_up`, `elbow_down`, `wrist_up`, `wrist_down`, `wrist_roll_cw`, `wrist_roll_ccw`, `grip`, `release`, `reset`

### LeKiwi

All SO101 arm/gripper tokens plus mobile base tokens:
`drive_forward`, `drive_backward`, `strafe_left`, `strafe_right`, `rotate_left`, `rotate_right`

## How to Add New Tokens (Recommended Hack Path)

If your team wants richer policy behavior, add tokens rather than bypassing the token layer.

1. Pick robot config:
   - `src/robots/so101.ts`
   - `src/robots/lekiwi.ts`
2. Add token entry to `actionTokens` map with appropriate `ActionSpec`
3. If needed, extend `ActionKind`/runtime handling in `src/simulator/simulator-app.ts`
4. Validate from the HUD API panel, then from your external script via `POST /action`

Tip: keep token names model-friendly, short, and semantically clean (`verb_object` or directional verbs).

## Suggested VLA/VLM Integration Pattern

A simple reliable baseline:

1. Pull one frame from `/frames` (or sample at low FPS)
2. Read `/state`
3. Build a model prompt from target task + current observation
4. Constrain model output to known token list
5. Execute token with bounded magnitude
6. Repeat until task success criteria

Good first constraints:

- whitelist tokens per active robot
- clamp magnitude to conservative range (`0.2` to `0.7`)
- use `reset` as recovery primitive

## Important Limitations (By Design)

- No physics/collisions/gravity
- No reward/training framework built in
- No domain randomization pipeline yet
- No multi-robot coordination layer

These are intentional for stage-0 simplicity; your hacks can layer these features on top.

## Quick Run Checklist

1. `npm install`
2. `npm run dev`
3. `pip install websockets`
4. `python3 api-bridge.py`
5. Open `http://localhost:5173`
6. Drive actions from HUD or `POST /action`
7. Read telemetry from `/state` and visuals from `/frames`

## What "Stage 0" Means for You

This repo is not the final product. It is the minimum complete skeleton with:

- deterministic token execution
- clear bridge interfaces
- inspectable simulator state
- visual feedback loop for VLMs

Your track goal is to evolve this baseline into better autonomy:

- smarter token selection policies
- better observation-to-action prompting
- richer token vocabularies
- safety wrappers and eval scripts

If your team can keep the token contract stable while improving policy quality, you can move fast without rewriting the whole stack.
