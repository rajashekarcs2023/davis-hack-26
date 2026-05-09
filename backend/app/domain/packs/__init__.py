"""Domain packs.

A "pack" is a small bundle of: agent prompts, anomaly classifiers, VLM prompts,
and work-order copy that targets one use case. The MVP pack is irrigation. The
stretch pack is wildfire-driven crop protection. The agent looks up the pack at
run start; everything else is shared.
"""
