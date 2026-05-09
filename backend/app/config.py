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
    agent_max_tool_calls: int = 12

    # --- Safety bounds ---
    safety_max_magnitude: float = 0.7
    safety_max_actions_per_dispatch: int = 12
    safety_drone_min_agl_m: float = 8.0
    safety_drone_max_agl_m: float = 80.0

    # --- Demo / dev ---
    log_level: str = "INFO"
    enable_cors: bool = True
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174"

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
