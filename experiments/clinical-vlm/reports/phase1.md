# Phase 1 design record

- Production extraction remains unchanged and is represented through an adapter.
- Canonical schema version: 1.0.0.
- Prompt version: extract-v1.
- Rendering baseline: ordered RGB pages at 200 DPI, no enhancement.
- Initial request strategy: one page at a time, deterministic merge.
- Recommended first model: `mlx-community/SmolVLM2-2.2B-Instruct-mlx`.
- Model and runtime are disabled until a manual Phase 2 install.
- Gold labels are human-authored and source-grounded.
- H1-H14 errors and required fact/tuple/context/resource metrics are implemented.
- Tracked logs and reports are aggregate-only.
