# MedMemory clinical extraction evaluation

This directory defines the evaluation contract for the shipping MedMemory extractor. It is
independent of the Qwen/VLM experiments and does not change `v0.1-beta.1` or any production
runtime path.

The contracts are drafts until the clinical lead and privacy owner record approval. A checked
box in this repository is not a substitute for that approval.

## Frozen contract identifiers

- Annotation contract: `annotation-contract-v1.0`
- Gold-set schema: `goldset-schema-v1.0`
- Annotation guidelines: `guidelines-v1.0`
- Harness specification: `harness-spec-v1.0`

After sign-off, changes require new version identifiers. Existing gold labels retain the
guideline version under which they were produced.

## Boundaries

- No patient document, extracted medical value, free-text span, credential, or model output is
  committed here.
- Production corrections are not automatically copied into an evaluation set.
- Research promotion requires explicit consent, de-identification, privacy review, and a
  documented provenance chain.
- The locked test set is not accessible to engineering during development or threshold tuning.
- `v0.1-beta.1` is evaluated unchanged to establish the baseline.

## Documents

- [Annotation contract](annotation-contract-v1.0.md)
- [Annotation guidelines](guidelines-v1.0.md)
- [Harness specification](harness-spec-v1.0.md)
- [Machine-readable gold-set schema](schemas/goldset-schema-v1.0.json)

## Milestones

1. Clinical lead and privacy owner approve the contract and guidelines.
2. Assign documents to partitions before annotation; verify document-level leakage is zero.
3. Double-annotate an initial representative set with at least 10% hidden anchors per batch.
4. Adjudicate disagreements and report category-level agreement.
5. Run the unchanged `v0.1-beta.1` extractor and publish the baseline with confidence intervals
   and limitations.
6. Permit extraction changes only through versioned validation and locked-test gates.
