# Annotation contract v1.0

Status: **DRAFT — clinical and privacy sign-off required**

This contract defines how reference annotations are created for MedMemory clinical extraction.
It does not establish a regulatory status or authorize use of patient records for research.

## Reviewer roles

| Category                                      | Primary reviewers                                          | Adjudicator                    |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| Laboratory results                            | Clinical laboratory professional or physician              | Senior clinician               |
| Medications                                   | Pharmacist or medication-reconciliation clinician          | Senior pharmacist or physician |
| Diagnoses and findings                        | Physician or experienced clinical documentation specialist | Senior clinician               |
| Negation, temporality, certainty, and subject | Physician or experienced clinical documentation specialist | Senior clinician               |

The privacy owner approves the source, consent basis, de-identification procedure, access group,
retention period, and permitted uses before a document enters the workflow.

## Blinding

Reviewers annotate independently. They cannot see:

- another reviewer's labels;
- model or extractor output;
- prior batch metrics; or
- which documents are overlap anchors.

Both reviews must be submitted before agreement calculation or adjudication is unlocked.

## Workflow

`assigned -> in_review -> submitted -> gold`

Disagreements follow:

`submitted -> adjudication_required -> adjudicated -> gold`

Workflow logs contain identifiers, state, actor, timestamp, and contract versions. They must not
contain medical values, free text, diagnoses, medications, or document content.

Every adjudicated disagreement records its type, resolution, guideline reference, adjudicator,
and whether the guideline needs clarification. Repeated disagreements are evidence of guideline
ambiguity and must not be treated automatically as reviewer error.

## Annotation units

Annotations are source-bound tuples. Every fact includes a page number, block identifier, and
exact character span within the referenced block. A normalized fact without resolvable evidence
is invalid.

### Laboratory tuple

`analyte, value, unit, reference range, specimen, date, provenance`

### Medication tuple

`name, dose, unit, frequency, route, start date, status, completeness, provenance`

### Diagnosis or finding tuple

`condition, negation, temporality, subject, certainty, provenance`

## Null semantics

Optional source fields use `null` and one reason:

- `absent_in_source`
- `illegible`
- `ambiguous`
- `not_applicable`

Annotators never infer missing values. `not_applicable` is permitted only where the schema says
the field can be inapplicable; it is not a synonym for missing.

Medication completeness is:

- `complete`: all fields present in the source were captured and no clinically relevant source
  field is ambiguous;
- `partial_source`: the source itself omits one or more optional fields;
- `ambiguous`: at least one visible field cannot be associated safely;
- `illegible`: source quality prevents a reliable reading.

## Drift control

- At least 10% of each batch consists of hidden overlap anchors.
- Agreement is reported per category and per batch.
- An anchor-agreement decrease greater than five percentage points from the established running
  mean pauses gold-set admission for that batch pending review.
- Every label stores the guideline version and annotation timestamp.
- A guideline change requires an impact assessment identifying labels that need re-adjudication.

The five-point trigger is an initial operational threshold, not a validated clinical threshold.
It may change only in a new contract version after documented review.

## Agreement measures

- Exact tuple match for laboratory and medication tuples.
- Per-field agreement is diagnostic only and cannot convert an incorrect tuple into a correct
  tuple.
- Cohen's kappa for two-reviewer categorical context labels; Fleiss' kappa only where more than
  two independent reviewers label the same items.
- Raw agreement and disagreement counts accompany every kappa value.
- Categories with inadequate prevalence are reported as insufficient for stable agreement
  estimation.

## Approval record

The following must be completed outside this draft before `v1.0` is frozen:

| Approval          | Name/role | Date    | Evidence reference |
| ----------------- | --------- | ------- | ------------------ |
| Clinical lead     | Pending   | Pending | Pending            |
| Privacy owner     | Pending   | Pending | Pending            |
| Engineering owner | Pending   | Pending | Pending            |
