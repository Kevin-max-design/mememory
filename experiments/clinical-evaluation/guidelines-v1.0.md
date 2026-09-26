# Annotation guidelines v1.0

Status: **DRAFT — clinical and privacy sign-off required**

## General rules

1. Annotate only information explicitly supported by the document.
2. Bind each annotation to one exact source span. Include additional supporting spans only when
   the fact cannot be understood safely from one span.
3. Preserve the document's wording in `source_text`; use normalized fields separately.
4. Never complete a tuple from clinical knowledge, an ontology, another page, or another record
   unless the document explicitly links that information.
5. Mark illegible or ambiguous content; do not guess.
6. Do not annotate headers, footers, templates, instructions, reference examples, or blank form
   fields as patient facts.

## Laboratory results

- One annotation represents one analyte-result association.
- The value and unit must belong to the same row or be linked unambiguously by layout.
- A reference range is not a patient result.
- Preserve inequality operators and qualitative results.
- If row or column association is ambiguous, label the relevant fields `null` with
  `ambiguous`; do not construct a tuple from nearby values.

## Medications

- A medication name alone is valid only as a partial tuple when the source asserts patient use,
  prescription, administration, discontinuation, or a medication-list entry.
- Do not convert mentions in allergies, education, alternatives, family history, or hypothetical
  plans into active medications.
- Dose, unit, frequency, route, date, and status remain `null` when absent.
- A value may be associated only when grammar or layout connects it to the medication.
- Brand/generic normalization is separate from source transcription. Ontology matches support
  normalization but do not prove source presence.

## Diagnoses and findings

- Preserve whether the statement is affirmed, negated, uncertain, conditional, historical, or
  resolved.
- Preserve subject: patient, family member, donor, fetus, or other person.
- Findings in an `IMPRESSION` or equivalent section retain that section as context; the heading
  itself is not a diagnosis.
- Differential diagnoses and rule-out statements are not confirmed conditions.

## Context labels

### Negation

- `affirmed`: asserted as present.
- `negated`: explicitly absent or denied.
- `unknown`: scope cannot be resolved reliably.

### Temporality

- `current`, `historical`, `future_or_planned`, `resolved`, or `unknown`.

### Subject

- `patient`, `family`, `other`, or `unknown`.

### Certainty

- `confirmed`, `suspected`, `possible`, `conditional`, or `unknown`.

When scope is ambiguous, use `unknown` and flag adjudication. Do not select the clinically most
likely interpretation.

## Multi-patient documents

Facts are attributed only when the source clearly identifies the patient. A fact with unresolved
subject or patient identity is retained as an annotation for evaluation but marked `subject =
unknown`; it must never be treated as an accepted patient fact.

## Guideline change control

Each change records rationale, affected categories, examples using synthetic content, and the
range of annotation batches potentially affected. Changes after annotation begins require a new
minor version and a re-adjudication decision.
