# Compact document VLM candidates

Research date: 2026-09-21. Size and benchmark claims are taken from linked primary
model cards/repositories. RAM figures marked “planning estimate” must be measured on
the target Mac during Phase 2.

## Candidate 1 — SmolVLM2-2.2B-Instruct (recommended)

- **Parameters:** 2.2B.
- **Architecture:** Idefics3-derived vision-language model using a SigLIP image
  encoder and SmolLM2-1.7B text decoder.
- **License:** Apache-2.0.
- **Model size:** verified MLX conversion is 4.5 GB (4.49 GB weights).
- **Expected RAM:** model card reports 5.2 GB GPU RAM for video inference; plan for
  6–8 GB unified memory for page inference and use a 16 GB Mac as the minimum.
- **Apple Silicon support:** verified MLX conversion exists and MLX-VLM supports the
  Idefics3/SmolVLM family. Exact Phase 2 revision still needs a local smoke test.
- **Document/OCR ability:** official model card reports OCRBench 72.9, TextVQA 73.21,
  and DocVQA 79.98. It can transcribe text from images, but document accuracy is well
  below Qwen2.5-VL-3B on the published DocVQA numbers.
- **Structured output:** no model-specific guarantee. MLX-VLM offers constrained
  JSON Schema output; Phase 2 must verify this combination rather than assume it.
- **Fine-tuning:** official fine-tuning tutorial; MLX-VLM supports LoRA/QLoRA.
- **Known limitations:** model card warns against high-stakes use and factual-looking
  inaccuracies. Layout/tuple quality on clinical documents is unmeasured. The available
  MLX checkpoint is not a 4-bit reduction and still uses about 4.5 GB on disk.

Primary sources:

- https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct
- https://huggingface.co/mlx-community/SmolVLM2-2.2B-Instruct-mlx
- https://github.com/Blaizzy/mlx-vlm

## Candidate 2 — Qwen2.5-VL-3B-Instruct

- **Parameters:** 3B class.
- **Architecture:** Qwen2.5 language model plus dynamic-resolution vision encoder.
- **License:** Qwen Research License for the 3B weights; non-commercial research and
  evaluation only. Commercial use requires a separate license.
- **Model size:** base safetensors are about 7.5 GB; verified MLX 4-bit conversion is
  3.09 GB with a 3.07 GB weight file.
- **Expected RAM:** 5–7 GB unified memory for 4-bit single-page inference (planning
  estimate); 16 GB minimum, 24 GB preferred for longer pages/output.
- **Apple Silicon support:** explicitly documented by MLX-VLM for the 4-bit conversion.
- **Document/OCR ability:** official results report DocVQA 93.9, InfoVQA 77.1, and
  TextVQA 79.3. The model card highlights text, chart, layout, table, bounding-box,
  and structured document extraction.
- **Structured output:** model card claims stable JSON; MLX-VLM supports constrained
  JSON Schema generation.
- **Fine-tuning:** Qwen training ecosystem plus MLX-VLM LoRA/QLoRA.
- **Known limitations:** the 3B weight license blocks an uncomplicated commercial
  MedMemory path. Quantization can reduce accuracy. Coordinate and clinical grounding
  still require benchmark evidence.

Primary sources:

- https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct
- https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct/blob/main/LICENSE
- https://huggingface.co/mlx-community/Qwen2.5-VL-3B-Instruct-4bit
- https://github.com/Blaizzy/mlx-vlm

## Candidate 3 — InternVL2.5-2B

- **Parameters:** about 2.1B (InternViT-300M plus InternLM2.5-1.8B).
- **Architecture:** dynamic high-resolution InternViT tiles feeding an InternLM2.5
  language model.
- **License:** MIT.
- **Model size:** official safetensors total about 4.41 GB.
- **Expected RAM:** 6–8 GB unified memory for BF16 single-page inference (planning
  estimate); image tiling can materially increase peak memory.
- **Apple Silicon support:** not verified from the official model card. Official examples
  use Transformers, `trust_remote_code`, BF16/CUDA, and optionally FlashAttention.
  PyTorch MPS or an MLX conversion would require a separate compatibility smoke test.
- **Document/OCR ability:** dynamic high-resolution design and broad multimodal
  benchmarks make it plausible for documents, but the 2B card does not provide the
  same clear document-specific evidence as Qwen's 3B card.
- **Structured output:** prompted JSON only in the official path; constrained output
  support is runtime-dependent and unverified here.
- **Fine-tuning:** official InternVL, SWIFT, and XTuner paths are documented.
- **Known limitations:** `trust_remote_code` expands the code-review surface; the
  official runtime guidance is GPU-oriented, and native Apple support is unproven.

Primary sources:

- https://huggingface.co/OpenGVLab/InternVL2_5-2B
- https://github.com/OpenGVLab/InternVL

## Recommendation

Start with **SmolVLM2-2.2B-Instruct-mlx**. It is the best first gate for the actual
MedMemory constraints: permissive license, compact size, verified Apple runtime path,
fine-tuning path, and enough documented OCR capability to test the hypothesis. Its
weaker DocVQA score is a reason to benchmark, not to assume success. If it fails on
clinical tables, Qwen2.5-VL-3B is the strongest research-only quality comparator, but
its license prevents using that exact checkpoint as the default production foundation.
