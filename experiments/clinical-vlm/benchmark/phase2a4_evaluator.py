"""Aggregate-only evaluator for the frozen Phase 2A.4 synthetic benchmark."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

from pydantic import ValidationError

from clinical_vlm.category_validation import EnvelopeValidationError, validate_vlm_categories
from clinical_vlm.interfaces import DocumentInput, RenderedPage
from clinical_vlm.metrics import ErrorClass, evaluate, semantic_key
from clinical_vlm.models import (
    CanonicalExtraction,
    Certainty,
    ClinicalContext,
    ClinicalFact,
    FactType,
    GoldAnnotation,
    GoldFact,
    Negation,
    Subject,
    Temporality,
)
from clinical_vlm.provenance import validate_fact_grounding
from clinical_vlm.vlm_canonical_adapter import adapt_vlm_extraction
from clinical_vlm.vlm_schema import VLMExtraction


@dataclass(slots=True)
class Aggregate:
    predicted: int = 0
    gold: int = 0
    matched: int = 0
    grounded: int = 0
    lab_gold: int = 0
    lab_matched: int = 0
    medication_gold: int = 0
    medication_matched: int = 0
    context_gold: Counter[str] = field(default_factory=Counter)
    context_correct: Counter[str] = field(default_factory=Counter)

    def add(
        self,
        predicted: list[ClinicalFact],
        gold: list[ClinicalFact],
        document: DocumentInput,
    ) -> None:
        matches, _, _ = match_facts(predicted, gold)
        self.predicted += len(predicted)
        self.gold += len(gold)
        self.matched += len(matches)
        self.grounded += sum(validate_fact_grounding(fact, document).valid for fact in predicted)
        gold_labs = [fact for fact in gold if fact.type is FactType.LAB_RESULT]
        gold_meds = [fact for fact in gold if fact.type is FactType.MEDICATION]
        self.lab_gold += len(gold_labs)
        self.medication_gold += len(gold_meds)
        self.lab_matched += sum(expected.type is FactType.LAB_RESULT for _, expected in matches)
        self.medication_matched += sum(expected.type is FactType.MEDICATION for _, expected in matches)

        matched_by_key = {semantic_key(expected): prediction for prediction, expected in matches}
        for expected in gold:
            checks: list[tuple[str, bool]] = []
            if expected.context.negation is not Negation.AFFIRMED:
                checks.append(("negation", True))
            if expected.context.certainty is not Certainty.CERTAIN:
                checks.append(("uncertainty", True))
            if expected.context.temporality is not Temporality.UNKNOWN:
                checks.append(("temporal", True))
            if expected.context.subject is not Subject.PATIENT:
                checks.append(("subject", True))
            prediction = matched_by_key.get(semantic_key(expected))
            for name, _ in checks:
                self.context_gold[name] += 1
                attribute = {
                    "negation": "negation",
                    "uncertainty": "certainty",
                    "temporal": "temporality",
                    "subject": "subject",
                }[name]
                if prediction is not None and getattr(
                    prediction.context, attribute
                ) == getattr(expected.context, attribute):
                    self.context_correct[name] += 1

    def metrics(self) -> dict[str, Any]:
        precision = ratio(self.matched, self.predicted)
        recall = ratio(self.matched, self.gold)
        return {
            "predicted": self.predicted,
            "gold": self.gold,
            "matched": self.matched,
            "precision": precision,
            "recall": recall,
            "f1": f1(precision, recall),
            "hallucination_count": self.predicted - self.matched,
            "hallucination_rate": ratio(self.predicted - self.matched, self.predicted),
            "grounding_accuracy": ratio(self.grounded, self.predicted),
            "lab_tuple_accuracy": ratio(self.lab_matched, self.lab_gold),
            "medication_tuple_accuracy": ratio(self.medication_matched, self.medication_gold),
            "negation_accuracy": ratio(self.context_correct["negation"], self.context_gold["negation"]),
            "uncertainty_accuracy": ratio(self.context_correct["uncertainty"], self.context_gold["uncertainty"]),
            "temporal_accuracy": ratio(self.context_correct["temporal"], self.context_gold["temporal"]),
            "subject_attribution_accuracy": ratio(self.context_correct["subject"], self.context_gold["subject"]),
        }


def ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def f1(precision: float | None, recall: float | None) -> float | None:
    if precision is None or recall is None or precision + recall == 0:
        return None
    return 2 * precision * recall / (precision + recall)


def context_for(assertion: str) -> ClinicalContext:
    if assertion == "absent":
        return ClinicalContext(negation=Negation.NEGATED)
    if assertion == "possible":
        return ClinicalContext(certainty=Certainty.POSSIBLE)
    if assertion == "historical":
        return ClinicalContext(temporality=Temporality.HISTORICAL)
    if assertion == "family_history":
        return ClinicalContext(subject=Subject.FAMILY)
    if assertion == "present":
        return ClinicalContext()
    return ClinicalContext(
        subject=Subject.UNKNOWN,
        negation=Negation.UNKNOWN,
        certainty=Certainty.UNKNOWN,
        temporality=Temporality.UNKNOWN,
    )


def raw_fact(
    fact_type: FactType,
    value: Any,
    candidate: dict[str, Any],
    data: dict[str, Any],
    *,
    section: str,
    context: ClinicalContext | None = None,
) -> ClinicalFact | None:
    page = candidate.get("page")
    source = candidate.get("source_text")
    if not isinstance(page, int) or page < 1 or not isinstance(source, str) or not source.strip():
        return None
    try:
        return ClinicalFact(
            type=fact_type,
            value=value,
            page=page,
            source_text=source,
            confidence=0.5,
            section=section,
            data=data,
            context=context or ClinicalContext(),
        )
    except ValidationError:
        return None


def raw_facts(payload: Any) -> list[ClinicalFact]:
    if not isinstance(payload, dict):
        return []
    facts: list[ClinicalFact] = []
    patient = payload.get("patient")
    if isinstance(patient, dict):
        if isinstance(patient.get("name"), str):
            fact = raw_fact(FactType.PATIENT, patient["name"], patient, {"name": patient["name"]}, section="patient")
            if fact:
                facts.append(fact)
        if isinstance(patient.get("date"), str):
            fact = raw_fact(FactType.DOCUMENT_METADATA, patient["date"], patient, {"report_date": patient["date"]}, section="header")
            if fact:
                facts.append(fact)
    for candidate in payload.get("labs", []) if isinstance(payload.get("labs"), list) else []:
        if not isinstance(candidate, dict):
            continue
        if all(isinstance(candidate.get(key), str) for key in ("test_name", "value")):
            fact = raw_fact(FactType.LAB_RESULT, candidate["value"], candidate, {"test_name": candidate.get("test_name"), "value": candidate.get("value"), "unit": candidate.get("unit"), "reference_range": candidate.get("reference_range")}, section="labs")
            if fact:
                facts.append(fact)
    for candidate in payload.get("diagnoses", []) if isinstance(payload.get("diagnoses"), list) else []:
        if not isinstance(candidate, dict) or not isinstance(candidate.get("name"), str):
            continue
        assertion = str(candidate.get("assertion", "unknown"))
        fact = raw_fact(FactType.DIAGNOSIS, candidate["name"], candidate, {"name": candidate["name"], "status": assertion}, section="impression", context=context_for(assertion))
        if fact:
            facts.append(fact)
    for candidate in payload.get("medications", []) if isinstance(payload.get("medications"), list) else []:
        if not isinstance(candidate, dict) or not isinstance(candidate.get("name"), str):
            continue
        fact = raw_fact(FactType.MEDICATION, candidate["name"], candidate, {"name": candidate.get("name"), "strength": candidate.get("strength"), "dose": candidate.get("dose"), "route": candidate.get("route"), "frequency": candidate.get("frequency")}, section="medications")
        if fact:
            facts.append(fact)
    for candidate in payload.get("allergies", []) if isinstance(payload.get("allergies"), list) else []:
        if not isinstance(candidate, dict) or not isinstance(candidate.get("allergen"), str):
            continue
        assertion = str(candidate.get("assertion", "unknown"))
        fact = raw_fact(FactType.ALLERGY, candidate["allergen"], candidate, {"allergen": candidate.get("allergen"), "reaction": candidate.get("reaction"), "severity": candidate.get("severity"), "status": assertion}, section="allergies", context=context_for(assertion))
        if fact:
            facts.append(fact)
    return facts


def match_facts(
    predicted: list[ClinicalFact], gold: list[ClinicalFact]
) -> tuple[list[tuple[ClinicalFact, ClinicalFact]], list[ClinicalFact], list[ClinicalFact]]:
    available: dict[tuple[str, ...], list[int]] = defaultdict(list)
    for index, fact in enumerate(gold):
        available[semantic_key(fact)].append(index)
    used: set[int] = set()
    matches: list[tuple[ClinicalFact, ClinicalFact]] = []
    unmatched_predictions: list[ClinicalFact] = []
    for prediction in predicted:
        index = next((item for item in available.get(semantic_key(prediction), []) if item not in used), None)
        if index is None:
            unmatched_predictions.append(prediction)
        else:
            used.add(index)
            matches.append((prediction, gold[index]))
    return matches, unmatched_predictions, [fact for index, fact in enumerate(gold) if index not in used]


def gold_annotation(gold_payload: dict[str, Any]) -> GoldAnnotation:
    extraction = VLMExtraction.model_validate(gold_payload["expected_envelope"])
    canonical = adapt_vlm_extraction(extraction, document_id=gold_payload["document_id"])
    return GoldAnnotation(
        fixture_id=gold_payload["document_id"],
        document_id=gold_payload["document_id"],
        source_kind="synthetic",
        annotated_by="deterministic-source-generator",
        annotation_version=1,
        facts=[GoldFact(gold_id=f"fact-{index:03d}", fact=fact) for index, fact in enumerate(canonical.facts)],
    )


CATEGORY_TYPES = {
    "labs": {FactType.LAB_RESULT},
    "medications": {FactType.MEDICATION},
    "diagnoses_findings": {FactType.DIAGNOSIS, FactType.IMAGING_FINDING, FactType.CLINICAL_FINDING},
    "allergies": {FactType.ALLERGY},
    "metadata": {FactType.PATIENT, FactType.DOCUMENT_METADATA},
}


def subset(facts: Iterable[ClinicalFact], types: set[FactType]) -> list[ClinicalFact]:
    return [fact for fact in facts if fact.type in types]


def percentile95(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1)]


def evaluate_run(benchmark: Path, results: Path) -> dict[str, Any]:
    manifest = json.loads((benchmark / "benchmark_manifest.json").read_text())
    run_metadata = json.loads((results / "run-metadata.json").read_text())
    raw_aggregate = Aggregate()
    post_aggregate = Aggregate()
    difficulty_raw: dict[str, Aggregate] = defaultdict(Aggregate)
    difficulty_post: dict[str, Aggregate] = defaultdict(Aggregate)
    category_raw: dict[str, Aggregate] = defaultdict(Aggregate)
    category_post: dict[str, Aggregate] = defaultdict(Aggregate)
    errors: Counter[str] = Counter()
    json_valid = schema_valid = accepted = rejected = envelope_failures = 0
    latencies: list[float] = []
    tokens: list[int] = []
    peak_memory: list[float] = []

    for item in manifest["documents"]:
        document_id = item["document_id"]
        gold_payload = json.loads((benchmark / "gold" / f"{document_id}.json").read_text())
        gold = gold_annotation(gold_payload)
        gold_facts = [item.fact for item in gold.facts]
        document = DocumentInput(
            document_id=document_id,
            pages=(RenderedPage(page_number=1, image_path=benchmark / "pages" / f"{document_id}.png", width=1600, height=2100, dpi=200, local_reference_text=gold_payload["reference_text"]),),
        )
        wrapper = json.loads((results / "outputs" / f"{document_id}.json").read_text())
        latencies.append(float(wrapper["inference_seconds"]))
        tokens.append(int(wrapper["output_tokens"]))
        peak_memory.append(float(wrapper["peak_mlx_memory_gb"]))
        raw_text = wrapper["raw_output"]
        try:
            payload = json.loads(raw_text)
            document_json_valid = True
            json_valid += 1
        except json.JSONDecodeError:
            payload = None
            document_json_valid = False
        try:
            VLMExtraction.model_validate(payload)
            document_schema_valid = document_json_valid
            if document_schema_valid:
                schema_valid += 1
        except ValidationError:
            document_schema_valid = False

        raw_prediction = raw_facts(payload)
        raw_aggregate.add(raw_prediction, gold_facts, document)
        difficulty_raw[item["difficulty"]].add(raw_prediction, gold_facts, document)
        for category, types in CATEGORY_TYPES.items():
            category_raw[category].add(subset(raw_prediction, types), subset(gold_facts, types), document)

        try:
            validation = validate_vlm_categories(payload, document=document)
            post_prediction = validation.canonical.facts
            accepted += validation.metrics.accepted_candidates
            rejected += validation.metrics.rejected_candidates
        except EnvelopeValidationError:
            post_prediction = []
            envelope_failures += 1
        post_aggregate.add(post_prediction, gold_facts, document)
        difficulty_post[item["difficulty"]].add(post_prediction, gold_facts, document)
        for category, types in CATEGORY_TYPES.items():
            category_post[category].add(subset(post_prediction, types), subset(gold_facts, types), document)
        document_metrics = evaluate(post_prediction, gold, json_valid=document_json_valid, schema_valid=document_schema_valid)
        errors.update(document_metrics.errors)

    document_count = len(manifest["documents"])
    raw_metrics = raw_aggregate.metrics()
    post_metrics = post_aggregate.metrics()
    return {
        "benchmark": {"documents": document_count, "pages": sum(item["page_count"] for item in manifest["documents"]), "seed": manifest["seed"]},
        "model": run_metadata,
        "raw": {**raw_metrics, "json_valid_rate": json_valid / document_count, "schema_valid_rate": schema_valid / document_count},
        "validated": {**post_metrics, "accepted_candidates": accepted, "rejected_candidates": rejected, "unsafe_candidates_accepted": post_metrics["hallucination_count"], "valid_candidates_lost": post_aggregate.gold - post_aggregate.matched, "envelope_failures": envelope_failures},
        "difficulty": {difficulty: {"raw": difficulty_raw[difficulty].metrics(), "validated": difficulty_post[difficulty].metrics()} for difficulty in ("easy", "medium", "hard")},
        "categories": {category: {"raw": category_raw[category].metrics(), "validated": category_post[category].metrics()} for category in CATEGORY_TYPES},
        "errors": {error.value: errors[error.value] for error in ErrorClass},
        "performance": {
            "model_load_seconds": run_metadata["model_load_seconds"],
            "total_inference_seconds": sum(latencies),
            "mean_seconds_per_page": statistics.mean(latencies),
            "median_seconds_per_page": statistics.median(latencies),
            "p95_seconds_per_page": percentile95(latencies),
            "peak_mlx_memory_gb": max(peak_memory),
            "output_token_total": sum(tokens),
            "output_token_mean": statistics.mean(tokens),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    summary = evaluate_run(args.benchmark, args.results)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"raw": summary["raw"], "validated": summary["validated"], "performance": summary["performance"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
