# MedMemory VLM Phase 2A.4 — pre-inference freeze report

The benchmark contains synthetic test data only. Gold labels are generated directly
from the same fixed structured source used for rendering, without model involvement.

## Inventory

- Benchmark documents: 30
- Benchmark pages: 30
- Easy: 10
- Medium: 10
- Hard: 10
- Laboratory documents: 10
- Medication documents: 4
- Imaging documents: 5
- Discharge documents: 5
- Mixed documents: 6

## Expected cases

- Lab tuples: 41
- Medication tuples: 11
- Negations: 13
- Uncertainty cases: 6
- Historical cases: 3
- Family-history cases: 4
- Allergy cases: 4

## Freeze identity

- Seed: `260921`
- Manifest SHA-256: `e9648b2a2d63adaf1390c39b24d9ad18f2571638fd9b38ab9da60badb7c22074`
- Model revision: `fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b`
- Prompt version: `extract-v2`
- Contract version: `2.0.0`

## Validation

- All 30 images decode at 1600 × 2100 and contain nonblank rendered content.
- All image and gold hashes match the manifest.
- Every gold envelope passes the frozen VLM schema and canonical adapter.
- Every gold source span occurs in its deterministic local reference text.
- Contact sheets for all 30 pages passed visual layout inspection.
- Generator reproducibility and safe-manifest tests pass.
- Full isolated experiment suite: 68 passed.

The images, gold files, manifest, contact sheets, raw predictions, and checkpoints
remain ignored benchmark artifacts. No real patient data is present.
