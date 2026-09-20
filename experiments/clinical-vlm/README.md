# MedMemory Compact Clinical VLM Experiment

This directory is an isolated research harness for one question: can a compact,
local document VLM produce more accurate and better-grounded clinical candidates
than MedMemory's unchanged OCR + OpenMed + deterministic baseline?

Phase 1 contains contracts, adapters, evaluation metrics, synthetic fixtures, and
research notes. It contains no model weights and is not imported by the web app,
worker, document processor, or database code.

## Safety boundary

- Inference is local-only. No external inference API is supported by the adapter.
- Source PDFs, page renders, predictions, caches, and model files are ignored.
- Tracked benchmark output may contain aggregate metrics only.
- Every candidate requires a page and evidence span. Bounding boxes stay `null`
  unless the model's coordinate grounding is separately verified.
- The current MedMemory pipeline is the benchmark baseline and remains unchanged.
- Model output is always a candidate for validation and human review.

## Phase 1 architecture

```text
approved local document
        |
deterministic page render (200 DPI, RGB, ordered pages)
        |
compact local VLM (not installed in Phase 1)
        |
strict JSON -> schema validation -> source grounding
        |
context and clinical safety checks -> deterministic merge
        |
canonical candidate facts -> aggregate-only benchmark metrics

unchanged MedMemory extraction candidates
        |
baseline adapter -> same canonical facts -> same metrics
```

The initial strategy is page-by-page extraction followed by a deterministic merge.
This bounds memory, makes failures attributable to a page, and preserves provenance.
Facts with different subject, negation, certainty, temporality, section, or evidence
are not merged merely because their medical names look similar.

See [architecture.md](reports/architecture.md),
[model-candidates.md](reports/model-candidates.md), and
[privacy.md](reports/privacy.md).

## Contracts

- `schemas/canonical-extraction.schema.json`: strict experiment output.
- `schemas/gold-annotation.schema.json`: human-reviewed gold format.
- `prompts/extract_v1.txt`: compact anti-hallucination prompt.
- `src/clinical_vlm/baseline_adapter.py`: maps existing MedMemory candidates.
- `src/clinical_vlm/vlm_adapter.py`: local generator boundary; unavailable by default.
- `src/clinical_vlm/metrics.py`: fact, tuple, context, grounding, and H1-H14 metrics.

The canonical fact shape keeps MedMemory's existing provenance and `data` pattern
while extending its categories for the research question. Normalization remains
separate from extraction.

## Run Phase 1 tests

The repository's existing document-processor environment already contains the two
small Phase 1 dependencies. No install or model download is required:

```bash
PYTHONPATH=experiments/clinical-vlm/src \
  services/document-processor/.venv/bin/python -m pytest \
  experiments/clinical-vlm/tests -q
```

Regenerate the tracked JSON schemas after changing Python contracts:

```bash
PYTHONPATH=experiments/clinical-vlm/src \
  services/document-processor/.venv/bin/python -m clinical_vlm.schema_export
```

## Phase 2 gate

Phase 2 starts only after manual installation of the selected local model/runtime.
The first action will be a synthetic, network-disabled smoke test. No real or
potentially sensitive document may be used until local-only execution, JSON schema
validation, and raw-text-free logging are verified.
