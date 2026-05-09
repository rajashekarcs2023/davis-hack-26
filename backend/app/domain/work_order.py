"""Work-order builder.

Takes the artifacts of a run (anomaly + plan + VLM evidence) and produces the
farmer-facing summary. Plain templating; no LLM call here so the output is
deterministic and never the cause of a demo failure.
"""

from __future__ import annotations

import uuid

from app.schemas import (
    AerialAnalysis,
    GroundAnalysis,
    InspectionPlan,
    WorkOrder,
    Zone,
)


def build_work_order(
    zone: Zone,
    plan: InspectionPlan,
    aerial: AerialAnalysis | None,
    ground: GroundAnalysis | None,
) -> WorkOrder:
    evidence: list[str] = [
        f"Satellite NDVI drop of {zone.ndvi_drop:.2f} (zone NDVI {zone.ndvi:.2f} vs baseline {zone.ndvi_baseline:.2f}).",
        f"Anomaly score {zone.anomaly_score:.2f}; pattern: {zone.pattern.value}.",
        f"Neighbor-zone average NDVI: {zone.neighbor_avg_ndvi:.2f}.",
    ]
    if aerial and aerial.evidence:
        line = "Aerial verification: " + "; ".join(aerial.evidence)
        if aerial.evidence_points:
            line += f" ({len(aerial.evidence_points)} pinned location(s) on the drone frame)"
        evidence.append(line)
    if ground:
        ground_bits: list[str] = []
        if ground.dry_soil:
            ground_bits.append("dry/cracked soil")
        if ground.wilted_leaves:
            ground_bits.append("wilted leaves")
        if ground.damaged_drip_line:
            ground_bits.append("damaged drip line")
        ground_bits.extend(ground.other_evidence or [])
        if ground_bits:
            line = "Ground inspection: " + ", ".join(ground_bits) + "."
            if ground.evidence_points:
                line += f" ({len(ground.evidence_points)} pinned location(s) on the wrist-cam frame)"
            evidence.append(line)

    recommended = (
        f"Inspect irrigation infrastructure adjacent to Zone {zone.zone_id} within "
        f"{'24 hours' if plan.urgency == 'high' else '72 hours'}."
    )

    return WorkOrder(
        work_order_id=f"WO-{uuid.uuid4().hex[:8].upper()}",
        zone_id=zone.zone_id,
        issue=plan.likely_issue,
        priority=plan.urgency,
        evidence=evidence,
        recommended_action=recommended,
    )
