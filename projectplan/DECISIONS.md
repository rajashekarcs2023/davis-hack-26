# Decision Log

Append-only log of architecture / scope decisions, with the reasoning that drove each one. Read this before changing anything labeled "decided".

Format: `[YYYY-MM-DD HH:MM] [status] short title` followed by Context / Decision / Consequences.

---

## [pre-event] [decided] Domain: agriculture (TerraScout) primary, wildfire-extension as stretch

**Context.** The drone sim ships with a built-in wildfire incident overlay (Airline Fire). Tempting to pivot to fire response. Project-idea.md is built around irrigation/NDVI.

**Decision.** Stick with agriculture as the demo domain. Add a wildfire "domain pack" as a stretch goal *only* if MVP is fully working — and only framed as **wildfire-driven crop protection** (saving the farm), not generic fire response. Reason: (a) we don't want to be "the team that re-shipped the sim's built-in demo"; (b) extending one agentic pipeline across two domains is a strictly stronger pitch than a single hardcoded one; (c) the wildfire pack reuses 90%+ of the code — domain-pack abstraction is cheap.

**Consequences.**
- `domain/packs/irrigation.py` is the MVP target. `domain/packs/wildfire.py` is gated behind a feature flag, not on the critical path.
- We override the drone sim's wildfire overlay with a field-zone overlay for the irrigation demo. The wildfire overlay code is kept as a reference for the stretch pack.
- Pitch story is "same agentic pipeline, two domains" — a dual-use product.

---

## [pre-event] [decided] Sim repos are external dependencies, not committed to our repo

**Context.** `drone-sim-main/` and `robotsims-main/` currently sit at the workspace root. They are DAC-published code; our hackathon submission shouldn't bundle them.

**Decision.** Treat both as external clones. Our repo holds only `backend/` and `frontend/`. README documents the clone-and-run instructions. Both folders go into `.gitignore`.

**Consequences.**
- Anyone running our app must `git clone` both DAC repos separately.
- We don't carry sim source-code drift.
- Backend integration is purely over HTTP/SSE — no source coupling.

---

## [pre-event] [decided] Sim port collision: patch drone-sim WS from 8765 → 8768

**Context.** Both DAC sims hardcode `ws://localhost:8765` for their browser-↔-bridge link. Cannot run simultaneously in default config. Verified at `drone-sim-main/src/simulator/external-api.ts:38` and `robotsims-main/src/simulator/external-api.ts:64`.

**Decision.** Patch the **drone sim**, not the robot sim, because (a) most DAC examples and grading hooks assume robot sim works as-shipped, and (b) drone HTTP `:8766` and robot HTTP `:8767` already differ — only the WS conflicts. Two-line patch: TS file + Python bridge.

**Consequences.**
- After patch: drone HTTP `:8766` / WS `:8768`; robot HTTP `:8767` / WS `:8765`.
- We document the patch in `architecture.md §9` so anyone re-cloning the drone sim can re-apply.
- Long-term: ideally upstream a config-via-env-var fix, but out of scope for hackathon.

---

## [pre-event] [decided] Drone teleport target: UCD_LOCATION (already in config)

**Context.** Drone sim is global Cesium with Google 3D tiles — the FPV view can be over anywhere on earth. The config file already exports `UCD_LOCATION = (lon: -121.7617, lat: 38.5382)`.

**Decision.** Default-teleport to UCD on startup. UC Davis is surrounded by Yolo County farmland — real photorealistic agriculture in the FPV view, no asset work needed. Aligns with HackDavis venue.

**Consequences.** Demo opens with a flyover of *real* California farmland. Strong opening visual. No custom 3D tile work required.

---

## [pre-event] [decided] LLM split: Claude is the orchestrator, Gemini Robotics-ER is the eyes

**Context.** `stackthoughts.md` analysis. Claude Agent SDK has the cleanest tool-use loop and is Anthropic-track-aligned for "Best AI/ML". Gemini Robotics-ER 1.6 is purpose-built for embodied / spatial reasoning over robot frames.

**Decision.** Claude runs the agentic loop and decides *what* to do (dispatch drone, ask for human approval, generate work order). Gemini Robotics-ER analyzes drone and robot frames and answers *what is visible*. Neither model directly executes action tokens — the Safety Guard does.

**Consequences.**
- We need both API keys before demo (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`).
- `VLMClient` is an interface with three implementations — primary, fallback, mock — so a single quota issue doesn't kill us.
- Tells two prize stories cleanly: Claude → Anthropic Best AI/ML; Gemini → DAC VLM/VLA + potentially Best Use of Gemini API.

---

## [pre-event] [decided] Action-token safety guard is mandatory between agent and sim

**Context.** Letting an LLM directly POST action tokens is the obvious failure mode judges will probe.

**Decision.** All action-token calls go through `sim/safety.py` which enforces: (a) per-sim whitelist of allowed tokens; (b) magnitude clamp `[0.0, 0.7]` (never 1.0 in demo); (c) max-actions-per-dispatch = 12; (d) drone altitude floor (8 m AGL) and ceiling (80 m AGL); (e) every reject reason is logged. The agent gets the rejection back and can re-plan.

**Consequences.** Demo is reproducible and bounded. We have a clean answer to "how do you stop the LLM doing something stupid" — it cannot, by construction.

---

## [pre-event] [decided] MVP scaffold scope — full backbone + agent + VLM (~20 files)

**Context.** User-driven choice: build a runnable MVP foundation pre-event so day-one is wiring + tuning rather than typing from blank files.

**Decision.** Pre-event scaffold delivers: FastAPI app, sim adapters, safety layer, anomaly engine, synthetic field grid, work-order templater, Claude agent skeleton with tool stubs, Gemini VLM client with Mock fallback, smoke tests, e2e demo script. Eval dataset generator scaffolded but full 300-sample run during the event. Frontend is teammates.

**Consequences.** Heavier review surface today, but day-one we can run `e2e_demo.py` against both sims without writing new code.

---

## [pre-event] [decided] Frontend API contract is locked at hour 1

**Context.** Frontend teammates can't be blocked on backend without compounding risk.

**Decision.** REST + SSE contract documented in `architecture.md §8`. Frontend stubs against this from minute one with a fixture server if backend isn't up.

**Consequences.** Backend team owns the contract; any breaking change must update §8 and ping frontend.

---

## [pre-event] [decided] Use Anthropic Messages API + manual tool loop, NOT Claude Agent SDK

**Context.** Stackthoughts.md and earlier guidance recommended "Claude Agent SDK as the main orchestrator." After reading `docs/claude-agentssdk.md` end-to-end:

- The Agent SDK is built around **Claude Code-style filesystem agents**: built-in tools are `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, etc.
- Custom tools (the kind we need: `dispatch_drone_to_zone`, `vlm_analyze_aerial`, etc.) are added via **MCP servers** — a real plumbing layer that's overkill for a hackathon.
- The doc itself directly compares: *"With the Client SDK, you implement a tool loop. With the Agent SDK, Claude handles it."* Our tools are not file-system tools; the Client SDK fits cleanly.

**Decision.** Use the **Anthropic Messages API directly with manual tool-use loop** in `backend/app/agent/claude_agent.py`. Claude Agent SDK is *not* a dependency. We can migrate later by exposing our tools as a local MCP server if it ever becomes worth it.

**Consequences.**
- Simpler stack, fewer moving parts at hackathon time.
- Pitch-wise we can still legitimately say "agentic loop with structured tool use" — that's exactly what we have. We just don't say "Claude Agent SDK."
- If a teammate sees the SDK referenced in old planning docs, this entry is the override.

---

## [pre-event] [decided] Gemini Robotics-ER 1.6 — config + pointing-style prompts

**Context.** `docs/gemini-robotics.md` was added. Verified the SDK surface and recommended config against my initial implementation in `backend/app/vision/gemini_er.py`.

**Decision.**
- **API surface kept as-is** — `from google import genai`, `client.aio.models.generate_content(...)`, `types.Part.from_bytes(...)`, `types.GenerateContentConfig(...)`. Confirmed correct.
- **Config tuned to match docs:** `temperature=1.0` (was 0.1) and `thinking_config=types.ThinkingConfig(thinking_budget=N)` — `N=0` for fast aerial detection, `N=256` for ground analysis (multi-class evidence). Per the doc: *"For spatial understanding tasks like object detection, the model can achieve high performance with a small thinking budget. More complex reasoning tasks ... benefit from a larger thinking budget."*
- **Prompt rewrite to use Gemini Robotics-ER's native pointing format.** The model's specialty is returning `[y, x]` 0..1000 normalized coordinates of objects/regions. We now ask for `evidence_points: [{"point": [y, x], "label": ...}]` instead of just a boolean. This is the killer demo upgrade: frontend can overlay these points on the live drone/robot frame and show *exactly what the VLM saw*.
- **Schema additions:** `EvidencePoint` model in `backend/app/schemas.py`, `evidence_points` field on `AerialAnalysis` and `GroundAnalysis`. Mock VLM emits the same shape so frontend code is identical regardless of backend.

**Consequences.**
- Stronger pitch — we use Gemini Robotics-ER's *signature* capability instead of generic VLM Q&A.
- Frontend gets a clear, well-defined visualization story (overlay points on FPV frame).
- Slight latency hit on ground analysis from `thinking_budget=256`, but worth it for evidence quality.
- Mock VLM and real Gemini emit the same schema — demo-day fallback is invisible to the frontend.

---

## Template for future entries

```text
## [date] [proposed|decided|reverted] short title
**Context.** What forced the decision.
**Decision.** What we chose.
**Consequences.** What this enables / forecloses / costs.
```
