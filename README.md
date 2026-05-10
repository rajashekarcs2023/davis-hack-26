# AgriScout AI — HackDavis 2026

**Satellite detects. Gemini reasons. Drone confirms. Robot diagnoses. Farmer approves.**

AgriScout is a satellite-guided, agentic field-triage system for **multi-cause crop stress** (pest / water / nutrient / false-alarm). A Google ADK agent powered by **Gemini 2.5 Pro** reads satellite NDVI anomalies, dispatches a DAC drone for aerial confirmation, then runs a 4-step embodied-reasoning diagnostic with a LeKiwi + SO101 ground robot — with **Gemini Robotics-ER 1.6** providing spatial reasoning, a local **Gemma 4** (Ollama) fallback for cross-validated perception, and human-in-the-loop approval gates throughout.

End-to-end: satellite anomaly → confirmed diagnosis → work order, in under 3 minutes.

## Repo layout

```
davis-hack-26/
├── backend/                            # FastAPI + Google ADK agent + Gemini/Gemma VLM ensemble
│   ├── app/
│   │   ├── agent/                      # ADK agent loop, tools, ER policy translator
│   │   ├── api/                        # /execute, /runs, /risk, /plan routes
│   │   ├── domain/                     # risk engine + multi-cause irrigation pack
│   │   ├── sim/                        # drone + robot adapters with safety guards
│   │   └── vision/                     # Gemini ER + Gemma 4 + cross-validated ensemble
│   ├── tests/                          # 69 pytest tests (motion budgets, belief, ER loop)
│   └── scripts/                        # smoke tests for VLMs and sims
└── frontend/                           # React + Vite + Tailwind mobile-first phone app
    └── src/
        ├── pages/today/                # morning brief + alert review
        ├── pages/monitor/              # live agent timeline + field map + belief evolution
        ├── pages/orders/               # work orders + recent runs
        ├── components/monitor/         # timeline, stage cards, belief UI
        ├── lib/                        # api client, useRun hook, countdown hook
        └── data/                       # zone catalog (A/B/C/D ↔ A2/B3/C2/D2)
```

The DAC sims (`drone-sim-main`, `robotsims-main`) are **external dependencies** — clone and run them separately per the DAC hackathon instructions. They are not committed to this repo.

## Stack

- **Agent harness:** Google ADK — `LlmAgent`, `Runner`, `FunctionTool`, `before_tool_callback`
- **Orchestration brain:** Gemini 2.5 Pro
- **Embodied reasoning:** Gemini Robotics-ER 1.6 (preview) — emits `target_point [y, x]` + status
- **Local fallback VLM:** Gemma 4 (`gemma-4-31b-it`) via Ollama — cross-validates every frame
- **Backend:** FastAPI (Python 3.11+) + Pydantic + sse-starlette
- **Frontend:** React + TypeScript + Tailwind + Vite (mobile-first)
- **Drone sim:** Cesium-based 3D simulator (DAC)
- **Robot sim:** SO101 arm + LeKiwi base simulator (DAC)

## Getting started

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # add GEMINI_API_KEY, optionally OLLAMA_HOST
uvicorn app.main:app --reload --port 8000
```

`VLM_CLIENT=mock` in `.env` lets you run the full agent loop without LLM API keys — useful for offline dev and demo-day insurance.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev    # → http://localhost:5174
```

### 3. DAC sims (clone separately)

Both sims must run alongside the backend for the full pipeline. See `backend/README.md` for sim setup details.

### 4. Run the demo

Open `localhost:5174` on your phone (or a phone-sized browser viewport). The **Today** tab shows the morning brief; tap the alert card on Zone B to launch the agentic pipeline. Watch the timeline, approve the robot dispatch when prompted, then review the generated work order on the **Orders** tab.

## Tests

```bash
cd backend && python -m pytest tests/ -q
# 69 passed
```

Includes regression tests for motion budgets (no robot tip-overs), belief-evolution snapshots across the diagnostic loop, and ER policy closed-loop behaviour.

## The vision

> Single-zone NDVI alerts tell you *something* is wrong. AgriScout tells you exactly *what* — distinguishing pest / water / nutrient stress with physical evidence from a drone and a ground robot, all in the time it takes to make coffee. Compresses *detect → verify → diagnose → act* from days to minutes, with a human always in the loop.