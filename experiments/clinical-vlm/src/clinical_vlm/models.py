"""Strict, versioned experiment contracts.

These contracts intentionally mirror MedMemory's existing candidate shape:
common provenance fields plus a category-specific ``data`` object. They are
not database models and do not alter the production extraction schema.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = "1.0.0"
PROMPT_VERSION = "extract-v1"

Scalar: TypeAlias = str | int | float | bool | None

class FactType(str, Enum):
    DOCUMENT_METADATA = "document_metadata"
    PATIENT = "patient"
    SYMPTOM = "symptom"
    DIAGNOSIS = "diagnosis"
    MEDICATION = "medication"
    ALLERGY = "allergy"
    LAB_RESULT = "lab_result"
    VITAL = "vital"
    IMAGING_FINDING = "imaging_finding"
    PROCEDURE = "procedure"
    PAST_MEDICAL_HISTORY = "past_medical_history"
    TREATMENT_COURSE = "treatment_course"
    DISCHARGE_ADVICE = "discharge_advice"
    FOLLOW_UP = "follow_up"
    CLINICAL_FINDING = "clinical_finding"
    UNMAPPED = "unmapped"


ALLOWED_DATA_KEYS: dict[FactType, frozenset[str]] = {
    FactType.DOCUMENT_METADATA: frozenset(
        {"document_type", "report_date", "facility", "clinician"}
    ),
    FactType.PATIENT: frozenset(
        {"name", "age", "date_of_birth", "sex", "identifier_type", "identifier"}
    ),
    FactType.SYMPTOM: frozenset({"name", "onset", "duration", "severity"}),
    FactType.DIAGNOSIS: frozenset({"name", "code", "diagnosed_at", "status"}),
    FactType.MEDICATION: frozenset(
        {
            "name",
            "generic_name",
            "strength",
            "dose",
            "dose_unit",
            "route",
            "frequency",
            "duration",
            "start_date",
            "end_date",
            "status",
        }
    ),
    FactType.ALLERGY: frozenset({"allergen", "reaction", "severity", "status"}),
    FactType.LAB_RESULT: frozenset(
        {
            "test_name",
            "value",
            "original_value",
            "numeric_value",
            "unit",
            "reference_range",
            "abnormal_flag",
            "flag",
            "specimen",
            "collected_at",
        }
    ),
    FactType.VITAL: frozenset(
        {
            "measurement_type",
            "label",
            "value",
            "original_value",
            "numeric_value",
            "secondary_value",
            "unit",
            "measured_at",
        }
    ),
    FactType.IMAGING_FINDING: frozenset(
        {"modality", "body_region", "finding", "impression", "performed_at"}
    ),
    FactType.PROCEDURE: frozenset({"procedure_name", "performed_at", "notes"}),
    FactType.PAST_MEDICAL_HISTORY: frozenset(
        {"name", "diagnosed_at", "status"}
    ),
    FactType.TREATMENT_COURSE: frozenset({"text", "start_date", "end_date"}),
    FactType.DISCHARGE_ADVICE: frozenset({"advice"}),
    FactType.FOLLOW_UP: frozenset({"instruction", "due_date", "clinician"}),
    FactType.CLINICAL_FINDING: frozenset({"text"}),
    FactType.UNMAPPED: frozenset({"text", "reason"}),
}


class Subject(str, Enum):
    PATIENT = "patient"
    FAMILY = "family"
    OTHER = "other"
    UNKNOWN = "unknown"


class Negation(str, Enum):
    AFFIRMED = "affirmed"
    NEGATED = "negated"
    UNKNOWN = "unknown"


class Certainty(str, Enum):
    CERTAIN = "certain"
    POSSIBLE = "possible"
    SUSPECTED = "suspected"
    RULED_OUT = "ruled_out"
    UNKNOWN = "unknown"


class Temporality(str, Enum):
    CURRENT = "current"
    HISTORICAL = "historical"
    FUTURE = "future"
    UNKNOWN = "unknown"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ClinicalContext(StrictModel):
    subject: Subject = Subject.PATIENT
    negation: Negation = Negation.AFFIRMED
    certainty: Certainty = Certainty.CERTAIN
    temporality: Temporality = Temporality.UNKNOWN


class ClinicalFact(StrictModel):
    type: FactType
    value: Scalar
    normalized_value: Scalar = None
    page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=4000)
    source_block_ids: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=100
    )
    bbox: tuple[float, float, float, float] | None = None
    section: str | None = Field(default=None, max_length=200)
    confidence: float = Field(ge=0, le=1)
    status: Literal["candidate"] = "candidate"
    context: ClinicalContext = Field(default_factory=ClinicalContext)
    data: dict[str, Scalar] = Field(default_factory=dict)

    @field_validator("source_text")
    @classmethod
    def source_must_contain_visible_text(cls, value: str) -> str:
        if not any(character.isalnum() for character in value):
            raise ValueError("source_text must contain visible alphanumeric evidence")
        return value

    @field_validator("bbox")
    @classmethod
    def valid_bbox(
        cls, value: tuple[float, float, float, float] | None
    ) -> tuple[float, float, float, float] | None:
        if value is None:
            return None
        x0, y0, x1, y1 = value
        if min(value) < 0 or x1 <= x0 or y1 <= y0:
            raise ValueError("bbox must be non-negative with x1>x0 and y1>y0")
        return value

    @model_validator(mode="after")
    def required_tuple_members(self) -> ClinicalFact:
        unexpected = set(self.data) - ALLOWED_DATA_KEYS[self.type]
        if unexpected:
            raise ValueError(f"unsupported data fields for {self.type.value}")
        if self.type is FactType.LAB_RESULT:
            required = ("test_name", "value")
            if any(self.data.get(key) in (None, "") for key in required):
                raise ValueError("lab_result requires data.test_name and data.value")
        if self.type is FactType.MEDICATION and not self.data.get("name"):
            raise ValueError("medication requires data.name")
        return self


class CanonicalExtraction(StrictModel):
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION
    prompt_version: Literal[PROMPT_VERSION] = PROMPT_VERSION
    document_id: str = Field(min_length=1, max_length=200)
    facts: list[ClinicalFact] = Field(default_factory=list, max_length=2000)
    warnings: list[Annotated[str, Field(pattern=r"^[A-Z0-9_]{2,80}$")]] = Field(
        default_factory=list, max_length=100
    )


class GoldFact(StrictModel):
    gold_id: str = Field(pattern=r"^[a-zA-Z0-9_.-]{1,100}$")
    fact: ClinicalFact
    clinically_relevant: bool = True
    notes: str | None = Field(default=None, max_length=500)


class GoldAnnotation(StrictModel):
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION
    fixture_id: str = Field(pattern=r"^[a-zA-Z0-9_.-]{1,100}$")
    document_id: str = Field(min_length=1, max_length=200)
    source_kind: Literal["synthetic", "deidentified", "approved_local"]
    facts: list[GoldFact] = Field(default_factory=list, max_length=2000)
    annotated_by: str = Field(min_length=1, max_length=100)
    annotation_version: int = Field(ge=1)
