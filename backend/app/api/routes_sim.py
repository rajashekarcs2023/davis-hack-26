"""Passthrough endpoints for sim state + latest camera frame.

These exist so the frontend can render the live drone/robot state and overlay
VLM `evidence_points` on the latest camera frame *without* talking to the DAC
bridges directly (which would be a CORS/origin headache and an architectural
leak). The frame caches already maintain a long-lived SSE subscription per sim;
these endpoints just hand back the cached values.
"""

from __future__ import annotations

import time

from fastapi import APIRouter

from app.schemas import DroneState, RobotState
from app.sim.drone_adapter import get_drone_adapter
from app.sim.frame_grabber import get_drone_frame_cache, get_robot_frame_cache
from app.sim.robot_adapter import get_robot_adapter

router = APIRouter()


@router.get("/api/drone/state", response_model=DroneState)
async def drone_state() -> DroneState:
    """Latest drone telemetry (lat/lon/altAgl/heading/speed)."""
    return await get_drone_adapter().get_state()


@router.get("/api/robot/state", response_model=RobotState)
async def robot_state() -> RobotState:
    """Latest robot telemetry (joints, base_pose, task_status)."""
    return await get_robot_adapter().get_state()


@router.get("/api/drone/frame")
async def drone_frame() -> dict:
    """Latest cached drone FPV frame.

    Returns a JSON envelope rather than raw bytes so the frontend can render
    the timestamp alongside the image and can decide between `<img src=jpeg_b64>`
    or rendering on canvas with the `evidence_points` overlay.
    """
    cache = get_drone_frame_cache()
    return {
        "available": cache.latest_b64 is not None,
        "jpeg_b64": cache.latest_b64,
        "data_url": f"data:image/jpeg;base64,{cache.latest_b64}" if cache.latest_b64 else None,
        "fetched_at": time.time(),
    }


@router.get("/api/robot/frame")
async def robot_frame() -> dict:
    """Latest cached robot wrist-cam frame (same envelope as the drone frame)."""
    cache = get_robot_frame_cache()
    return {
        "available": cache.latest_b64 is not None,
        "jpeg_b64": cache.latest_b64,
        "data_url": f"data:image/jpeg;base64,{cache.latest_b64}" if cache.latest_b64 else None,
        "fetched_at": time.time(),
    }
