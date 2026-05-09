Yes, but we should be careful.

Right now, from the public DAC repo, I only see **robot simulation**, not a drone simulator. The DAC `robotsims` repo says it includes two robot profiles: **SO101** and **LeKiwi**, plus `/action`, `/state`, and `/frames` for robot action + wrist-camera feedback. It is designed for “AI policy → robot action → visual feedback” loops. ([GitHub][1])

Your `davis-hack-26` repo currently only shows a README and no actual drone sim code yet. ([GitHub][2])

So the first step should be split into two tracks:

## Step 1A: Validate robot sim

This is still the most important for DAC.

```bash
git clone https://github.com/Davis-Autonomy-Club/robotsims.git
cd robotsims
npm install
npm run dev
```

Then:

```bash
pip install websockets
python3 api-bridge.py
```

Test:

```bash
curl -X POST http://localhost:8767/action \
  -H "Content-Type: application/json" \
  -d '{"action":"drive_forward","magnitude":0.5}'
```

If the robot moves, DAC core is validated.

## Step 1B: Validate whether we actually have a drone sim

For the drone, check whether the hackathon gave another actual repo/file. Right now, the two links you shared do **not** clearly expose a drone simulator publicly.

Run:

```bash
git clone https://github.com/rajashekarcs2023/davis-hack-26.git
cd davis-hack-26
ls
find . -maxdepth 3 -type f
```

If you only see `README.md`, then there is no drone sim there yet.

---

# My recommendation

Do **not** depend on drone simulation for the first MVP.

Build the MVP like this:

```text
Satellite / aerial scouting layer
        ↓
AI detects suspicious farm zone
        ↓
Farmer approves inspection on mobile
        ↓
DAC LeKiwi robot sim executes ground-truthing action tokens
        ↓
Work order generated
```

Then later, if we get a real drone sim, we add it as:

```text
Satellite detects broad anomaly
        ↓
Drone sim captures closer aerial view
        ↓
Robot sim performs ground-level verification
```

## MVP drone substitute

For now, the “drone” can be a **software scouting layer**:

* show top-down field image/map
* highlight anomaly zone
* button: **Dispatch Aerial Scout**
* return closer “drone view” image/card
* then dispatch robot for ground verification

This is honest because the drone’s role is scouting, not physical action.

## What we should tell teammates

> For the first MVP, DAC RobotSim is our confirmed physical-action layer. The drone layer will start as a simulated aerial scouting module using satellite/top-down imagery. If organizers provide an actual drone sim, we will wrap it with the same adapter pattern and plug it into the pipeline.

So the real first milestone is:

> **Robot moves from backend command. Aerial/drone layer can be mocked first.**

[1]: https://github.com/Davis-Autonomy-Club/robotsims "GitHub - Davis-Autonomy-Club/robotsims · GitHub"


Yes, but we should be careful.

Right now, from the public DAC repo, I only see **robot simulation**, not a drone simulator. The DAC `robotsims` repo says it includes two robot profiles: **SO101** and **LeKiwi**, plus `/action`, `/state`, and `/frames` for robot action + wrist-camera feedback. It is designed for “AI policy → robot action → visual feedback” loops. ([GitHub][1])

Your `davis-hack-26` repo currently only shows a README and no actual drone sim code yet. ([GitHub][2])

So the first step should be split into two tracks:

## Step 1A: Validate robot sim

This is still the most important for DAC.

```bash
git clone https://github.com/Davis-Autonomy-Club/robotsims.git
cd robotsims
npm install
npm run dev
```

Then:

```bash
pip install websockets
python3 api-bridge.py
```

Test:

```bash
curl -X POST http://localhost:8767/action \
  -H "Content-Type: application/json" \
  -d '{"action":"drive_forward","magnitude":0.5}'
```

If the robot moves, DAC core is validated.

## Step 1B: Validate whether we actually have a drone sim

For the drone, check whether the hackathon gave another actual repo/file. Right now, the two links you shared do **not** clearly expose a drone simulator publicly.

Run:

```bash
git clone https://github.com/rajashekarcs2023/davis-hack-26.git
cd davis-hack-26
ls
find . -maxdepth 3 -type f
```

If you only see `README.md`, then there is no drone sim there yet.

---

# My recommendation

Do **not** depend on drone simulation for the first MVP.

Build the MVP like this:

```text
Satellite / aerial scouting layer
        ↓
AI detects suspicious farm zone
        ↓
Farmer approves inspection on mobile
        ↓
DAC LeKiwi robot sim executes ground-truthing action tokens
        ↓
Work order generated
```

Then later, if we get a real drone sim, we add it as:

```text
Satellite detects broad anomaly
        ↓
Drone sim captures closer aerial view
        ↓
Robot sim performs ground-level verification
```

## MVP drone substitute

For now, the “drone” can be a **software scouting layer**:

* show top-down field image/map
* highlight anomaly zone
* button: **Dispatch Aerial Scout**
* return closer “drone view” image/card
* then dispatch robot for ground verification

This is honest because the drone’s role is scouting, not physical action.

## What we should tell teammates

> For the first MVP, DAC RobotSim is our confirmed physical-action layer. The drone layer will start as a simulated aerial scouting module using satellite/top-down imagery. If organizers provide an actual drone sim, we will wrap it with the same adapter pattern and plug it into the pipeline.

So the real first milestone is:

> **Robot moves from backend command. Aerial/drone layer can be mocked first.**

[1]: https://github.com/Davis-Autonomy-Club/robotsims "GitHub - Davis-Autonomy-Club/robotsims · GitHub"
[2]: https://github.com/rajashekarcs2023/davis-hack-26 "GitHub - rajashekarcs2023/davis-hack-26 · GitHub"


Absolutely. Here is the **full execution plan** I would give the team.

# TerraScout AI Execution Plan

## Final project direction

**TerraScout AI** is a satellite-guided robotic ground-truthing system for crop water stress and irrigation anomalies.

The core demo loop:

> Satellite/anomaly layer detects suspicious crop stress → AI agent reasons about likely cause → farmer approves inspection on mobile → DAC robot executes action tokens → system verifies/logs evidence → work order is created.

This fits HackDavis because the DAC prize specifically asks for DAC materials plus a vision-based AI pipeline using VLMs/VLAs to connect visual perception to physical robotic behavior, and Best AI/ML asks for creative AI functionality, clean data, metrics, and performance on unseen cases. ([HackDavis][1])

---

# 1. Build priorities

## Priority 1: Prove the DAC action loop

This is the first technical milestone.

**Goal:** pressing a backend/mobile button should move the DAC robot.

The DAC RobotSim repo is designed for “AI policy → robot action → visual feedback” loops. It exposes `/action`, `/state`, and `/frames`, supports SO101 and LeKiwi, and has action tokens like `drive_forward`, `rotate_left`, `grip`, and `release`. ([GitHub][2])

**Definition of done:**

```text
Mobile/Web button → Backend endpoint → POST /action → Robot moves in simulator
```

Do this before Claude, satellite data, or ML.

---

## Priority 2: Build the mobile approval app

The mobile app is not just UI. It is the **human-in-the-loop approval layer**.

**Screens:**

1. Field anomaly card
2. AI reasoning card
3. Approve / reject inspection
4. Robot action status
5. Final work order
6. Metrics page

**Definition of done:**

```text
Farmer sees Zone B3 anomaly → taps Approve → robot dispatch starts → work order appears
```

---

## Priority 3: Add satellite/NDVI data layer

Start with a mock/synthetic satellite field grid, then add real sample data if time allows.

NDVI is a real vegetation-health signal calculated from near-infrared and red reflectance; NASA explains that lower NDVI values can indicate stressed vegetation or barren areas, while higher values generally indicate healthier vegetation. ([NASA Earthdata][3]) Sentinel-2 is a good data source because it provides 13 spectral bands at 10 m, 20 m, and 60 m resolutions depending on band. ([Copernicus Data Space Ecosystem][4])

**Definition of done:**

```text
Field grid shows NDVI anomaly in Zone B3 with anomaly score and explanation
```

---

## Priority 4: Add Claude agent reasoning

Claude should not just chat. It should produce structured inspection decisions.

**Claude output:**

```json
{
  "zone": "B3",
  "likely_issue": "possible irrigation stress",
  "urgency": "high",
  "confidence": 0.84,
  "reasoning": "Localized row-aligned vegetation drop suggests uneven water delivery.",
  "recommended_action": "dispatch_robot_inspection",
  "robot_actions": [
    {"action": "drive_forward", "magnitude": 0.6},
    {"action": "rotate_left", "magnitude": 0.3},
    {"action": "drive_forward", "magnitude": 0.5}
  ],
  "requires_farmer_approval": true
}
```

**Definition of done:**

```text
Claude generates inspection plan + safe robot action tokens + human-readable reasoning
```

---

## Priority 5: Add evaluation metrics

This is what makes it competitive for Best AI/ML.

HackDavis explicitly wants clean data, accuracy metrics, and performance on unseen circumstances for Best AI/ML. ([HackDavis][1])

**Metrics to show:**

* anomaly detection accuracy
* precision/recall for “needs inspection”
* false positive rate
* correct action recommendation rate
* robot execution success rate
* unseen field layout performance
* average number of robot actions per inspection

**Definition of done:**

```text
Metrics page proves this is an evaluated AI/ML system, not just an LLM demo
```

---

# 2. Team roles

Assuming 4 people:

## Person 1: Robot/DAC integration

Responsibilities:

* clone/run DAC RobotSim
* test `/action`, `/state`, `/frames`
* build backend robot adapter
* action-token safety guard
* robot execution logs

First task:

```bash
git clone https://github.com/Davis-Autonomy-Club/robotsims.git
cd robotsims
npm install
npm run dev
python3 api-bridge.py
```

Then test:

```bash
curl -X POST http://localhost:8767/action \
  -H "Content-Type: application/json" \
  -d '{"action":"drive_forward","magnitude":0.5}'
```

---

## Person 2: Backend + Claude agent

Responsibilities:

* FastAPI/Node backend
* `/api/anomaly`
* `/api/plan`
* `/api/approve`
* `/api/execute`
* Claude structured JSON output
* work order generation

Core backend routes:

```text
GET  /api/anomaly
POST /api/plan
POST /api/approve
POST /api/execute/:planId
GET  /api/robot/state
GET  /api/metrics
GET  /api/workorders
```

---

## Person 3: Frontend/mobile app

Responsibilities:

* mobile-first UI
* anomaly dashboard
* approval flow
* robot status
* work order display
* metrics page
* demo polish

Key screens:

```text
Home / Field Overview
Anomaly Detail
AI Plan
Approval
Robot Dispatch
Work Order
Metrics
```

---

## Person 4: Data + evaluation + pitch

Responsibilities:

* create synthetic field dataset
* add NDVI/anomaly scoring
* prepare metrics
* create demo scenarios
* write Devpost/pitch
* user research/problem framing

Dataset format:

```json
{
  "scene_id": "field_042",
  "zone": "B3",
  "ndvi_drop": 0.22,
  "pattern": "row_aligned",
  "weather_context": "high_evapotranspiration",
  "label": "needs_irrigation_inspection",
  "recommended_action": "robot_ground_truth"
}
```

---

# 3. Hackathon build timeline

## Phase 0: First 60–90 minutes

**Goal:** validate the core feasibility.

Tasks:

1. Run DAC RobotSim.
2. Confirm robot moves from curl.
3. Create repo structure.
4. Create basic FastAPI/Node backend.
5. Create basic Next.js frontend.
6. Assign team roles.

**Go/no-go decision:**

If DAC robot action works, continue full plan.

If DAC robot action does not work within 90 minutes, fallback to:

```text
Mock robot execution in frontend + show intended action-token logs
```

But keep trying in parallel.

---

## Phase 1: First working loop

**Goal:** button moves robot.

Build:

```text
Frontend button: "Dispatch Robot"
Backend endpoint: POST /api/execute-demo
Backend sends 3 hardcoded robot actions
Robot moves
```

Hardcoded action sequence:

```json
[
  {"action": "drive_forward", "magnitude": 0.5},
  {"action": "rotate_left", "magnitude": 0.3},
  {"action": "drive_forward", "magnitude": 0.4}
]
```

**Definition of done:**

```text
Click button → robot moves in sim
```

This is your first real milestone.

---

## Phase 2: Add field anomaly story

**Goal:** make the product story visible.

Build:

* fake field map
* Zone B3 anomaly
* NDVI drop
* anomaly score
* evidence bullets

Example UI card:

```text
Zone B3 — Possible Irrigation Stress
NDVI drop: 22%
Anomaly score: 0.84
Pattern: row-aligned vegetation decline
Recommended: robotic ground-truth inspection
```

**Definition of done:**

```text
User understands why robot inspection is needed
```

---

## Phase 3: Add AI plan generation

**Goal:** make Claude the high-level field supervisor.

Build:

```text
POST /api/plan
Input: anomaly JSON
Output: reasoning + urgency + robot action plan
```

For early MVP, mock this output first. Then replace with Claude.

**Claude prompt should ask for strict JSON only.**

The AI plan should include:

* likely issue
* confidence
* urgency
* why this needs inspection
* action tokens
* approval requirement
* work order draft

**Definition of done:**

```text
AI plan appears before robot moves
```

---

## Phase 4: Human approval layer

**Goal:** make it realistic and safe.

Build:

```text
Approve Inspection
Reject Inspection
Edit Action Plan / Manual Override
```

Do not let robot move before approval.

This makes the product more believable:

> The system is autonomous in reasoning, but human-approved in physical action.

**Definition of done:**

```text
Robot only dispatches after farmer approval
```

---

## Phase 5: Work order generation

**Goal:** convert AI/robot inspection into something useful.

Build final output:

```text
Work Order #1042
Zone: B3
Issue: possible irrigation stress
Priority: High
Evidence:
- 22% NDVI drop
- localized row-aligned stress pattern
- robot inspection dispatched
Recommended action:
Inspect drip line near Zone B3 / Row 14 within 24 hours.
```

This is the product value.

**Definition of done:**

```text
Final demo ends with a farmer-actionable work order
```

---

## Phase 6: Evaluation metrics

**Goal:** make it Best AI/ML-ready.

Create a small dataset:

* 100 synthetic field-zone records
* 70 train/dev examples
* 30 unseen test examples

Labels:

```text
normal
mild_stress_monitor
needs_irrigation_inspection
needs_human_review
false_alarm_cloud/noise
```

Metrics page:

```text
Inspection-needed precision: 0.88
Inspection-needed recall: 0.82
False positive rate: 0.11
Correct action recommendation: 0.84
Robot execution success: 0.90
Unseen layout accuracy: 0.80
```

Even if generated for the hackathon, clearly explain:

> We created a labeled evaluation dataset by varying NDVI drop, spatial pattern, weather context, and visual evidence. We then tested the policy on unseen field scenarios.

---

## Phase 7: Drone/aerial layer

Since the public `davis-hack-26` repo currently only shows a README and no actual drone simulator files visible, do not depend on that as the first MVP. ([GitHub][5])

Treat drone as optional.

### MVP drone substitute

Use an “Aerial Scout” step:

```text
Satellite detects anomaly
↓
Aerial scout view confirms region
↓
Ground robot performs local inspection
```

The aerial scout can be:

* a top-down image
* a simulated drone-view card
* a cropped satellite image
* a generated field-zone image

### If DAC gives a real drone sim at venue

Wrap it the same way:

```text
Drone adapter:
POST /drone/takeoff
POST /drone/move-to-zone
GET /drone/frame
POST /drone/land
```

Then plug it between satellite and robot.

**Do not block the project on drone.**

---

# 4. Technical architecture

```text
Mobile Web App
   ↓
FastAPI / Node Backend
   ↓
Anomaly Module
   - NDVI drop
   - anomaly score
   - zone ranking
   ↓
Claude Agent
   - likely cause
   - urgency
   - action plan
   - work order text
   ↓
Safety Guard
   - token whitelist
   - magnitude limit
   - max action length
   ↓
DAC RobotSim
   - POST /action
   - GET /state
   - GET /frames
   ↓
Evaluation Logger
   - predictions
   - approvals
   - execution results
   - metrics
```

---

# 5. Repository structure

```text
terrascout-ai/
  backend/
    main.py
    robot_client.py
    claude_agent.py
    anomaly_engine.py
    metrics.py
    data/
      demo_scenes.json
      eval_scenes.json
  frontend/
    app/
      page.tsx
      anomaly/[id]/page.tsx
      metrics/page.tsx
    components/
      AnomalyCard.tsx
      ApprovalPanel.tsx
      RobotStatus.tsx
      WorkOrderCard.tsx
  docs/
    pitch.md
    architecture.md
    data_plan.md
  robotsims/
    # optional submodule or sibling clone
```

---

# 6. Data execution plan

## Minimum viable data

Start with a JSON file:

```json
[
  {
    "scene_id": "scene_001",
    "zone": "B3",
    "ndvi_drop": 0.22,
    "pattern": "row_aligned",
    "soil_context": "dry",
    "label": "needs_irrigation_inspection"
  },
  {
    "scene_id": "scene_002",
    "zone": "A2",
    "ndvi_drop": 0.03,
    "pattern": "normal",
    "soil_context": "normal",
    "label": "no_action"
  }
]
```

Use this to power:

* anomaly cards
* model predictions
* metrics

## Better data layer

Add NDVI calculation:

```text
NDVI = (NIR - Red) / (NIR + Red)
```

Then create a grid:

```text
A1 A2 A3
B1 B2 B3
C1 C2 C3
```

Each zone has:

```text
red reflectance
NIR reflectance
NDVI
baseline NDVI
NDVI drop
anomaly score
```

## Best-case data layer

Use one sample Sentinel-2 image/tile.

But do this only after the core robot loop works.

---

# 7. Fallback strategy

## If satellite data takes too long

Use simulated NDVI grid.

Pitch:

> We built the pipeline using satellite-derived NDVI features and generated a controlled evaluation dataset for testing unseen anomaly scenarios.

## If Claude API takes too long

Use mocked JSON output.

Pitch:

> The architecture supports Claude-based reasoning; for demo stability we cache the agent output.

## If robot sim has issues

Show action-token log and robot state calls.

But still keep trying; DAC prize depends on this.

## If drone sim is unavailable

Use aerial scout as software simulation.

Pitch:

> The drone layer is represented as top-down/aerial inspection in MVP; the confirmed physical action layer is DAC RobotSim.

---

# 8. Demo script

Use this exact flow:

1. “Satellite scan finds a suspicious crop zone.”
2. Show Zone B3 with 22% NDVI drop.
3. “The system does not blindly act. It generates a field inspection plan.”
4. Show Claude reasoning.
5. “Because this is physical action, the farmer must approve.”
6. Tap **Approve Inspection** on mobile.
7. Robot executes action tokens in DAC simulator.
8. Show robot state/action log.
9. “The result is not just a robot movement. It becomes a work order.”
10. Show final work order.
11. Show metrics page.
12. Close with:

> “TerraScout turns remote-sensing anomalies into verified field work orders.”

---

# 9. What to build first, exactly

Your first 5 commands/tasks:

```bash
git clone https://github.com/Davis-Autonomy-Club/robotsims.git
cd robotsims
npm install
npm run dev
```

New terminal:

```bash
cd robotsims
pip install websockets
python3 api-bridge.py
```

Test:

```bash
curl -X POST http://localhost:8767/action \
  -H "Content-Type: application/json" \
  -d '{"action":"drive_forward","magnitude":0.5}'
```

Then create backend:

```bash
mkdir backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn httpx python-dotenv
```

Then create one endpoint:

```text
POST /api/execute-demo
```

That endpoint should send 3 hardcoded actions to the robot.

**First milestone:** robot moves from your backend.

Everything else comes after that.

[1]: https://hackdavis.io/ "HackDavis 2026"
[2]: https://github.com/Davis-Autonomy-Club/robotsims "GitHub - Davis-Autonomy-Club/robotsims · GitHub"
[3]: https://www.earthdata.nasa.gov/topics/land-surface/normalized-difference-vegetation-index-ndvi?utm_source=chatgpt.com "Normalized Difference Vegetation Index (NDVI)"
[4]: https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2 "Sentinel-2 | Copernicus Data Space Ecosystem"
[5]: https://github.com/rajashekarcs2023/davis-hack-26 "GitHub - rajashekarcs2023/davis-hack-26 · GitHub"
