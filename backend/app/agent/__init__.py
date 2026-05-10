"""AgriScout agentic orchestration.

Primary brain: `app.agent.adk_orchestrator` (Google ADK + Gemini 2.5 Pro).
Fallback brain: `app.agent.claude_agent` (Anthropic Messages API), retained
while the ADK preview stabilises and for environments without `GOOGLE_API_KEY`.

Both backends share the same tool surface in `app.agent.tools` and the same
prompts in `app.agent.prompts`, so swapping backends is a one-line import
change in the FastAPI route layer.
"""

