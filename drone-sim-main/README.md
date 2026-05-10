# DAC CesiumSim for Hackers

This repo is the hackathon starter simulator for building VLM/VLA-controlled drone behavior.
Treat it as **Stage 0**: stable base simulator + external API bridge + action-token interface for your agent loop.

## Start Here

- Quick setup and API usage: [`HACKATHON.md`](./HACKATHON.md)
- Full architecture + action-token concepts: [`HACKER_GUIDE.md`](./HACKER_GUIDE.md)

If you only read one file before coding, read `HACKER_GUIDE.md`.

## Quick Launch

1. `npm run dev`
2. `python api-bridge.py`
3. Open the local Vite URL shown in terminal (usually `http://localhost:4173`)

## What You Build

Your controller (Python or otherwise) should:

1. read frames from `GET /frames` (SSE),
2. optionally read telemetry from `GET /state`,
3. choose an action token,
4. send it with `POST /action`.

Supported action tokens:

- `forward`
- `backward`
- `left`
- `right`
- `ascend`
- `descend`
- `rotate_cw`
- `rotate_ccw`

`magnitude` controls duration from `0.0` to `1.0`.

## In-Sim Controls (manual debug)

- `W` / `S`: ascend / descend
- `Arrow Up` / `Arrow Down`: forward / backward
- `A` / `D`: strafe left / right
- `Arrow Left` / `Arrow Right`: yaw
- `C`: toggle FPV camera
- `R`: reset spawn

## Hackathon Intent

This codebase is intentionally designed to be extended by teams:

- plug in your VLM/VLA policy,
- add smarter token selection and planning,
- improve mission logic and evaluation,
- iterate quickly without rewriting simulator internals.
