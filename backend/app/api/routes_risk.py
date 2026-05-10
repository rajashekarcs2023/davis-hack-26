"""GET /api/risk/{zone_id} — multi-input risk assessment for AgriScout.

Surfaces the data behind the mobile app's "Why drone now?" panel:
satellite anomaly, weather pest risk, soil moisture, historical hotspot risk,
combined score, and the IGNORE / MONITOR / SEND_DRONE decision.

The underlying logic lives in `app/domain/risk_engine.py`; this module is
just a thin HTTP wrapper that maps `ValueError` (unknown zone) to a 404 so
the frontend gets a clean error response instead of a 500.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.domain.risk_engine import assess_risk
from app.schemas import RiskAssessment

router = APIRouter()


@router.get("/api/risk/{zone_id}", response_model=RiskAssessment)
def get_risk(zone_id: str) -> RiskAssessment:
    try:
        return assess_risk(zone_id)
    except ValueError as exc:
        # `assess_risk` raises ValueError when the zone id isn't in the
        # field grid. Translate to 404 so the frontend can show a "no such
        # zone" message instead of a generic server error.
        raise HTTPException(status_code=404, detail=str(exc)) from exc
