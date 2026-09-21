# Qwen2.5-VL-7B Phase 2A.3 evaluation

## Decision

**FAIL — structured output and lab tuple grounding**

The model is not eligible for MedMemory production or hybrid reconciliation based on this single frozen synthetic benchmark. No inference retry was performed.

## Reproducibility

- Model: `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`
- Revision: `fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b`
- License metadata: Apache-2.0 in the checkpoint model card
- Runtime: Python 3.10.16, MLX 0.32.2, mlx-vlm 0.7.1
- Local-only inference: yes; network access and telemetry were blocked by the runner
- Frozen image SHA-256: `02bf0540d3d4e6467431bc534c42f48ef0037170e71daa6e9bc49a0e1cd92989`
- Primary inference count: 1
- Model load: 3.073 seconds
- Inference: 49.105 seconds
- MLX peak memory: 6.811 GB
- Output tokens: 321

## Gate results

- JSON valid: yes
- Strict VLM schema valid: no
- Canonical schema valid: no
- Grounding valid: no; canonical grounding was not run after strict schema rejection
- Patient name: exact
- Document date: exact
- Hemoglobin tuple: exact (`13.5`, `g/dL`)
- Platelet tuple: incorrect; the value included `x10^3/uL` and the unit was only `uL`
- WBC tuple: incorrect; the value included `x10^3/uL` and the unit was only `uL`
- Lab tuple accuracy: 1/3 (33.3%)
- Negation: correct; anemia was marked absent
- Medication hallucinations: 0
- Other hallucinations: 0 observed

## Exact schema failure

`patient.source_text` was omitted while patient name/date were present. The canonical validator requires a grounded source span for those fields.

## Safety outcome

The result remains research-only. It was not passed to the hybrid reconciler, production MedMemory was not modified, and Supabase was not accessed.
