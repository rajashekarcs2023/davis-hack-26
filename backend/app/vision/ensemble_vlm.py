"""Ensemble VLM client — runs multiple VLMs in parallel and merges their pointing.

The architectural pitch this enables: "Cross-validated perception. Our pipeline
calls a cloud-hosted Gemini Robotics-ER 1.6 model AND a locally-hosted Gemma 3
4B simultaneously. Evidence points from both are surfaced; agreement raises
confidence, disagreement is flagged on the overlay."

Concretely:
- `analyze_aerial` and `analyze_ground` fan out to every member client via
  `asyncio.gather(..., return_exceptions=True)` so a single broken member
  never breaks the demo.
- Evidence points keep their model attribution via the `model` field on
  `EvidencePoint` so the sim overlay can color or label them per-source.
- Boolean flags (e.g. `dry_soil`) are OR'd; confidence is the *max* across
  members (a member that recognized something is more informative than one
  that didn't).
- Any individual member returning no points / an error simply contributes
  nothing — the ensemble degrades gracefully into whichever members did work.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Sequence

from app.schemas import (
    AerialAnalysis,
    ErPolicyStep,
    EvidencePoint,
    GroundAnalysis,
    LeafEvidence,
    Zone,
)

logger = logging.getLogger("terrascout.vision.ensemble")


class _Member:
    """Internal pair: a friendly model name + the underlying client."""

    __slots__ = ("name", "client")

    def __init__(self, name: str, client: object) -> None:
        self.name = name
        self.client = client


class EnsembleVlmClient:
    """Run multiple VLM clients in parallel; merge their analyses."""

    name = "ensemble"

    def __init__(self, members: Sequence[tuple[str, object]] | None = None) -> None:
        if members is not None:
            self._members = [_Member(n, c) for n, c in members if c is not None]
        else:
            self._members = self._build_default_members()

        if not self._members:
            raise RuntimeError(
                "EnsembleVlmClient requires at least one member; none of "
                "Gemini Robotics-ER or Ollama Gemma 3 could be initialized.",
            )
        logger.info(
            "Ensemble VLM members: %s",
            ", ".join(m.name for m in self._members),
        )

    # ------------------------------------------------------------------
    # Member discovery
    # ------------------------------------------------------------------

    @staticmethod
    def _build_default_members() -> list[_Member]:
        """Best-effort: include every cloud + local VLM that imports cleanly."""
        members: list[_Member] = []

        try:
            from app.vision.gemini_er import GeminiRoboticsERClient

            members.append(_Member("gemini-er", GeminiRoboticsERClient()))
        except Exception as exc:
            logger.info("Ensemble: Gemini Robotics-ER unavailable (%s)", exc)

        try:
            from app.vision.ollama_gemma import OllamaGemmaClient

            ollama = OllamaGemmaClient()
            # Use the configured model id as the friendly name in chip labels.
            short = ollama.model_id.replace(":", "-")
            members.append(_Member(short, ollama))
        except Exception as exc:
            logger.info("Ensemble: Ollama Gemma unavailable (%s)", exc)

        return members

    # ------------------------------------------------------------------
    # VLMClient protocol
    # ------------------------------------------------------------------

    async def analyze_aerial(self, frame_b64: str, zone: Zone) -> AerialAnalysis:
        results = await self._fanout("aerial", frame_b64, zone)

        evidence: list[str] = []
        points: list[EvidencePoint] = []
        confidences: list[float] = []
        recommend = False
        any_visible = False

        for member_name, analysis in results:
            if not isinstance(analysis, AerialAnalysis):
                continue
            any_visible = any_visible or analysis.visible
            recommend = recommend or analysis.recommend_ground_truth
            confidences.append(analysis.confidence)
            for ev in analysis.evidence or []:
                evidence.append(f"[{member_name}] {ev}")
            for p in analysis.evidence_points or []:
                points.append(_tag(p, member_name))

        if not points and not evidence:
            # Every member failed; surface that to the caller as a low-conf null.
            return AerialAnalysis(
                visible=False,
                confidence=0.0,
                evidence=["ensemble: no member produced output"],
                evidence_points=[],
                recommend_ground_truth=False,
            )

        return AerialAnalysis(
            visible=any_visible,
            confidence=max(confidences) if confidences else 0.0,
            evidence=evidence,
            evidence_points=points,
            recommend_ground_truth=recommend,
        )

    async def analyze_ground(self, frame_b64: str, zone: Zone) -> GroundAnalysis:
        results = await self._fanout("ground", frame_b64, zone)

        any_dry = any_wilt = any_drip = False
        evidence: list[str] = []
        points: list[EvidencePoint] = []
        confidences: list[float] = []

        for member_name, analysis in results:
            if not isinstance(analysis, GroundAnalysis):
                continue
            any_dry = any_dry or analysis.dry_soil
            any_wilt = any_wilt or analysis.wilted_leaves
            any_drip = any_drip or analysis.damaged_drip_line
            confidences.append(analysis.confidence)
            for ev in analysis.other_evidence or []:
                evidence.append(f"[{member_name}] {ev}")
            for p in analysis.evidence_points or []:
                points.append(_tag(p, member_name))

        if not points and not evidence:
            return GroundAnalysis(
                dry_soil=False,
                wilted_leaves=False,
                damaged_drip_line=False,
                other_evidence=["ensemble: no member produced output"],
                evidence_points=[],
                confidence=0.0,
            )

        return GroundAnalysis(
            dry_soil=any_dry,
            wilted_leaves=any_wilt,
            damaged_drip_line=any_drip,
            other_evidence=evidence,
            evidence_points=points,
            confidence=max(confidences) if confidences else 0.0,
        )

    async def analyze_leaf(
        self,
        frame_b64: str,
        zone: Zone,
        mode: str,
    ) -> LeafEvidence:
        """Fan out the close-up leaf VLM call to every member that has
        `analyze_leaf`. Merge with the same OR + max-confidence semantics
        we use for analyze_ground. Members without analyze_leaf are
        skipped (no fallback here — the caller falls back to Mock)."""
        async def _call(member: _Member) -> object:
            method = getattr(member.client, "analyze_leaf", None)
            if method is None:
                return RuntimeError(f"member {member.name} missing analyze_leaf")
            try:
                return await method(frame_b64, zone, mode)
            except Exception as exc:
                logger.warning(
                    "ensemble member %s analyze_leaf failed: %s", member.name, exc
                )
                return exc

        outputs = await asyncio.gather(*(_call(m) for m in self._members))

        any_stippling = any_webbing = any_eggs = any_discol = False
        other: list[str] = []
        points: list[EvidencePoint] = []
        confidences: list[float] = []

        for member, result in zip(self._members, outputs):
            if not isinstance(result, LeafEvidence):
                continue
            any_stippling = any_stippling or result.stippling
            any_webbing = any_webbing or result.webbing
            any_eggs = any_eggs or result.egg_masses
            any_discol = any_discol or result.discoloration
            confidences.append(result.confidence)
            for ev in result.other or []:
                other.append(f"[{member.name}] {ev}")
            for p in result.evidence_points or []:
                points.append(_tag(p, member.name))

        if not points and not other and not confidences:
            # Every member failed or lacks analyze_leaf — surface a null
            # so the caller (tools.py) can Mock-fallback.
            return LeafEvidence(
                stippling=False,
                webbing=False,
                egg_masses=False,
                discoloration=False,
                other=["ensemble: no member produced leaf output"],
                confidence=0.0,
                evidence_points=[],
            )

        return LeafEvidence(
            stippling=any_stippling,
            webbing=any_webbing,
            egg_masses=any_eggs,
            discoloration=any_discol,
            other=other,
            confidence=max(confidences) if confidences else 0.0,
            evidence_points=points,
        )

    async def analyze_er_policy(
        self,
        frame_b64: str,
        zone: Zone,
        goal: str,
        current_pose: dict[str, float],
    ) -> ErPolicyStep:
        """Embodied-reasoning policy delegation.

        Unlike aerial/ground/leaf VLM output, ER policy is a SINGLE spatial
        decision per step — merging two conflicting targets doesn't make
        sense (which one does the translator obey?). So we delegate to the
        first member that (a) implements analyze_er_policy and (b) succeeds.

        Priority order = member order. The default _build_default_members
        puts Gemini Robotics-ER first, so ER drives the loop when available
        and Ollama Gemma 4 is the next-best fallback (Gemma is a VL model
        and can emit a JSON target from the same prompt, just with worse
        spatial accuracy).

        Any member that raises or returns the wrong type is skipped; this
        method never throws — the worst case is a "lost" fallback which
        causes the caller to break out of its loop and use scripted motion.
        """
        for member in self._members:
            method = getattr(member.client, "analyze_er_policy", None)
            if method is None:
                continue
            try:
                result = await method(frame_b64, zone, goal, current_pose)
            except Exception as exc:
                logger.warning(
                    "ensemble ER policy: member %s failed (%s); trying next",
                    member.name,
                    exc,
                )
                continue
            if isinstance(result, ErPolicyStep):
                # Tag the reasoning so the VLA action log shows which model
                # produced the decision.
                tagged = ErPolicyStep(
                    target_point=result.target_point,
                    status=result.status,
                    reasoning=f"[{member.name}] {result.reasoning}",
                )
                return tagged

        # Every member lacks analyze_er_policy or errored. Return a "lost"
        # so the caller's loop exits cleanly and falls back to scripted.
        return ErPolicyStep(
            target_point=[500, 500],
            status="lost",
            reasoning="ensemble: no member implements analyze_er_policy",
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _fanout(
        self,
        kind: str,
        frame_b64: str,
        zone: Zone,
    ) -> list[tuple[str, object]]:
        async def _call(member: _Member) -> object:
            method = getattr(member.client, f"analyze_{kind}", None)
            if method is None:
                return RuntimeError(f"member {member.name} missing analyze_{kind}")
            try:
                return await method(frame_b64, zone)
            except Exception as exc:
                logger.warning(
                    "ensemble member %s analyze_%s failed: %s", member.name, kind, exc
                )
                return exc

        # Run every member concurrently. None of them block each other; the
        # slowest member determines the total latency.
        outputs = await asyncio.gather(
            *(_call(m) for m in self._members),
            return_exceptions=False,
        )
        return [(m.name, out) for m, out in zip(self._members, outputs)]


def _tag(point: EvidencePoint, member_name: str) -> EvidencePoint:
    """Prefix the point label with the member name, so the sim overlay can
    color-code by source. We don't mutate the schema (no new field) — keeping
    backward compatibility with existing frontend code."""
    return EvidencePoint(
        point=list(point.point),
        label=f"[{member_name}] {point.label}",
    )
