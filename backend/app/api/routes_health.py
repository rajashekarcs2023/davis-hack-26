"""GET /api/health — used by frontend to gate the demo UI."""

from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.config import settings
from app.schemas import HealthResponse
from app.sim.drone_adapter import get_drone_adapter
from app.sim.robot_adapter import get_robot_adapter

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    drone = get_drone_adapter()
    robot = get_robot_adapter()
    drone_alive = await drone.is_alive()
    robot_alive = await robot.is_alive()
    return HealthResponse(
        ok=True,
        sims={"drone": drone_alive, "robot": robot_alive},
        vlm=settings.vlm_client,
        has_anthropic=settings.has_anthropic,
        has_google=settings.has_google,
        version=__version__,
    )
