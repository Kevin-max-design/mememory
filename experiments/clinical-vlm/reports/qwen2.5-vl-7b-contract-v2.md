# Qwen2.5-VL-7B contract-v2 evaluation

## Decision

**MODEL FAIL — medication hallucination**

**CONTRACT PASS — the unsafe output was deterministically rejected**

This was one explicitly approved, versioned benchmark using VLM contract `2.0.0`
and prompt `extract-v2`. No inference retry was performed.

## Reproducibility

- Model: `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`
- Revision: `fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b`
- Runtime: Python 3.10.16, MLX 0.32.2, mlx-vlm 0.7.1
- Local-only inference: yes; network access and telemetry were blocked
- Frozen image SHA-256: `02bf0540d3d4e6467431bc534c42f48ef0037170e71daa6e9bc49a0e1cd92989`
- Prompt SHA-256: `7774271d84ae1870d65f825848f80728f183d2e528ff3d47350e2f634d1129da`
- Primary inference count: 1
- Model load: 3.260 seconds
- Inference: 74.930 seconds
- MLX peak memory: 6.811 GB
- Output tokens: 369

## Gate results

- JSON valid: yes
- Strict VLM schema valid: no
- Canonical schema valid: no
- Grounding valid: not evaluated after strict schema rejection
- Patient name: exact
- Document date: exact
- Patient source text: present and exact
- Hemoglobin tuple: exact (`13.5`, `g/dL`)
- Platelet tuple: exact (`291`, `x10^3/uL`)
- WBC tuple: exact (`7.4`, `x10^3/uL`)
- Lab tuple accuracy: 3/3 (100%)
- Negation: correct; anemia was marked absent
- Medication hallucinations: 1
- Other observed hallucinations: 0

## Exact rejection

The image states that medications are absent. The model nevertheless returned one
medication whose name was the absence sentinel `None.`. Contract validation rejected
the item because medication absence must be represented by an empty array. The output
was not repaired or passed to the canonical adapter.

## Safety outcome

The improved field boundaries do not offset the medication hallucination. The model
remains research-only and was not passed to the hybrid reconciler. Production
MedMemory was not modified, and Supabase was not accessed.
