# Manual Phase 2 prerequisites — do not run during Phase 1

Selected model:
`mlx-community/SmolVLM2-2.2B-Instruct-mlx` at revision
`2b4b371c65a56f5412c333492c083a42a639a661`.

- Source: https://huggingface.co/mlx-community/SmolVLM2-2.2B-Instruct-mlx
- Original model: https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct
- License: Apache-2.0
- Download: approximately 4.5 GB, including a 4.49 GB weight file
- Disk planning: reserve at least 7 GB for weights, runtime, and temporary cache
- Memory planning: published 5.2 GB GPU RAM for video inference; expect roughly
  6–8 GB unified memory for this experiment and use a 16 GB Mac as the minimum
- Runtime: MLX-VLM 0.7.1, MIT license, Apple Silicon only

After explicit Phase 2 approval, run from the repository root:

```bash
python3.10 -m venv experiments/clinical-vlm/.venv
experiments/clinical-vlm/.venv/bin/python -m pip install \
  "mlx-vlm==0.7.1" "pydantic>=2.10,<3" "pytest>=8,<10"
experiments/clinical-vlm/.venv/bin/hf download \
  mlx-community/SmolVLM2-2.2B-Instruct-mlx \
  --revision 2b4b371c65a56f5412c333492c083a42a639a661 \
  --local-dir "$HOME/Library/Caches/medmemory-vlm/SmolVLM2-2.2B-Instruct-mlx"
```

These commands intentionally remain unexecuted in Phase 1. The first Phase 2 task is
to hash the local snapshot, put the runtime in offline mode, and run one synthetic
image smoke test before any approved benchmark document is opened.
