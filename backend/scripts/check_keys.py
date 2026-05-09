"""Verify ANTHROPIC_API_KEY and GEMINI_API_KEY (or GOOGLE_API_KEY) actually work.

Zero-dependency on purpose — uses macOS's curl under the hood, so it sidesteps
the system-Python SSL bundle issue on macOS that breaks urllib out of the box.
Runs without the venv, without pip installs, without certifi.

Reads .env from either the workspace root or backend/.env (matches config.py).

Usage:
    python3 backend/scripts/check_keys.py

Exit code 0 if all configured keys work, non-zero otherwise.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def load_dotenv_if_present() -> dict[str, str]:
    """Tiny .env parser. Looks at workspace root first, then backend/, like config.py."""
    loaded: dict[str, str] = {}
    for path in [REPO_ROOT / ".env", BACKEND_ROOT / ".env"]:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k:
                loaded[k] = v
    for k, v in loaded.items():
        os.environ.setdefault(k, v)
    return loaded


def mask(value: str) -> str:
    if not value:
        return "(empty)"
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]} ({len(value)} chars)"


def _curl_post(url: str, headers: dict[str, str], body: dict) -> tuple[int, dict | str]:
    """POST JSON via curl. Returns (http_status, parsed_json_or_raw_text)."""
    if shutil.which("curl") is None:
        raise RuntimeError("curl is not on PATH; install curl or run from a shell that has it")
    args = ["curl", "-sS", "-w", "\n__HTTP__%{http_code}", "-X", "POST", url]
    for k, v in headers.items():
        args += ["-H", f"{k}: {v}"]
    args += ["--data-binary", json.dumps(body)]
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=25)
    except subprocess.TimeoutExpired:
        return 0, "timeout"
    raw = (proc.stdout or "") + (proc.stderr or "")
    marker = raw.rfind("__HTTP__")
    if marker == -1:
        return 0, raw[:500]
    body_text = raw[:marker].rstrip()
    try:
        status = int(raw[marker + len("__HTTP__"):].strip())
    except ValueError:
        status = 0
    try:
        return status, json.loads(body_text) if body_text else {}
    except json.JSONDecodeError:
        return status, body_text[:500]


def check_anthropic(key: str) -> tuple[bool, str]:
    if not key:
        return False, "ANTHROPIC_API_KEY not set"
    status, payload = _curl_post(
        "https://api.anthropic.com/v1/messages",
        {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        {
            "model": "claude-sonnet-4-5",
            "max_tokens": 16,
            "messages": [{"role": "user", "content": "Reply with the single word pong."}],
        },
    )
    if status == 200 and isinstance(payload, dict):
        content = payload.get("content") or []
        text = ""
        if content and isinstance(content, list) and isinstance(content[0], dict):
            text = content[0].get("text", "")
        return True, f"OK — model={payload.get('model','?')} reply={text!r}"
    if isinstance(payload, dict):
        err = payload.get("error", {}) or {}
        return False, f"HTTP {status}: {err.get('type','?')}: {err.get('message', payload)}"
    return False, f"HTTP {status}: {payload}"


def check_gemini(key: str) -> tuple[bool, str]:
    if not key:
        return False, "GEMINI_API_KEY / GOOGLE_API_KEY not set"
    return _check_gemini_model(key, "gemini-robotics-er-1.6-preview", allow_fallback=True)


def _check_gemini_model(key: str, model: str, *, allow_fallback: bool) -> tuple[bool, str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    status, payload = _curl_post(
        url,
        {"Content-Type": "application/json"},
        {
            "contents": [{"parts": [{"text": "Reply with the single word pong."}]}],
            # Roomy budget so that thinking tokens (Robotics-ER thinks by default)
            # don't eat the visible response.
            "generationConfig": {"temperature": 1.0, "maxOutputTokens": 256},
        },
    )
    if status == 200 and isinstance(payload, dict):
        text = ""
        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            # Robotics-ER preview can hit MAX_TOKENS on thinking even with 256 budget.
            # If candidates exist with finishReason set, that still proves the key works.
            cands = payload.get("candidates") or []
            if cands:
                text = f"(no text yet, finishReason={cands[0].get('finishReason','?')})"
        return True, f"OK — model={payload.get('modelVersion', model)} reply={text!r}"
    # Try fallback if Robotics-ER access is gated.
    if (
        allow_fallback
        and status in {403, 404}
        and "robotics" in model
        and isinstance(payload, dict)
    ):
        err_msg = payload.get("error", {}).get("message", str(payload))
        ok2, msg2 = _check_gemini_model(key, "gemini-2.5-pro", allow_fallback=False)
        if ok2:
            return True, f"Robotics-ER preview gated ({err_msg}); fallback {msg2}"
        return False, f"Robotics-ER preview gated ({err_msg}); fallback also failed: {msg2}"
    if isinstance(payload, dict):
        err = payload.get("error", {}) or {}
        return False, f"HTTP {status}: {err.get('status','?')}: {err.get('message', payload)}"
    return False, f"HTTP {status}: {payload}"


def main() -> int:
    loaded = load_dotenv_if_present()
    print(f"Loaded {len(loaded)} entries from .env\n")

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    gemini_key = (
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GOOGLE_API_KEY", "").strip()
    )

    print(f"ANTHROPIC_API_KEY: {mask(anthropic_key)}")
    print(f"GEMINI_API_KEY  : {mask(gemini_key)}")
    print()

    print("[1/2] Checking Anthropic (Claude)...")
    a_ok, a_msg = check_anthropic(anthropic_key)
    print(f"  {'✓' if a_ok else '✗'} {a_msg}\n")

    print("[2/2] Checking Gemini (Google)...")
    g_ok, g_msg = check_gemini(gemini_key)
    print(f"  {'✓' if g_ok else '✗'} {g_msg}\n")

    if a_ok and g_ok:
        print("All keys working. You can flip VLM_CLIENT=gemini_er when you're ready for live LLM runs.")
        return 0

    print("One or more keys failed. The backend still runs in mock mode (VLM_CLIENT=mock).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
