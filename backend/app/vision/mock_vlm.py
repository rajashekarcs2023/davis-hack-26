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

from app.schemas import (
    AerialAnalysis,
    AnomalyPattern,
    ErPolicyStep,
    EvidencePoint,
    GroundAnalysis,
    LeafEvidence,
    Zone,
)


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

    async def analyze_leaf(
        self,
        frame_b64: str,  # noqa: ARG002
        zone: Zone,
        mode: str,
    ) -> LeafEvidence:
        """Deterministic leaf-inspection fixture used on demo-day fallback.

        The demo story (per `final.md`): affected plant in zone B3 shows
        strong pest signatures (stippling + webbing); other zones show weaker,
        ambiguous evidence. Healthy-reference scans always come back clean —
        that's the differential signal the agent uses to tip belief toward a
        localized pest hotspot vs a field-wide stress.
        """
        if mode == "healthy_reference":
            return LeafEvidence(
                stippling=False,
                webbing=False,
                egg_masses=False,
                discoloration=False,
                other=["healthy reference plant; no pest signatures"],
                confidence=0.78,
                evidence_points=[],
            )

        # "affected_plant" path — zone-dependent so the demo arc is reproducible.
        is_demo_hotspot = zone.zone_id == "B3"
        if is_demo_hotspot:
            return LeafEvidence(
                stippling=True,
                webbing=True,
                egg_masses=False,
                discoloration=True,
                other=[
                    "fine pin-prick stippling on upper leaf surface",
                    "silk webbing along midrib",
                ],
                confidence=0.81,
                evidence_points=[
                    _pt(420, 510, "stippling"),
                    _pt(610, 480, "webbing"),
                ],
            )
        # Non-demo zones: weaker, ambiguous leaf evidence so the belief
        # doesn't confidently tip toward pest.
        return LeafEvidence(
            stippling=False,
            webbing=False,
            egg_masses=False,
            discoloration=False,
            other=["mild leaf curl; cause indeterminate"],
            confidence=0.45,
            evidence_points=[],
        )

    async def analyze_er_policy(
        self,
        frame_b64: str,  # noqa: ARG002
        zone: Zone,
        goal: str,  # noqa: ARG002
        current_pose: dict[str, float],
    ) -> ErPolicyStep:
        """Deterministic ER-style embodied-reasoning fixture.

        Simulates a VLA policy pointing the wrist cam toward the leaf
        hotspot. Convergence heuristic uses `Wrist_Pitch` as the progress
        signal — that's the joint the translator actually advances each
        iteration (each mid-phase target emits `wrist_down`). Progression:

            start (Wrist_Pitch > -30): big reach-down, target [800, 510]
                                        → wrist_down(0.5) + shoulder_down(0.3)
            mid   (-60 < Wrist ≤ -30):  fine-tune, target [620, 510]
                                        → wrist_down(0.4)
            done  (Wrist_Pitch ≤ -60):  status = "arrived"

        With the real-sim translator behavior (~45° per magnitude*90°), the
        loop converges in 2-3 iterations on B3.

        Y targets are >500 so they drive DOWNWARD wrist motion in the
        translator (affected leaf is below the robot's forward gaze).
        """
        wrist_pitch = current_pose.get("Wrist_Pitch", 0.0)
        is_demo = zone.zone_id == "B3"

        # --- Arrived: wrist cam aimed down far enough to see the leaf
        if wrist_pitch <= -60.0:
            return ErPolicyStep(
                target_point=[500, 500],  # centered — no further movement
                status="arrived",
                reasoning=(
                    "Wrist cam now aimed at affected leaf — pest signatures "
                    "visible in the view. Ready for close-range VLM."
                    if is_demo
                    else "Arm positioned over zone centre; no obvious cues."
                ),
            )

        # --- Mid: wrist partly tilted, fine-tune toward leaf
        if wrist_pitch < -30.0:
            target = [620, 510] if is_demo else [580, 500]
            return ErPolicyStep(
                target_point=target,
                status="navigating",
                reasoning=(
                    "Leaf visible in lower half of frame; final small "
                    "wrist-down adjustment to centre on the stippling pattern."
                    if is_demo
                    else "Centring on the zone; one more small adjustment."
                ),
            )

        # --- Start: wrist near-neutral, need a larger downward push
        target = [800, 510] if is_demo else [700, 500]
        return ErPolicyStep(
            target_point=target,
            status="navigating",
            reasoning=(
                "Affected leaf is in the plant row below current gaze; need "
                "to tilt shoulder down and aim wrist cam toward the lower "
                "part of the frame."
                if is_demo
                else "Scanning zone from above; need to reach down into the row."
            ),
        )
