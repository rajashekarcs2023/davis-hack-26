# TerraScout AI — Backend / AI / Sim Architecture

**Single source of truth. Overrides any conflicting claims in `execution.md`.**
Last updated: hackathon kickoff. See `DECISIONS.md` for the running decision log.

---

## 0. What changed since `execution.md`

| Claim in `execution.md`                              | Reality (verified)                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| "We may not have a drone sim."                       | We DO. `drone-sim-main/` is a full Cesium FPV drone with Google 3D tiles, MAVLink. |
| Drone is mocked / aerial scout is just an image.    | Drone is real, action-token controllable, FPV camera SSE-streamed.                |
| Both sims can run together.                          | They cannot. Both bind WS `:8765`. We patch drone WS to `:8768`. (See §9.)       |
| Need to find a farm region for the drone.            | `drone-sim-main/src/simulator/config.ts` already ships `UCD_LOCATION` (UC Davis, Yolo County). Real California farmland is one teleport away. |
| Drone is wildfire-themed.                            | Sim has a wildfire incident overlay we will *replace* with a field-zone overlay. Underlying flight + camera + tile rendering is domain-agnostic. |

The agentic / data / metrics architecture from the project plan is preserved. Only the sim assumptions are corrected.

---

## 1. One-line pitch

> **TerraScout turns satellite-detected crop anomalies into verified, farmer-approved field work orders — using a Claude agent that reasons, a Gemini vision model that sees through drone & robot cameras, and a DAC drone+robot pipeline that physically verifies on the ground.**

---

## 1a. Repo layout (and what is *not* in this repo)

The DAC sims (`drone-sim-main/`, `robotsims-main/`) are **external dependencies** — cloned and run alongside our app, not committed to our repo. Teammates run them per the DAC instructions.

Our repo contains:

```text
davis-hack-26/
├── README.md                 # top-level project README
├── projectplan/              # planning + decision log
│   ├── project-idea.md
│   ├── execution.md          # historical, partly stale; kept for context
│   ├── stackthoughts.md
│   ├── architecture.md       # ← this file (source of truth)
│   └── DECISIONS.md          # running log of architecture decisions
├── backend/                  # FastAPI + agent + VLM + sim adapters (us)
└── frontend/                 # mobile-first web app (teammates)
```

The two sim folders currently in the workspace (`drone-sim-main/`, `robotsims-main/`) are reference clones we use to read the API contract. They are gitignored and won't ship in our repo — at hackathon time, anyone running this clones them fresh from DAC.

---

## 1b. Domain extension (stretch goal): Wildfire-driven crop protection

The agentic + sim + safety architecture is **domain-agnostic by design**. The product MVP is irrigation triage. If we have time, we add a second "domain pack" using the same pipeline:

> **Detect cropland-adjacent wildfire risk → drone scouts perimeter and prevailing wind → ground robot drops sensor / marks evacuation route for livestock & equipment → farmer/responder gets a protect-the-farm work order.**

This is *not* the same as copying the drone sim's built-in Airline Fire demo. We extend it: the trigger is satellite hotspot data, the *decision* is whether crop assets are at risk, and the *output* is a farm-protection work order — not a fire-response work order. The wildfire is just the anomaly source; the customer is still the farmer.

Implementation cost is small because:

- `agent/prompts.py` is the only file that needs a new prompt pack.
- `domain/anomaly_engine.py` already abstracts "anomaly source" — fire hotspot is just another anomaly type alongside NDVI drop.
- The drone path planner already knows how to fly to a lat/lon — it doesn't care if the lat/lon is "stressed crop zone" or "approaching fire front".
- `vision/` prompts swap from "crop stress evidence" to "fire proximity / wind direction / smoke plume" prompts.

Concretely we add:
```text
backend/app/domain/packs/
  irrigation.py       # primary MVP
  wildfire.py         # stretch goal
```

A `domain_pack` field on the run config picks which set of prompts, labels, and anomaly classifiers to use. Pitch line:

> *Same agentic pipeline, two domains. Today we save crops from drought stress. Tomorrow we save them from wildfire.*

---

## 2. The system, end-to-end

```text
┌─────────────────────────────────────────────────────────────────┐
│  Mobile / Web App  (frontend teammates)                          │
│   Anomaly card → Approve → Live drone+robot view → Work order   │
└──────────────┬──────────────────────────────────────────────────┘
               │ REST + SSE
┌──────────────▼──────────────────────────────────────────────────┐
│  FastAPI Backend  (us)                                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Anomaly Engine  (NDVI + zone z-score + classifier)     │   │
│   └─────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Claude Agent  (Anthropic Agent SDK, tool-using loop)   │   │
│   │  Tools: anomaly, drone, robot, vision, approval, order │   │
│   └─────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Gemini VLM Client  (Robotics-ER primary, fallbacks)    │   │
│   └─────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Action-Token Safety Guard  (whitelist, clamp, max-N)   │   │
│   └─────────────────────────────────────────────────────────┘   │
│   ┌─────────────────────┐    ┌─────────────────────────────┐    │
│   │  Drone Adapter      │    │  Robot Adapter              │    │
│   │  (HTTP :8766)       │    │  (HTTP :8767)               │    │
│   └─────────┬───────────┘    └────────────┬────────────────┘    │
└─────────────┼─────────────────────────────┼─────────────────────┘
              │                             │
   ┌──────────▼──────────┐       ┌──────────▼─────────────┐
   │  DAC Drone Sim      │       │  DAC Robot Sim         │
   │  Cesium FPV         │       │  LeKiwi (mobile + arm) │
   │  WS :8768 (patched) │       │  WS :8765              │
   └─────────────────────┘       └────────────────────────┘
```

---

## 3. The agentic loop (what Claude actually does)

Single **agent run** per inspection, driven by the **Anthropic Messages API** with manual tool-use loop (see `DECISIONS.md` for why we chose this over the Claude Agent SDK — short version: the Agent SDK is filesystem-agent-oriented, our tools are domain-specific). The agent sees the anomaly and chooses a sequence of tool calls. The order is *not* hard-coded — Claude decides — but the typical path is:

```text
1.  fetch_anomaly(zone_id)              → NDVI drop, pattern, neighbors
2.  fetch_weather_context()             → ETo, precip (optional, CIMIS or mock)
3.  classify_anomaly(features)          → {label, confidence, urgency}
4.  draft_inspection_plan(...)          → drone path + robot path + reasoning
5.  request_human_approval(plan)        → blocks until /api/approve called
                                          (rejection short-circuits the run)
6.  dispatch_drone_to_zone(zone_id)     → safe action-token sequence sent
7.  capture_drone_frame()               → grabs latest SSE frame
8.  vlm_analyze_aerial(frame, question) → "row-aligned dryness visible?"
9.  if aerial_confirms:
        dispatch_ground_robot(zone_id, plan)
        capture_robot_frame()
        vlm_analyze_ground(frame, question)
10. create_work_order(zone, evidence, recommendation)
11. log_run_for_metrics(...)            → eval pipeline gets a row
```

Each tool returns structured JSON. The agent's final output is a `WorkOrder` object.

**Why this is real agentic behavior, not "an LLM wrapper":**

- Claude *chooses* whether step 9 happens (sometimes the aerial view is enough; sometimes ground-truth is mandatory).
- Claude *chooses* magnitudes and counts of action tokens within the safety bounds.
- Claude can re-plan if the drone analysis disagrees with the satellite signal (e.g., NDVI drop turns out to be a harvested row, not stress).
- Tool calls + reasoning are logged → reproducible and gradeable.

---

## 4. Vision pipeline (VLM / VLA layer)

Two distinct VLM jobs. Same client, different prompts. Both use Gemini Robotics-ER 1.6's **native pointing format** — `[y, x]` coordinates normalized 0..1000 — see `docs/gemini-robotics.md` "Pointing to objects." Frontend overlays these points on the live drone/robot frame so the operator can see *exactly* what the VLM saw.

### 4.1 Aerial verification (drone → VLM)

- Input: latest drone FPV JPEG (base64) + zone metadata (`zone_id`, `lat`, `lon`, `alt_agl`, `expected_pattern`).
- Config: `temperature=1.0`, `thinking_config(thinking_budget=0)` — fast spatial detection per Gemini docs.
- Prompt asks the model to **point to** stress evidence and return JSON: `{visible, confidence, evidence[], evidence_points[{point:[y,x], label}], recommend_ground_truth}`.
- Output drives whether step 9 (ground robot) fires.

### 4.2 Ground verification (LeKiwi wrist cam → VLM)

- Input: latest LeKiwi wrist JPEG + robot state (joints, base pose).
- Config: `temperature=1.0`, `thinking_config(thinking_budget=256)` — slightly more reasoning for multi-class evidence detection.
- Prompt asks the model to **point to** each piece of evidence: dry soil patches, wilted leaves, damaged drip line. Returns JSON: `{dry_soil, wilted_leaves, damaged_drip_line, other_evidence[], evidence_points[{point:[y,x], label}], confidence}`.
- Output is the work-order evidence list. The points are visualizable on the frontend.

### 4.3 Model choice (with fallbacks)

The `VLMClient` is an interface. Three implementations, picked at startup by env var:

| Impl                  | When to use                                                  | Model                            |
| --------------------- | ------------------------------------------------------------ | -------------------------------- |
| `GeminiRoboticsER`    | Primary. Best for spatial / embodied reasoning.              | `gemini-robotics-er-1.6` (preview) |
| `GeminiVisionPro`     | Fallback if Robotics-ER access is gated.                      | `gemini-2.5-pro` with image input |
| `ClaudeVision`        | Tertiary if Gemini quota issues.                              | `claude-sonnet-4-5` with image input |
| `MockVLM`             | Demo-day insurance; deterministic fixtures keyed by zone.    | none                             |

`MockVLM` exists so a network failure during the 3-minute demo doesn't kill the run.

---

## 5. Safety layer (non-negotiable)

Models propose action tokens; they never execute them directly. The **Safety Guard** sits between the agent's tool call and the sim adapters.

```python
ALLOWED_DRONE_ACTIONS = {"forward","backward","left","right","ascend","descend","rotate_cw","rotate_ccw"}
ALLOWED_ROBOT_ACTIONS = {"drive_forward","drive_backward","strafe_left","strafe_right",
                         "rotate_left","rotate_right","shoulder_up","shoulder_down",
                         "elbow_up","elbow_down","wrist_up","wrist_down",
                         "wrist_roll_cw","wrist_roll_ccw","grip","release","reset"}

MAX_MAGNITUDE = 0.7        # demo-safe; never 1.0
MAX_ACTIONS_PER_DISPATCH = 12
MAX_ALTITUDE_AGL_M = 80    # drone never climbs out of useful range
MIN_ALTITUDE_AGL_M = 8     # drone never crashes into the canopy
```

A rejected action returns `{"ok": false, "reason": "..."}` to the agent, which can re-plan. Every rejection is logged for the metrics page.

This is also the answer to a likely judge question: *"How do you stop the LLM from doing something stupid?"*

---

## 6. Data layer

Three tiers, exactly as the project plan says, but reframed against what we actually build:

### 6.1 Synthetic NDVI grid (must-have, hour 4)

`backend/data/field_grid.json` — 4×4 zone grid. Each zone has:
```json
{
  "zone_id": "B3",
  "lat": 38.5421,
  "lon": -121.7689,
  "ndvi": 0.42,
  "ndvi_baseline": 0.64,
  "ndvi_drop": 0.22,
  "pattern": "row_aligned",
  "neighbor_avg_ndvi": 0.61,
  "anomaly_score": 0.84
}
```

Centered around `UCD_LOCATION` so the drone can teleport in and the FPV view is real Yolo County farmland from Google 3D tiles.

### 6.2 Labeled evaluation dataset (must-have, hour 5)

`backend/data/eval_scenes.json` — 300 synthetic scenes with ground-truth labels:
- 70 train/dev (used to calibrate thresholds)
- 30 unseen test (held out, drives the "Unseen accuracy" metric)
- 200 labeled examples for confusion-matrix slices

Label classes: `normal`, `mild_stress_monitor`, `needs_irrigation_inspection`, `needs_human_review`, `false_alarm_cloud_noise`.

Generator: `backend/scripts/generate_eval_dataset.py` parameterized by NDVI drop, spatial pattern, weather context, and noise injection. Reproducible (seeded RNG).

### 6.3 Real Sentinel-2 sample (nice-to-have, hour 9+)

One pre-downloaded Sentinel-2 tile of a Central Valley field, NDVI computed once and overlaid on the dashboard. Proves the pipeline works on real reflectance data. Skip if behind schedule — the metrics page is more valuable.

---

## 7. Backend repo layout

```text
backend/
  pyproject.toml                # uv / pip deps pinned
  .env.example                  # ANTHROPIC_API_KEY, GOOGLE_API_KEY, etc.
  app/
    main.py                     # FastAPI app, route wiring, SSE
    config.py                   # env, ports, safety bounds
    schemas.py                  # Pydantic models (Anomaly, Plan, WorkOrder, etc.)
    api/
      routes_anomaly.py         # GET /api/anomaly[, /:zone_id]
      routes_plan.py            # POST /api/plan
      routes_approval.py        # POST /api/approve, /api/reject
      routes_execute.py         # POST /api/execute/:run_id, SSE /api/runs/:id/events
      routes_metrics.py         # GET /api/metrics, /api/runs
    agent/
      claude_agent.py           # Agent SDK orchestrator
      tools.py                  # All @tool functions Claude can call
      prompts.py                # System + tool prompts (versioned)
    vision/
      vlm_client.py             # Protocol + factory
      gemini_er.py              # Gemini Robotics-ER 1.6 impl
      gemini_pro.py             # Fallback
      claude_vision.py          # Tertiary fallback
      mock_vlm.py               # Demo-day insurance, fixture-driven
    sim/
      drone_adapter.py          # HTTP client to :8766 + path planner
      robot_adapter.py          # HTTP client to :8767 + path planner
      safety.py                 # ALLOWED_*, clamp, max-N, reject reasons
      frame_grabber.py          # SSE → latest-frame cache for both sims
    domain/
      anomaly_engine.py         # NDVI calc, z-score, classifier
      work_order.py             # Templating + persistence
      metrics.py                # Precision/recall on eval set
    data/
      field_grid.json           # Synthetic field, centered on UCD
      eval_scenes.json          # 300 labeled rows
      runs/                     # JSON-Lines log per agent run
  scripts/
    generate_eval_dataset.py
    download_sentinel2_sample.py   # optional, hour 9+
    smoke_test_drone.py            # POST one action, verify state changes
    smoke_test_robot.py
    e2e_demo.py                    # scripted: anomaly → drone → robot → order
  tests/
    test_safety.py
    test_anomaly_engine.py
    test_metrics.py
```

---

## 8. API contract (for frontend teammates)

Stable, versioned. Frontend can stub against this from minute one.

### 8.1 REST

| Method | Path                            | Purpose                                                           |
| ------ | ------------------------------- | ----------------------------------------------------------------- |
| GET    | `/api/health`                   | `{ok, sims: {drone: bool, robot: bool}, vlm: "gemini-er"\|"mock"}` |
| GET    | `/api/field`                    | Full zone grid for the field map.                                 |
| GET    | `/api/anomaly`                  | List of currently-flagged zones, ranked.                          |
| GET    | `/api/anomaly/:zone_id`         | One zone, with neighbors and pattern features.                    |
| POST   | `/api/plan`                     | Body: `{zone_id}` → returns Claude-generated `Plan`.              |
| POST   | `/api/approve`                  | Body: `{run_id, approved: bool, edited_plan?}` → unblocks the agent. |
| POST   | `/api/execute/:run_id`          | Starts the agent run if not already running.                      |
| GET    | `/api/runs`                     | History list, paged.                                              |
| GET    | `/api/runs/:run_id`             | Full transcript (tool calls, reasoning, evidence).                |
| GET    | `/api/runs/:run_id/work_order`  | The final work-order JSON.                                        |
| GET    | `/api/metrics`                  | Eval-set metrics + run-time aggregates.                           |

### 8.2 Server-Sent Events

`GET /api/runs/:run_id/events` — frontend subscribes, gets a live timeline:
```text
event: agent_thought       data: { step, summary }
event: tool_call           data: { tool, args }
event: tool_result         data: { tool, result, ms }
event: drone_action        data: { action, magnitude }
event: drone_state         data: { lat, lon, alt_agl, heading }
event: drone_frame         data: { jpeg_b64 }
event: robot_action        data: { action, magnitude }
event: robot_state         data: { joints, base_pose, task_status }
event: robot_frame         data: { jpeg_b64 }
event: vlm_analysis        data: { which, evidence, confidence }
event: approval_pending    data: { plan }
event: work_order_ready    data: { work_order }
event: run_done            data: { run_id, outcome }
```

This is what makes the demo screen feel alive.

---

## 9. Sim integration: the port collision

Both sims hard-code `ws://localhost:8765`. We patch the **drone sim**, not the robot sim, because:
- DAC's grading rubric examples assume robot sim works out of the box.
- Robot sim's HTTP port (`8767`) and drone sim's HTTP port (`8766`) already differ — only WS conflicts.

### 9.1 Patch (one-time, hour 0)

Two files, two values, same number:

```diff
# drone-sim-main/src/simulator/external-api.ts
- const BRIDGE_URL = "ws://localhost:8765";
+ const BRIDGE_URL = "ws://localhost:8768";

# drone-sim-main/api-bridge.py
- WS_PORT = 8765
+ WS_PORT = 8768
```

After patch:

| Component   | HTTP      | WS         |
| ----------- | --------- | ---------- |
| Drone sim   | `:8766`   | `:8768`    |
| Robot sim   | `:8767`   | `:8765`    |
| Backend     | `:8000`   | (none)     |

### 9.2 Run order (in tmux / 4 terminals)

```bash
# T1: drone sim frontend
cd drone-sim-main && npm run dev          # serves at :5173

# T2: drone sim bridge
cd drone-sim-main && python3 api-bridge.py   # :8766 + WS :8768

# T3: robot sim frontend
cd robotsims-main && npm run dev          # serves at :5174 (Vite picks next free)

# T4: robot sim bridge
cd robotsims-main && python3 api-bridge.py   # :8767 + WS :8765

# T5: our backend
cd backend && uvicorn app.main:app --reload --port 8000
```

> Cesium token: drone sim needs `VITE_CESIUM_TOKEN` and `VITE_GOOGLE_MAPS_API_KEY` in `drone-sim-main/.env`. We already have an `.env` there — confirm it's not expired before demo.

### 9.3 Path planning (action-token sequencing)

Claude proposes a *destination* (lat/lon for drone, zone-id for robot). The adapter expands that into a safe sequence of action tokens.

**Drone path planner** (`sim/drone_adapter.py`):
1. Read `/state` → current lat/lon/heading/alt.
2. Compute bearing + great-circle distance to target.
3. Issue `rotate_cw` / `rotate_ccw` (magnitude proportional to angle delta).
4. Issue `forward` in chunks of magnitude ≤ 0.5 until within 30 m horizontal of target.
5. Issue `descend` until `alt_agl` is in `[20, 40]` m.
6. Issue `descend`/`ascend` micro-corrections during VLM frame capture (3-5 frames).
7. Each step polls `/state` to confirm motion before issuing the next.

**Robot path planner** (`sim/robot_adapter.py`):
1. LeKiwi starts in the `forest` environment (already shipped).
2. Map zone-id → `(target_x, target_y)` in robot frame using a fixed mapping (zones map to lanes in the forest).
3. Drive primitives: `drive_forward` for distance, `rotate_left`/`rotate_right` for heading.
4. At target: capture wrist frame; optionally `shoulder_down` + `wrist_down` for closer leaf inspection.
5. Polling on `/state.base_pose` to confirm progress.

Both planners are deterministic and bounded. Claude can pass *waypoint hints* but cannot bypass the planner.

---

## 10. Reskinning the drone sim for agriculture

Minimal changes — we don't fork the sim.

| Change                                                | Where                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Replace wildfire incident overlay with field-zone overlay | New file `drone-sim-main/field-overlay.js` mirroring `incident-overlay.js` API. Wired in via the same hooks. |
| Default teleport to `UCD_LOCATION`                    | `drone-sim-main/src/simulator/config.ts` — already there; just call `teleportTo(UCD_LOCATION)` on startup. |
| Hide "Airline Fire" legend                            | Replace HTML strings in the right-side legend panel with field info.    |

The wildfire overlay code (`drone-sim-main/incident-overlay.js`) is excellent reference — same `Cesium.PolylineGlowMaterialProperty` beams + ground discs + labels, just relabel as `Zone B3 — irrigation stress`, `Zone A2 — healthy`, etc., with colors driven by NDVI drop.

---

## 11. Metrics page (Best AI/ML hook)

Computed from `backend/data/eval_scenes.json` (held-out 30 unseen) plus per-run logs.

| Metric                                         | Computation                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Anomaly-detection accuracy                     | Threshold the anomaly score, compare to label.                            |
| Inspection-needed precision / recall / F1      | Standard. Class = `needs_irrigation_inspection`.                          |
| False-positive rate                            | `false_positive / (false_positive + true_negative)`.                      |
| Action-recommendation accuracy                 | Did Claude pick `dispatch_robot` vs `monitor` vs `ignore` correctly?      |
| Aerial VLM agreement rate                      | Fraction of runs where VLM aerial confirmed satellite signal.             |
| Robot execution success                        | Fraction of dispatches that completed without safety reject / timeout.    |
| Avg action tokens per inspection               | Median + p90.                                                             |
| Unseen-layout accuracy                         | Same metrics computed *only* on held-out 30 test scenes.                  |
| Latency budget                                 | p50 / p95 of: anomaly→plan, plan→approval, approval→work-order.           |

All of these are computable from the JSON-Lines run log + the labeled eval set. We render them on a dedicated `/metrics` page; no fancy ML training required.

---

## 12. Risk table (and what we do)

| Risk                                                       | Mitigation                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gemini Robotics-ER access is gated.                        | `VLMClient` factory falls through to Gemini Pro Vision, then Claude Vision. |
| Anthropic / Google API rate limits during demo.            | `MockVLM` + cached agent transcripts replay-able from the eval set.       |
| Drone sim Cesium token expires mid-event.                  | Verify in hour 0; have a backup token; otherwise drone runs on flat ellipsoid (less pretty but functional). |
| Robot sim wrist cam is dark / blank.                       | We added a deterministic ground-frame fixture in `MockVLM`.               |
| Port collision on `:8765`.                                 | Patched in §9.1. Smoke test verifies both bridges live.                   |
| Two sims on one laptop = thermal throttle.                 | Drone sim caps frame fps at 5, robot at 5. Battery on AC.                 |
| Claude tool-use loop diverges (loops forever).             | Hard cap of 12 tool calls per run. Agent SDK supports `max_turns`.        |
| Frontend not done by demo time.                            | Backend has a built-in `/api/demo/replay` that just streams a recorded run to a placeholder UI. |
| One teammate disappears.                                   | Each module is independently runnable; smoke scripts in `backend/scripts/` cover end-to-end without UI. |

---

## 13. Hour-by-hour build plan (backend / AI-ML / sim — our 3 people)

> Frontend teammates work in parallel against `/api/*` stubs from hour 1.

### Hour 0 — Environment

- Patch drone sim WS port (§9.1). `npm install` both sims. Verify `npm run dev` works for each.
- Apply both sim bridges; smoke `curl POST /action` for both. Both sims must move.
- Create `backend/` skeleton, FastAPI hello, `pyproject.toml`, `.env.example`.

### Hour 1 — Adapters + safety

- `sim/drone_adapter.py`: action POST + state GET + frame SSE consumer.
- `sim/robot_adapter.py`: same shape.
- `sim/safety.py`: whitelist + clamp + max-N + tests.
- `scripts/smoke_test_*.py`: verify each adapter end-to-end.

### Hour 2 — Anomaly engine + field grid

- `data/field_grid.json` (16-zone synthetic, centered on UCD).
- `domain/anomaly_engine.py`: NDVI z-score vs neighbors, pattern detector (row-aligned vs patchy), classifier.
- `api/routes_anomaly.py`.
- Frontend can now render the field map.

### Hour 3 — Hardcoded execute path

- `api/routes_execute.py` with a fixed plan for zone B3: drone teleport → 3 forward, 1 descend → robot 4 drive_forward → mock work order.
- This is the "click-button-robot-moves-and-drone-moves" milestone.
- Demo is *technically demoable* from this point on. Everything after improves quality.

### Hour 4 — VLM client

- `vision/mock_vlm.py` first (deterministic fixtures).
- `vision/gemini_er.py` if API key works; else `gemini_pro.py`.
- Wire `vlm_analyze_aerial` and `vlm_analyze_ground` into the hardcoded execute path.

### Hour 5 — Claude agent + tools

- `agent/tools.py`: 11 tools listed in §3.
- `agent/claude_agent.py`: Agent SDK loop.
- `agent/prompts.py`: locked-down JSON-output system prompt.
- Replace the hardcoded execute path with `agent.run(zone_id)`.

### Hour 6 — Approval + work order

- `api/routes_approval.py` with futures-based wait.
- `domain/work_order.py` templater.
- SSE pipeline so frontend can show live tool calls + approval modal.

### Hour 7 — Eval dataset + metrics

- `scripts/generate_eval_dataset.py`.
- `domain/metrics.py`: precision/recall/F1, confusion, latency aggregates.
- `api/routes_metrics.py`.
- Frontend `/metrics` page.

### Hour 8 — Drone field overlay + visual polish

- `drone-sim-main/field-overlay.js` replacing wildfire markers.
- Teleport-on-startup to UCD.
- Robot environment lock to `forest`.
- Refine path planners for smoother demo motion.

### Hour 9 — Buffer / Sentinel-2 / pitch dry-run

- One real Sentinel-2 tile + NDVI overlay (optional).
- `scripts/e2e_demo.py` reproducible full-loop run for the dry-run.
- Pitch rehearsal, camera angles, browser-tab choreography.

### Hour 10–12 — Demo

- Lock builds. Stop merging. Run `e2e_demo.py` once per dry-run.
- Have `MockVLM` ready as the kill-switch.

---

## 14. What teammates can do in parallel from hour 1

- **Frontend (2 people):** stub against `/api/*` immediately. Anomaly card, approval modal, robot-status panel, work-order card, metrics page. SSE timeline view.
- **Pitch / data person:** synthetic dataset generator, demo script, visuals, Devpost copy.
- **Us (3 people):** backend / agent / sims as above.

Frontend never blocks on backend after hour 1 because the API contract (§8) is locked.

---

## 15. Pitch lines (locked)

- **Headline:** *Satellite detects. Claude reasons. Gemini sees. DAC robots verify. Farmer approves.*
- **Killer line:** *We turn remote-sensing anomalies into verified field work orders.*
- **Why DAC track:** *Both DAC sims are in the loop. Drone provides aerial verification. LeKiwi performs ground-truthing. Vision-language models close the perception-to-action loop, and a deterministic safety guard converts model intent into bounded action tokens.*
- **Why AI/ML:** *Tool-using Claude agent over a labeled evaluation set, with held-out unseen scenes, precision/recall, and a deterministic VLM fallback so demo-day reliability is also measurable.*
- **Why social good:** *Small farms lose ~10% of yield to undetected irrigation faults. We compress detect → verify → act from days to minutes, with the human always in the loop.*
