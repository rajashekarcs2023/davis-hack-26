# AgriScout Backend

FastAPI service that orchestrates the AgriScout agentic loop: anomaly detection → Google ADK agent (Gemini 2.5 Pro) → Gemini Robotics-ER + Gemma 4 VLM ensemble → DAC drone + LeKiwi/SO101 robot → farmer-approved work order.

See the top-level `README.md` for the product overview. This README covers how to run the backend.

## Prereqs

- Python 3.11+
- The two DAC sims cloned and runnable (see "Sim setup" below).

## Install

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# fill in GEMINI_API_KEY (and optionally OLLAMA_HOST for the local Gemma 4 fallback)
```

`VLM_CLIENT=mock` in `.env` lets you run the full loop without LLM API keys — useful for first-day setup and demo-day insurance.

## Sim setup (one-time)

Both DAC sims need to run alongside this backend.

### Robot sim (LeKiwi + SO101)

```bash
git clone https://github.com/Davis-Autonomy-Club/robotsims.git
cd robotsims
npm install
npm run dev          # serves at :5173
# in another terminal:
pip install websockets
python3 api-bridge.py   # HTTP :8767, WS :8765
```

### Drone sim (Cesium FPV)

```bash
git clone <drone-sim repo>     # supplied by DAC at the venue
cd drone-sim-main
# REQUIRED port-collision patch — both sims default to WS :8765
sed -i '' 's|ws://localhost:8765|ws://localhost:8768|' src/simulator/external-api.ts
sed -i '' 's|WS_PORT = 8765|WS_PORT = 8768|' api-bridge.py

npm install
# Cesium token + Google 3D tiles key go in drone-sim-main/.env
npm run dev          # serves at :5174 (Vite picks next free port)
python3 api-bridge.py   # HTTP :8766, WS :8768 (after patch)
```

After the patch:

| Component | HTTP    | WS      |
| --------- | ------- | ------- |
| Drone sim | `:8766` | `:8768` |
| Robot sim | `:8767` | `:8765` |
| Backend   | `:8000` | (none)  |

## Run

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Then:

```bash
# Sanity
curl http://localhost:8000/api/health

# What anomalies does the field have right now?
curl http://localhost:8000/api/anomaly | python3 -m json.tool

# Run the hardcoded end-to-end demo (no LLM required)
curl -X POST http://localhost:8000/api/demo/execute
```

## Smoke tests

```bash
python3 -m scripts.smoke_test_drone     # POSTs an action, verifies state changed
python3 -m scripts.smoke_test_robot     # POSTs an action, verifies state changed
python3 -m scripts.e2e_demo             # full hardcoded scripted run
```

## Generate the eval dataset

```bash
python3 -m scripts.generate_eval_dataset --n 300 --seed 42
```

This writes `app/data/eval_scenes.json`. The metrics endpoint computes precision / recall / F1 against the held-out 30 unseen scenes.

## Layout

```
backend/
├── app/
│   ├── main.py                # FastAPI entry, route wiring, CORS, SSE
│   ├── config.py              # env vars + safety bounds
│   ├── schemas.py             # Pydantic models
│   ├── api/                   # REST + SSE endpoints
│   ├── agent/                 # Google ADK orchestration (Gemini 2.5 Pro) + tools + ER policy translator
│   ├── vision/                # VLM clients: Gemini Robotics-ER 1.6 + Gemma 4 (Ollama) + cross-validated ensemble
│   ├── sim/                   # drone + robot HTTP adapters + safety guard
│   ├── domain/                # anomaly engine, work-order templater, packs
│   └── data/                  # field grid, eval set, run logs
└── scripts/                   # smoke tests + dataset generator + e2e demo
```

