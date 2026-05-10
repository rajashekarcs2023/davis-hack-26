# TerraScout AI — HackDavis 2026

**Satellite detects. Claude reasons. Gemini sees. DAC robots verify. Farmer approves.**

TerraScout is a satellite-guided, agentic field-triage system for crop water stress. A Claude agent reads satellite NDVI anomalies, dispatches a DAC drone for aerial verification, optionally dispatches a LeKiwi ground robot for close-up ground-truthing, and produces a farmer-approved work order — with a Gemini Robotics-ER vision model providing embodied reasoning over the drone and robot camera frames.

## Repo layout

```
davis-hack-26/
├── projectplan/              # plan + architecture + decision log
│   ├── project-idea.md       # original product brief
│   ├── execution.md          # historical, partly stale
│   ├── stackthoughts.md      # LLM stack analysis
│   ├── architecture.md       # ← single source of truth
│   └── DECISIONS.md          # running decision log
├── backend/                  # FastAPI + Claude agent + Gemini VLM + sim adapters
└── frontend/                 # mobile-first web app (added by frontend team)
```

The DAC sims (`drone-sim-main`, `robotsims-main`) are **external dependencies** — clone and run them separately per the DAC instructions. They are not committed to this repo.

## Getting started

Read the architecture doc first: `projectplan/architecture.md`. It is the source of truth and overrides earlier planning docs where they conflict.

For backend setup: see `backend/README.md`.

## The vision

> Small farms lose ~10% of yield to undetected irrigation faults. TerraScout compresses *detect → verify → act* from days to minutes, with a human always in the loop.