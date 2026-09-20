# Privacy and experiment security

## Data boundary

- Inference must bind to local files and a local runtime only.
- The adapter accepts local image paths and a caller-provided generator; it has no
  external API client.
- Real or possibly real documents require explicit approval and proof that the model
  and runtime are already local. They must never be uploaded, committed, or copied
  into a public dataset.
- Source PDFs, images, page renders, predictions, models, caches, and environment files
  are ignored inside this experiment.
- Patient names must not be used in filenames or benchmark identifiers.

## Logging

Tracked reports contain aggregate counts and rates only. `SafeBenchmarkLogger` accepts
an allowlist of operational fields and rejects raw text, prompts, evidence, filenames,
medical values, or model responses. Document identifiers are reduced to a short SHA-256
key before logging. Exception messages use stable codes.

## Output handling

The raw VLM response is parsed in memory and rejected if it is not exact JSON or fails
the strict schema. No second LLM repairs medical content. Raw predictions stay in an
ignored local directory if they must be retained for manual review. Any promoted
aggregate report must be inspected for accidental text before commit.

## Model acquisition

Phase 1 downloads no weights. Phase 2 must pin a model revision, record checksums,
disable network use during inference, and verify the model is loaded from the approved
local cache. Model telemetry must be disabled or absent.

## Medical safety

Outputs are candidates, never trusted facts. Every fact needs evidence and keeps
subject, negation, uncertainty, and temporality. Normalizers can map a supported value
but cannot introduce a diagnosis, medication, or other fact. Human review remains the
authority before MedMemory can treat a fact as approved or corrected.
