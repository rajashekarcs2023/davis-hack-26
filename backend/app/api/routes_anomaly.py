"""GET /api/field, /api/anomaly, /api/anomaly/{zone_id}."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.domain.anomaly_engine import (
    annotate_grid,
    classify_zone,
    load_field_grid,
    rank_anomalies,
)
from app.schemas import FieldGrid, Zone

router = APIRouter()


@router.get("/api/field", response_model=FieldGrid)
def get_field() -> FieldGrid:
    return annotate_grid(load_field_grid())


@router.get("/api/anomaly", response_model=list[Zone])
def get_anomalies(top_k: int = 5) -> list[Zone]:
    grid = annotate_grid(load_field_grid())
    return rank_anomalies(grid, top_k=top_k)


@router.get("/api/anomaly/{zone_id}")
def get_anomaly(zone_id: str) -> dict:
    grid = annotate_grid(load_field_grid())
    by_id = {z.zone_id: z for z in grid.zones}
    if zone_id not in by_id:
        raise HTTPException(status_code=404, detail=f"zone {zone_id} not found")
    z = by_id[zone_id]
    cls = classify_zone(z)
    return {
        "zone": z.model_dump(),
        "classification": {
            "label": cls.label.value,
            "confidence": round(cls.confidence, 3),
            "reasoning": cls.reasoning,
        },
    }
