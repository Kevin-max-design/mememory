# Phase 1 architecture and compatibility review

## Existing MedMemory baseline

The production processor emits page analyses with OCR/native text blocks, block
bounding boxes, page number, region classification, and provider metadata. Its
clinical brain emits `BrainCandidate` objects with seven record categories:

- lab
- medication
- diagnosis
- allergy
- vital
- procedure
- doctor note

The web extraction layer stores the same category, document/page/block provenance,
source text, confidence, extraction method/version, fingerprint, event date, and a
category-specific `data` object. The worker validates the processor response before
persistence. OpenMed adds source spans, model metadata, and assertion context, while
deterministic gates reject invalid spans, negation, uncertainty, category/context
mismatches, and common false positives.

The experiment reuses this shape rather than changing it. Its common fact fields are
`type`, `value`, `normalized_value`, `page`, `source_text`, `source_block_ids`,
`bbox`, `section`, `confidence`, `status`, `context`, and `data`.

## Canonical category mapping

| Production candidate | Experiment type |
| --- | --- |
| lab | lab_result |
| medication | medication |
| diagnosis | diagnosis |
| allergy | allergy |
| vital | vital |
| procedure | procedure |
| doctor_note | clinical_finding |

The superset also represents document metadata, patient fields, symptoms, imaging,
past history, treatment course, discharge advice, follow-up, and unmapped content.
It is an evaluation schema only and creates no database compatibility promise.

## Evidence and context

Every fact requires a page and non-empty evidence span. The evaluator separately
records JSON validity, schema validity, and grounding validity. A syntactically valid
medical answer is not counted as grounded when its evidence is absent from the local
reference page. Coordinates must be ordered, non-negative, and within page bounds;
the extraction prompt directs the model to return `null` when it cannot ground them.

Context is explicit:

- subject: patient, family, other, unknown
- negation: affirmed, negated, unknown
- certainty: certain, possible, suspected, ruled out, unknown
- temporality: current, historical, future, unknown

This allows “denies diabetes,” “rule out pancreatitis,” and “family history of
hypertension” to be evaluated without converting them into affirmed patient diagnoses.

## Experiment flow

1. Render approved local pages in ascending order at 200 DPI RGB with no enhancement.
2. Run one page per request to bound memory and retain page attribution.
3. Constrain output to the canonical JSON Schema when the runtime supports it.
4. Reject malformed JSON or schema violations without semantic LLM repair.
5. Check page, evidence text, and optional bounding boxes.
6. Apply context and category safety gates; later OpenMed may validate or normalize.
7. Merge exact duplicates deterministically while preserving distinct contexts.
8. Evaluate the unchanged baseline and VLM with the same gold annotations and metrics.

OpenMed remains a validator, normalizer, secondary signal, and baseline component.
Neither OpenMed nor terminology lookup may manufacture source evidence.

## Decision rule

The decision order is hallucination rate, grounding, tuple association, precision,
recall, robustness, and resources. Phase 2 must return exactly A (not ready), B
(promising, needs fine-tuning), or C (strong enough for shadow mode). Even C cannot
change production without a separate approved integration phase.
