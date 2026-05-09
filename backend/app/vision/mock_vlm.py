"""Deterministic VLM fixture for demo-day insurance and offline development.

Output is a function of the zone (not the frame), so the demo always tells the
same story even if the network is down. The fixture is intentionally
*conservative*: it never hallucinates an issue that the anomaly engine didn't
already suggest.

Evidence-point coordinates use the same `[y, x]` 0..1000 convention as
Gemini Robotics-ER (`docs/gemini-robotics.md`) so the frontend overlay code
is identical regardless of which VLM produced the analysis.
"""

from __future__ import annotations

from app.schemas import AerialAnalysis, AnomalyPattern, EvidencePoint, GroundAnalysis, Zone


def _pt(y: int, x: int, label: str) -> EvidencePoint:
    return EvidencePoint(point=[y, x], label=label)


class MockVLMClient:
    name = "mock"

    async def analyze_aerial(self, frame_b64: str, zone: Zone) -> AerialAnalysis:  # noqa: ARG002
        score = zone.anomaly_score
        if score < 0.2:
            return AerialAnalysis(
                visible=False,
                confidence=0.85,
                evidence=["uniform canopy color", "rows look intact"],
                evidence_points=[],
                recommend_ground_truth=False,
            )
        if zone.pattern == AnomalyPattern.ROW_ALIGNED and score >= 0.5:
            return AerialAnalysis(
                visible=True,
                confidence=0.88,
                evidence=[
                    "yellowing along a single row",
                    "darker soil patch consistent with reduced canopy",
                    "neighboring rows look healthier",
                ],
                evidence_points=[
                    _pt(420, 510, "yellowed row segment"),
                    _pt(560, 530, "yellowed row segment"),
                    _pt(700, 540, "exposed dry soil"),
                ],
                recommend_ground_truth=True,
            )
        if zone.pattern == AnomalyPattern.PATCHY and score >= 0.4:
            return AerialAnalysis(
                visible=True,
                confidence=0.7,
                evidence=["scattered low-vigor patches", "no clear row alignment"],
                evidence_points=[
                    _pt(380, 420, "stressed patch"),
                    _pt(620, 690, "stressed patch"),
                ],
                recommend_ground_truth=True,
            )
        return AerialAnalysis(
            visible=score >= 0.35,
            confidence=0.6,
            evidence=["mild canopy irregularity"],
            evidence_points=[_pt(500, 500, "mild discoloration")] if score >= 0.35 else [],
            recommend_ground_truth=score >= 0.5,
        )

    async def analyze_ground(self, frame_b64: str, zone: Zone) -> GroundAnalysis:  # noqa: ARG002
        score = zone.anomaly_score
        if score < 0.2:
            return GroundAnalysis(
                dry_soil=False,
                wilted_leaves=False,
                damaged_drip_line=False,
                other_evidence=["soil moisture appears normal"],
                evidence_points=[],
                confidence=0.8,
            )
        if zone.pattern == AnomalyPattern.ROW_ALIGNED and score >= 0.5:
            return GroundAnalysis(
                dry_soil=True,
                wilted_leaves=True,
                damaged_drip_line=True,
                other_evidence=["visible drip emitter clog near plant base"],
                evidence_points=[
                    _pt(820, 480, "dry soil"),
                    _pt(420, 530, "wilted leaf"),
                    _pt(680, 720, "drip damage"),
                ],
                confidence=0.86,
            )
        if zone.pattern == AnomalyPattern.PATCHY and score >= 0.4:
            return GroundAnalysis(
                dry_soil=False,
                wilted_leaves=True,
                damaged_drip_line=False,
                other_evidence=["leaf yellowing localized to a few plants"],
                evidence_points=[_pt(450, 500, "wilted leaf"), _pt(580, 620, "wilted leaf")],
                confidence=0.7,
            )
        return GroundAnalysis(
            dry_soil=score >= 0.6,
            wilted_leaves=score >= 0.5,
            damaged_drip_line=False,
            other_evidence=["mild stress visible"],
            evidence_points=[_pt(500, 500, "stress")] if score >= 0.5 else [],
            confidence=0.65,
        )
