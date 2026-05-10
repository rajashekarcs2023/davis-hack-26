"""Render the AgriScout pipeline output JSON into a self-contained HTML page.

We don't pull a templating engine in (jinja2 etc.) just for one substitution.
The template ships with a single `__PIPELINE_DATA__` placeholder which we
replace with the pretty-printed pipeline JSON.

Usage (from the repo root):

    python -m data_pipeline.dashboard.render \\
        --json data_pipeline/outputs/latest.json \\
        --out data_pipeline/outputs/latest.html
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger("agriscout.pipeline.dashboard")

TEMPLATE_PATH = Path(__file__).parent / "template.html"
PLACEHOLDER = "__PIPELINE_DATA__"


def render(data: dict, *, template_path: Path = TEMPLATE_PATH) -> str:
    """Substitute `data` into the dashboard template and return the HTML."""
    if not template_path.exists():
        raise FileNotFoundError(f"dashboard template missing: {template_path}")
    template = template_path.read_text()
    if PLACEHOLDER not in template:
        raise RuntimeError(
            f"template at {template_path} does not contain the {PLACEHOLDER} "
            "placeholder; it may have been edited by hand."
        )
    payload = json.dumps(data, indent=2)
    # The placeholder lives inside a <script type="application/json"> block,
    # so we need to make sure the JSON can't break the script tag — escape
    # any </script> that happens to appear inside string values.
    payload = payload.replace("</script>", "<\\/script>")
    return template.replace(PLACEHOLDER, payload)


def render_to_file(json_path: Path, out_path: Path) -> Path:
    """Read `json_path`, render, and write the HTML to `out_path`."""
    data = json.loads(json_path.read_text())
    html = render(data)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    return out_path


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m data_pipeline.dashboard.render",
        description="Render an AgriScout pipeline JSON output as static HTML.",
    )
    parser.add_argument("--json", required=True, help="pipeline output JSON file")
    parser.add_argument("--out", required=True, help="destination HTML file")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    json_path = Path(args.json)
    out_path = Path(args.out)
    if not json_path.exists():
        logger.error("pipeline JSON not found: %s", json_path)
        return 1
    try:
        path = render_to_file(json_path, out_path)
    except Exception:
        logger.exception("dashboard render failed")
        return 2
    size_kb = path.stat().st_size / 1024
    logger.info("wrote %s (%.1f KB)", path, size_kb)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
