# MedMemory VLM Phase 2A.3 — category-level fail-closed validation

## Decision

**A — CATEGORY VALIDATION PASS**

No model inference was performed. The evaluator uses the byte-identical, synthetic
Qwen contract-v2 output captured by the preceding benchmark.

## Validation architecture

```text
raw VLM JSON
  -> envelope parser
  -> ordered category extraction
  -> independent candidate schema validation
  -> context validation
  -> page/source provenance validation
  -> accepted candidates + safe rejected-candidate records
  -> candidate-specific canonical adapters for accepted candidates only
```

Envelope and candidate failures have separate policies:

- Malformed JSON, a non-object root, missing required category containers, unknown
  top-level categories, or unusable category container types reject the complete
  envelope.
- Once the envelope is usable, each patient/header, lab, diagnosis, medication, or
  allergy candidate is evaluated independently. A candidate that fails schema,
  context, or provenance validation is rejected without suppressing unrelated valid
  candidates.
- Rejected candidates are not repaired and never enter a canonical adapter.
- Safe rejection records contain category, position, reason code, and a static
  summary. They contain no model-produced clinical text.

## Frozen Qwen result

Candidate-object accounting:
- Total: 6
- Accepted: 5
- Rejected: 1
- Acceptance rate: 83.3%
- Labs accepted: 3
- Labs rejected: 0
- Diagnosis accepted: 1, with negation preserved
- Medication accepted: 0
- Medication rejected: 1 (`ABSENCE_SENTINEL_AS_ENTITY`)
- Unsafe candidates accepted: 0
- Valid candidates lost: 0
- Partial recovery rate: 100%

The three accepted lab tuples are the expected synthetic Hemoglobin, Platelet Count,
and WBC Count tuples. The emitted medication absence sentinel is rejected. The
patient/header candidate produces two canonical facts, so five accepted candidate
objects produce six canonical facts.

## Boundary

This implementation remains entirely under `experiments/clinical-vlm/`. It is not
imported by the production processor, worker, web application, timeline, search, or
Ask MedMemory. Supabase is not accessed.
