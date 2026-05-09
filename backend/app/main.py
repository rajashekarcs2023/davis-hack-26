"""FastAPI entry point.

Wires routes, CORS, lifespan tasks (frame caches), and a logger.
Run with `uvicorn app.main:app --reload --port 8000`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    routes_anomaly,
    routes_approval,
    routes_execute,
    routes_health,
    routes_metrics,
    routes_plan,
    routes_runs,
    routes_sim,
)
from app.config import settings
from app.sim.frame_grabber import get_drone_frame_cache, get_robot_frame_cache

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)-7s %(name)s :: %(message)s",
)
logger = logging.getLogger("terrascout")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    drone_frames = get_drone_frame_cache()
    robot_frames = get_robot_frame_cache()
    await drone_frames.start()
    await robot_frames.start()
    logger.info("Frame caches started")
    try:
        yield
    finally:
        await drone_frames.stop()
        await robot_frames.stop()
        logger.info("Frame caches stopped")


app = FastAPI(
    title="TerraScout AI Backend",
    description="Agentic field-triage over DAC drone + robot sims.",
    version="0.1.0",
    lifespan=lifespan,
)

if settings.enable_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Routes
app.include_router(routes_health.router)
app.include_router(routes_anomaly.router)
app.include_router(routes_plan.router)
app.include_router(routes_execute.router)
app.include_router(routes_approval.router)
app.include_router(routes_runs.router)
app.include_router(routes_metrics.router)
app.include_router(routes_sim.router)


@app.get("/")
def root() -> dict:
    return {
        "service": "TerraScout AI Backend",
        "docs": "/docs",
        "health": "/api/health",
    }
