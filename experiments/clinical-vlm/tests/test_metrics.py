from __future__ import annotations

from clinical_vlm.metrics import evaluate
from clinical_vlm.models import CanonicalExtraction, GoldAnnotation


def test_perfect_metrics(prediction_payload: dict, gold_payload: dict) -> None:
    prediction = CanonicalExtraction.model_validate(prediction_payload)
    gold = GoldAnnotation.model_validate(gold_payload)
    metrics = evaluate(prediction.facts, gold)
    assert metrics.fact_precision == 1
    assert metrics.fact_recall == 1
    assert metrics.fact_f1 == 1
    assert metrics.hallucination_rate == 0
    assert metrics.lab_tuple_accuracy == 1
    assert metrics.medication_tuple_accuracy == 1
    assert metrics.source_grounding_accuracy == 1
    assert metrics.errors["H1"] == 0
    assert metrics.errors["H10"] == 0


def test_negation_and_uncertainty_failures_are_counted(
    prediction_payload: dict, gold_payload: dict
) -> None:
    prediction_payload["facts"][2]["context"]["negation"] = "affirmed"
    prediction_payload["facts"][3]["context"]["certainty"] = "certain"
    prediction = CanonicalExtraction.model_validate(prediction_payload)
    metrics = evaluate(prediction.facts, GoldAnnotation.model_validate(gold_payload))
    assert metrics.negation_accuracy == 0.75
    assert metrics.uncertainty_accuracy == 0.75
    assert metrics.errors["H3"] == 1
    assert metrics.errors["H4"] == 1


def test_wrong_lab_value_and_unit_association_are_critical(
    prediction_payload: dict, gold_payload: dict
) -> None:
    prediction_payload["facts"][0]["data"]["value"] = "291"
    prediction_payload["facts"][0]["data"]["unit"] = "x10^3/uL"
    prediction_payload["facts"][0]["value"] = "291"
    prediction = CanonicalExtraction.model_validate(prediction_payload)
    metrics = evaluate(prediction.facts, GoldAnnotation.model_validate(gold_payload))
    assert metrics.lab_tuple_accuracy == 0
    assert metrics.value_association_accuracy == 0
    assert metrics.unit_association_accuracy == 0
    assert metrics.errors["H5"] == 1
    assert metrics.errors["H6"] == 1


def test_wrong_medication_dose_association_is_critical(
    prediction_payload: dict, gold_payload: dict
) -> None:
    prediction_payload["facts"][1]["data"]["dose"] = "50 mg"
    prediction = CanonicalExtraction.model_validate(prediction_payload)
    metrics = evaluate(prediction.facts, GoldAnnotation.model_validate(gold_payload))
    assert metrics.medication_tuple_accuracy == 0
    assert metrics.dose_association_accuracy == 0
    assert metrics.errors["H7"] == 1


def test_hallucination_and_miss_accounting(prediction_payload: dict, gold_payload: dict) -> None:
    prediction_payload["facts"] = prediction_payload["facts"][1:]
    hallucination = dict(prediction_payload["facts"][0])
    hallucination["value"] = "Invented medicine"
    hallucination["data"] = {
        "name": "Invented medicine",
        "strength": None,
        "dose": None,
        "route": None,
        "frequency": None,
    }
    prediction_payload["facts"].append(hallucination)
    prediction = CanonicalExtraction.model_validate(prediction_payload)
    metrics = evaluate(prediction.facts, GoldAnnotation.model_validate(gold_payload))
    assert metrics.errors["H1"] == 1
    assert metrics.errors["H10"] == 1
    assert metrics.hallucination_rate == 0.25


def test_malformed_output_maps_to_h14(gold_payload: dict) -> None:
    metrics = evaluate([], GoldAnnotation.model_validate(gold_payload), json_valid=False, schema_valid=False)
    assert metrics.json_validity_rate == 0
    assert metrics.schema_validity_rate == 0
    assert metrics.document_success_rate == 0
    assert metrics.errors["H14"] == 1
