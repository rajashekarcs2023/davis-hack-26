"""Centralized config loaded from .env via pydantic-settings.

Anything tunable lives here. Safety bounds are intentionally not relaxable from
runtime requests — they only come from env or hard-coded defaults.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_ROOT / "app" / "data"
RUNS_DIR = DATA_DIR / "runs"


class Settings(BaseSettings):
    """All runtime configuration.

    Loads .env from BOTH the workspace root and backend/. backend/.env wins on
    conflicts (it is loaded second). This means you can keep the .env at the
    workspace root if that's where you already have it.
    """

    # --- LLM API keys ---
    # GEMINI_API_KEY is the more common name people use; we accept both.
    anthropic_api_key: str | None = None
    google_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("google_api_key", "gemini_api_key"),
    )

    # --- Sim endpoints ---
    drone_sim_http: str = "http://localhost:8766"
    robot_sim_http: str = "http://localhost:8767"

    # --- Vision client selection ---
    vlm_client: str = Field(default="mock", description="gemini_er | gemini_pro | claude_vision | mock")

    # --- Agent ---
    claude_model: str = "claude-sonnet-4-5"
    # Phase 3 AgriScout flow needs ~13 distinct tool calls (risk + anomaly +
    # plan + drone + aerial_VLM + approval + ground_robot + ground_VLM + 4
    # diagnostics + work_order). 18 gives ~40% headroom for agent retries.
    agent_max_tool_calls: int = 18

    # --- Safety bounds ---
    safety_max_magnitude: float = 0.95  # demo-tuned: punchier visible motion (was 0.7)
    # NOTE: misleading name — this is the per-RUN action cap (one
    # DispatchBudget is shared across all tools in a RunContext), not per
    # dispatch call. Phase 3 diagnostics use ~18 actions across 4 tools on
    # top of drone + ground-robot traversal (~14 actions), so 50 gives
    # ~30% headroom over a worst-case full run.
    safety_max_actions_per_dispatch: int = 50
    safety_drone_min_agl_m: float = 8.0
    safety_drone_max_agl_m: float = 80.0

    # --- Ollama (open-source VLM backup) ---
    ollama_url: str = "http://localhost:11434"
    ollama_timeout_s: float = 60.0
    # Default is `gemma3:4b` (3.3 GB, multimodal, fast ~8-10 s on CPU) because
    # it's already on disk for most dev machines and works immediately.
    # Recommended upgrade: `gemma4:e4b` (9.6 GB, effective 4B params) which
    # beats Gemma 3 27B on every vision benchmark per the Gemma 4 model card.
    # Flip by setting `OLLAMA_VLM_MODEL=gemma4:e4b` in .env once you've done
    # `ollama pull gemma4:e4b`.
    ollama_vlm_model: str = "gemma3:4b"

    # --- Demo / dev ---
    log_level: str = "INFO"
    enable_cors: bool = True
    cors_origins: str = "http://localhost:3000,http://localhost:4173,http://localhost:5173,http://localhost:5174,http://127.0.0.1:4173,http://127.0.0.1:5173,http://127.0.0.1:5174"

    # --- Field demo defaults ---
    demo_field_lat: float = 38.5382
    demo_field_lon: float = -121.7617
    demo_field_id: str = "ucd_north_tomato"

    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(BACKEND_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_google(self) -> bool:
        return bool(self.google_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton."""
    return Settings()


# Convenience export
settings = get_settings()
RUNS_DIR.mkdir(parents=True, exist_ok=True)
