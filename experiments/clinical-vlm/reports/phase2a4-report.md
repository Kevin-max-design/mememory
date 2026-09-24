# MEDMEMORY VLM PHASE 2A.4 REPORT

## BENCHMARK

- Documents: 30
- Pages: 30
- Manifest SHA-256: `e9648b2a2d63adaf1390c39b24d9ad18f2571638fd9b38ab9da60badb7c22074`
- Seed: 260921
- Distribution: 10 easy, 10 medium, 10 hard
- Inference integrity: 30 checkpointed outputs, 30 non-empty outputs, 30 valid output hashes

## MODEL

- Model: `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`
- Revision: `fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b`
- Runtime: Python 3.10.16, MLX 0.32.2, MLX-VLM 0.7.1, local Apple Metal
- Prompt version: `extract-v2`
- Contract version: `2.0.0`
- Generation: temperature 0.0, seed 17, maximum 4096 tokens
- Local only: yes; network calls and telemetry were blocked by the runner

## RAW MODEL

- JSON validity: 100.00% (30/30)
- Schema validity: 100.00% (30/30)
- Precision: 76.39%
- Recall: 74.83%
- F1: 75.60%
- Hallucination count: 34
- Hallucination rate: 23.61%
- Lab tuple accuracy: 100.00% (41/41)
- Medication tuple accuracy: 0.00% (0/11)
- Negation accuracy: 30.77%
- Uncertainty accuracy: 0.00%
- Temporal accuracy: 0.00%
- Subject attribution accuracy: 0.00%
- Grounding accuracy: 100.00% under the provenance validator

## VALIDATED SYSTEM

- Accepted candidates: 105
- Rejected candidates: 10
- Unsafe candidates accepted: 25
- Valid candidates lost: 38
- Precision: 81.34%
- Recall: 74.15%
- F1: 77.58%
- Hallucination rate: 18.66%
- Lab tuple accuracy: 100.00% (41/41)
- Medication tuple accuracy: 0.00% (0/11)
- Negation accuracy: 23.08%
- Uncertainty accuracy: 0.00%
- Grounding accuracy: 100.00% under the provenance validator

The validator improved precision and reduced unmatched accepted candidates from 34 to 25, but it did not establish the required clinical safety boundary. The 25 accepted candidates that failed exact gold matching comprise 14 diagnosis/finding candidates and 11 medication candidates. One semantically matched candidate had a source-evidence mismatch relative to the exact gold span.

## DIFFICULTY

| Difficulty | Raw F1 | Validated F1 | Raw hallucination | Validated hallucination |
| --- | ---: | ---: | ---: | ---: |
| Easy | 93.48% | 92.31% | 8.51% | 8.70% |
| Medium | 70.45% | 72.94% | 27.91% | 22.50% |
| Hard | 64.86% | 68.57% | 33.33% | 25.00% |

Performance declined materially as layout and clinical-context complexity increased.

## CATEGORY RESULTS

| Category | Raw F1 | Validated F1 | Raw hallucination | Validated hallucination | Key result |
| --- | ---: | ---: | ---: | ---: | --- |
| Labs | 100.00% | 100.00% | 0.00% | 0.00% | All 41 exact tuples matched |
| Medications | 0.00% | 0.00% | 100.00% | 100.00% | No exact medication tuple matched |
| Diagnoses/findings | 22.95% | 23.53% | 76.67% | 70.00% | Context and exact-fact failures dominate |
| Allergies | 85.71% | 85.71% | 0.00% | 0.00% | 3/4 facts matched; negation accuracy 0% |
| Patient/document metadata | 99.16% | 99.16% | 0.00% | 0.00% | 59/60 facts matched |

## ERROR TAXONOMY

| Code | Count |
| --- | ---: |
| H1 | 25 |
| H2 | 0 |
| H3 | 0 |
| H4 | 0 |
| H5 | 0 |
| H6 | 0 |
| H7 | 11 |
| H8 | 0 |
| H9 | 0 |
| H10 | 38 |
| H11 | 0 |
| H12 | 0 |
| H13 | 1 |
| H14 | 0 |

The aggregate context-accuracy metrics expose failures that are not counted as H2/H3/H4/H8 when the candidate does not first achieve an exact semantic match. Those context metrics therefore remain the controlling evidence for subject, negation, uncertainty, and temporality.

## PERFORMANCE

- Model load: 5.34 seconds for the final resumed process
- Total page inference: 2,331.76 seconds (38 minutes 51.76 seconds)
- Mean/page: 77.73 seconds
- Median/page: 76.67 seconds
- P95/page: 106.20 seconds
- Peak MLX memory: 6.70 GB
- Output tokens: 6,970 total; 232.33 mean/page

The run used checkpoint/resume after infrastructure failures. The recorded total includes one valid primary output per page; model reload and infrastructure-failure time are excluded. A final-token LLGuidance compatibility failure and stale cross-page grammar state were corrected without changing the frozen model, prompt, schema, validator, gold annotations, or successful model outputs. Empty pre-generation infrastructure artifacts were quarantined and excluded.

## SAFETY

- Unsafe accepted: 25
- Cross-category contamination: no independent taxonomy counter; the 25 accepted unmatched candidates split into 14 diagnoses/findings and 11 medications
- Grounding failures: zero candidates failed the provenance validator; one matched candidate had an exact gold source-span mismatch (H13)
- Systematic concerns: medication tuple failure, diagnosis/finding hallucinations, negation failure, uncertainty failure, temporal failure, subject-attribution failure, and hard-layout degradation

## ISOLATION

- PRODUCTION_MODIFIED: NO
- SUPABASE_MODIFIED: NO
- Real documents used: NO
- OCR, PaddleOCR, Tesseract, and OpenMed used: NO

## DECISION

**D — SYSTEM UNSAFE**

The model is highly reliable for exact synthetic lab tuples and metadata, but the combined model and frozen validator accepted 25 candidates that did not match gold, including every predicted medication tuple and substantial diagnosis/finding errors. Clinical context accuracy was also unacceptable. This system must not process the real nine-page report or enter production.

## NEXT STEP

Create one versioned Phase 2A.5 synthetic-only contract-hardening experiment focused on medication tuple mapping and fail-closed clinical-context enforcement before any real-document benchmark.
