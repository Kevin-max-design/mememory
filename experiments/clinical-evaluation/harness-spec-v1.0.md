# Evaluation harness specification v1.0

Status: **DRAFT — contract sign-off and implementation required**

## Purpose

Measure the unchanged shipping extractor at tag `v0.1-beta.1` against an independently annotated
gold set. Qwen/VLM research results are excluded from the product baseline.

## Dataset governance

Partitions are assigned at document level before tuning:

| Partition   | Permitted use                              | Access                                      |
| ----------- | ------------------------------------------ | ------------------------------------------- |
| Development | Debugging and rule development             | Engineering and approved clinical reviewers |
| Validation  | Threshold selection and candidate approval | Engineering and clinical lead               |
| Locked test | One evaluation per release candidate       | Privacy/security owner-controlled runner    |
| Challenge   | Rare layouts and safety traps              | Restricted evaluation; not used for tuning  |

Related pages, revisions, exports, and documents from the same source episode remain in one
partition. The assignment tool stores only keyed document identifiers in manifests and checks
for exact and known-family leakage.

The locked test runner exposes aggregate results and approved failure identifiers, not document
content. A failed candidate returns to development and must receive a new candidate version
before another locked-test run.

## Baseline execution

1. Resolve the immutable `v0.1-beta.1` commit.
2. Record extractor, schema, guideline, dataset-manifest, dependency-lock, and runner versions.
3. Run raw document bytes through the normal processor and extraction path.
4. Capture candidates and provenance in an encrypted, access-controlled evaluation workspace.
5. Score against adjudicated gold without modifying or repairing extractor output.
6. Emit aggregate metrics, confidence intervals, sufficiency flags, and a limitations report.

## Metric contract

Report counts and Wilson score intervals alongside every supported proportion.

### OCR

- Character error rate and word error rate, by document type and quality tier.
- OCR metrics use transcriptions created independently of extractor output.

### Extraction

- Precision, recall, and F1 per category.
- Exact laboratory tuple accuracy.
- Exact medication tuple accuracy.
- Fabrication rate: emitted non-null value where the adjudicated gold field is null.
- Negation, temporality, subject, and certainty accuracy.
- Provenance integrity: accepted candidates whose page, block, and span resolve and support the
  asserted fact.
- Span validation requires `span_start < span_end` and exact agreement between `source_text` and
  the referenced block substring; this cross-field check is enforced by the harness because JSON
  Schema cannot compare the two integer fields directly.
- Unsupported accepted-candidate count.
- Human-review correction, rejection, and approval rates, reported from privacy-safe aggregate
  events only.

Medication and laboratory tuples receive no partial success credit in release-gate metrics. A
field-level diagnostic report may explain failures without changing the tuple score.

Categories with fewer than 30 positive locked-test instances are marked `INSUFFICIENT_SAMPLE`.
Their counts and intervals remain visible, but no precise accuracy claim is made.

## Regression and release gates

A candidate cannot proceed when it regresses any predeclared safety-critical validation metric.
Gate thresholds must be registered before the locked-test run and cannot be changed after viewing
results.

Any of the following blocks release regardless of aggregate metrics or partition:

- medication attributed to the wrong patient or subject;
- negation loss that produces an affirmative false diagnosis;
- fabricated medication name, dose, or unit accepted as a patient fact;
- unsupported high-severity fact accepted without resolvable provenance; or
- cross-document or cross-user fact attribution.

Challenge-set results otherwise inform limitations and roadmap decisions rather than ordinary
aggregate thresholds.

## Telemetry and privacy boundary

Permitted operational events contain event type, timestamp, pseudonymous user/document/candidate
identifiers, provenance pointers, review outcome, and version identifiers. They do not contain:

- medical values;
- medication or diagnosis names;
- doses or laboratory results;
- OCR text or source spans;
- filenames; or
- questions, exports, credentials, tokens, or secrets.

Clinical content stays in protected medical-record storage. Production corrections cannot enter
the evaluation corpus automatically. Promotion requires consent, de-identification, privacy
approval, provenance documentation, and a new dataset-manifest entry.

## Required report

The generated baseline report includes:

- immutable version and manifest identifiers;
- partition sizes and category support;
- per-category metrics with intervals;
- insufficiency flags;
- catastrophic-failure findings;
- correction-rate aggregates;
- document-type and quality-tier breakdowns;
- known limitations and excluded claims; and
- confirmation that no locked-test material was used for tuning.
