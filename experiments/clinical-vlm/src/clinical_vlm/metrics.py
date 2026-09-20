"""Clinical extraction metrics and the H1-H14 error taxonomy."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from .dedup import fact_key
from .models import ClinicalFact, FactType, GoldAnnotation


class ErrorClass(str, Enum):
    H1_HALLUCINATED_FACT = "H1"
    H2_WRONG_PATIENT_ATTRIBUTION = "H2"
    H3_NEGATION_FAILURE = "H3"
    H4_UNCERTAINTY_FAILURE = "H4"
    H5_WRONG_LAB_VALUE_ASSOCIATION = "H5"
    H6_WRONG_UNIT_ASSOCIATION = "H6"
    H7_WRONG_MEDICATION_DOSE_ASSOCIATION = "H7"
    H8_WRONG_TEMPORAL_ASSOCIATION = "H8"
    H9_DUPLICATE_FACT = "H9"
    H10_MISSED_CLINICALLY_RELEVANT_FACT = "H10"
    H11_WRONG_SECTION_CONTEXT = "H11"
    H12_UNSUPPORTED_NORMALIZATION = "H12"
    H13_SOURCE_EVIDENCE_MISMATCH = "H13"
    H14_MALFORMED_STRUCTURED_OUTPUT = "H14"


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def _data(fact: ClinicalFact, key: str) -> str:
    return _norm(fact.data.get(key))


def semantic_key(fact: ClinicalFact) -> tuple[str, ...]:
    if fact.type is FactType.LAB_RESULT:
        return (
            fact.type.value,
            _data(fact, "test_name"),
            _data(fact, "value"),
            _data(fact, "unit"),
        )
    if fact.type is FactType.MEDICATION:
        return (
            fact.type.value,
            _data(fact, "name"),
            _data(fact, "strength"),
            _data(fact, "dose"),
            _data(fact, "route"),
            _data(fact, "frequency"),
        )
    return (fact.type.value, _norm(fact.value))


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _source_grounded(predicted: ClinicalFact, gold: ClinicalFact) -> bool:
    predicted_text = _norm(predicted.source_text)
    gold_text = _norm(gold.source_text)
    return predicted.page == gold.page and (
        predicted_text == gold_text
        or predicted_text in gold_text
        or gold_text in predicted_text
    )


@dataclass(frozen=True, slots=True)
class EvaluationMetrics:
    fact_precision: float | None
    fact_recall: float | None
    fact_f1: float | None
    hallucination_rate: float | None
    source_grounding_accuracy: float | None
    negation_accuracy: float | None
    uncertainty_accuracy: float | None
    lab_test_precision: float | None
    lab_test_recall: float | None
    lab_tuple_accuracy: float | None
    value_association_accuracy: float | None
    unit_association_accuracy: float | None
    medication_precision: float | None
    medication_recall: float | None
    medication_tuple_accuracy: float | None
    dose_association_accuracy: float | None
    frequency_association_accuracy: float | None
    json_validity_rate: float
    schema_validity_rate: float
    document_success_rate: float
    errors: dict[str, int] = field(default_factory=dict)
    predicted_count: int = 0
    gold_count: int = 0
    matched_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _partial_association(
    predicted: list[ClinicalFact],
    gold: list[ClinicalFact],
    *,
    identity: str,
    attribute: str,
) -> tuple[int, int]:
    gold_by_identity: dict[str, list[ClinicalFact]] = {}
    for fact in gold:
        gold_by_identity.setdefault(_data(fact, identity), []).append(fact)
    correct = total = 0
    for prediction in predicted:
        candidates = gold_by_identity.get(_data(prediction, identity), [])
        if not candidates:
            continue
        total += 1
        if any(_data(prediction, attribute) == _data(item, attribute) for item in candidates):
            correct += 1
    return correct, total


def evaluate(
    predicted: list[ClinicalFact],
    gold: GoldAnnotation,
    *,
    json_valid: bool = True,
    schema_valid: bool = True,
) -> EvaluationMetrics:
    gold_facts = [item.fact for item in gold.facts]
    gold_relevant = [item.fact for item in gold.facts if item.clinically_relevant]
    available: dict[tuple[str, ...], list[int]] = {}
    for index, fact in enumerate(gold_facts):
        available.setdefault(semantic_key(fact), []).append(index)

    matches: list[tuple[ClinicalFact, ClinicalFact]] = []
    unmatched_predictions: list[ClinicalFact] = []
    matched_gold_indices: set[int] = set()
    for fact in predicted:
        indices = available.get(semantic_key(fact), [])
        index = next((item for item in indices if item not in matched_gold_indices), None)
        if index is None:
            unmatched_predictions.append(fact)
            continue
        matched_gold_indices.add(index)
        matches.append((fact, gold_facts[index]))

    error_counts: Counter[str] = Counter()
    error_counts[ErrorClass.H1_HALLUCINATED_FACT.value] = len(unmatched_predictions)
    relevant_keys = {semantic_key(fact) for fact in gold_relevant}
    matched_relevant = sum(semantic_key(prediction) in relevant_keys for prediction, _ in matches)
    error_counts[ErrorClass.H10_MISSED_CLINICALLY_RELEVANT_FACT.value] = max(
        0, len(gold_relevant) - matched_relevant
    )

    duplicate_count = len(predicted) - len({fact_key(fact) for fact in predicted})
    error_counts[ErrorClass.H9_DUPLICATE_FACT.value] = duplicate_count

    for prediction, expected in matches:
        if prediction.context.subject != expected.context.subject:
            error_counts[ErrorClass.H2_WRONG_PATIENT_ATTRIBUTION.value] += 1
        if prediction.context.negation != expected.context.negation:
            error_counts[ErrorClass.H3_NEGATION_FAILURE.value] += 1
        if prediction.context.certainty != expected.context.certainty:
            error_counts[ErrorClass.H4_UNCERTAINTY_FAILURE.value] += 1
        if prediction.context.temporality != expected.context.temporality:
            error_counts[ErrorClass.H8_WRONG_TEMPORAL_ASSOCIATION.value] += 1
        if _norm(prediction.section) != _norm(expected.section):
            error_counts[ErrorClass.H11_WRONG_SECTION_CONTEXT.value] += 1
        if not _source_grounded(prediction, expected):
            error_counts[ErrorClass.H13_SOURCE_EVIDENCE_MISMATCH.value] += 1
        if prediction.normalized_value is not None and (
            expected.normalized_value is None
            or _norm(prediction.normalized_value) != _norm(expected.normalized_value)
        ):
            error_counts[ErrorClass.H12_UNSUPPORTED_NORMALIZATION.value] += 1

    if not json_valid or not schema_valid:
        error_counts[ErrorClass.H14_MALFORMED_STRUCTURED_OUTPUT.value] = 1

    pred_labs = [fact for fact in predicted if fact.type is FactType.LAB_RESULT]
    gold_labs = [fact for fact in gold_facts if fact.type is FactType.LAB_RESULT]
    pred_lab_tests = {_data(fact, "test_name") for fact in pred_labs}
    gold_lab_tests = {_data(fact, "test_name") for fact in gold_labs}
    lab_test_matches = len(pred_lab_tests & gold_lab_tests)
    lab_tuple_matches = sum(
        semantic_key(fact) in {semantic_key(item) for item in gold_labs} for fact in pred_labs
    )
    value_correct, value_total = _partial_association(
        pred_labs, gold_labs, identity="test_name", attribute="value"
    )
    unit_correct, unit_total = _partial_association(
        pred_labs, gold_labs, identity="test_name", attribute="unit"
    )
    error_counts[ErrorClass.H5_WRONG_LAB_VALUE_ASSOCIATION.value] = value_total - value_correct
    error_counts[ErrorClass.H6_WRONG_UNIT_ASSOCIATION.value] = unit_total - unit_correct

    pred_meds = [fact for fact in predicted if fact.type is FactType.MEDICATION]
    gold_meds = [fact for fact in gold_facts if fact.type is FactType.MEDICATION]
    pred_med_names = {_data(fact, "name") for fact in pred_meds}
    gold_med_names = {_data(fact, "name") for fact in gold_meds}
    med_name_matches = len(pred_med_names & gold_med_names)
    medication_tuple_matches = sum(
        semantic_key(fact) in {semantic_key(item) for item in gold_meds} for fact in pred_meds
    )
    dose_correct, dose_total = _partial_association(
        pred_meds, gold_meds, identity="name", attribute="dose"
    )
    frequency_correct, frequency_total = _partial_association(
        pred_meds, gold_meds, identity="name", attribute="frequency"
    )
    error_counts[ErrorClass.H7_WRONG_MEDICATION_DOSE_ASSOCIATION.value] = (
        dose_total - dose_correct
    )

    precision = _safe_ratio(len(matches), len(predicted))
    recall = _safe_ratio(len(matches), len(gold_facts))
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall > 0
        else None
    )
    match_count = len(matches)
    grounding_correct = sum(_source_grounded(prediction, expected) for prediction, expected in matches)
    negation_correct = sum(
        prediction.context.negation == expected.context.negation
        for prediction, expected in matches
    )
    uncertainty_correct = sum(
        prediction.context.certainty == expected.context.certainty
        for prediction, expected in matches
    )

    return EvaluationMetrics(
        fact_precision=precision,
        fact_recall=recall,
        fact_f1=f1,
        hallucination_rate=_safe_ratio(len(unmatched_predictions), len(predicted)),
        source_grounding_accuracy=_safe_ratio(grounding_correct, match_count),
        negation_accuracy=_safe_ratio(negation_correct, match_count),
        uncertainty_accuracy=_safe_ratio(uncertainty_correct, match_count),
        lab_test_precision=_safe_ratio(lab_test_matches, len(pred_lab_tests)),
        lab_test_recall=_safe_ratio(lab_test_matches, len(gold_lab_tests)),
        lab_tuple_accuracy=_safe_ratio(lab_tuple_matches, len(gold_labs)),
        value_association_accuracy=_safe_ratio(value_correct, value_total),
        unit_association_accuracy=_safe_ratio(unit_correct, unit_total),
        medication_precision=_safe_ratio(med_name_matches, len(pred_med_names)),
        medication_recall=_safe_ratio(med_name_matches, len(gold_med_names)),
        medication_tuple_accuracy=_safe_ratio(medication_tuple_matches, len(gold_meds)),
        dose_association_accuracy=_safe_ratio(dose_correct, dose_total),
        frequency_association_accuracy=_safe_ratio(frequency_correct, frequency_total),
        json_validity_rate=1.0 if json_valid else 0.0,
        schema_validity_rate=1.0 if schema_valid else 0.0,
        document_success_rate=1.0 if json_valid and schema_valid else 0.0,
        errors={error.value: error_counts[error.value] for error in ErrorClass},
        predicted_count=len(predicted),
        gold_count=len(gold_facts),
        matched_count=match_count,
    )
