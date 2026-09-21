"""Small, image-facing schema for the compact VLM experiment.

The model produces this deliberately narrow contract. A deterministic adapter
then maps it into the experiment's canonical schema without repairing medical
values, units, assertions, or evidence text.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

VLM_CONTRACT_VERSION = "2.0.0"
VLM_PROMPT_VERSION = "extract-v2"

# This deliberately narrow image-facing contract accepts numeric laboratory
# results only. Qualitative results need a separately reviewed contract rather
# than being guessed into this field.
LAB_NUMERIC_VALUE_PATTERN = r"^(?:[<>]=?|[≤≥])?\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)$"


class StrictVLMModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class VLMPatient(StrictVLMModel):
    name: str | None = Field(default=None, max_length=200)
    date: str | None = Field(default=None, max_length=100)
    page: int = Field(ge=1)
    # No default is intentional: constrained decoding must emit this property.
    # It may be null only when both patient fields are absent.
    source_text: str | None = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def evidence_required_for_present_values(self) -> VLMPatient:
        if (self.name is not None or self.date is not None) and self.source_text is None:
            raise ValueError("patient name/date requires source_text")
        return self


class VLMLab(StrictVLMModel):
    test_name: str = Field(min_length=1, max_length=200)
    value: str = Field(
        min_length=1,
        max_length=100,
        pattern=LAB_NUMERIC_VALUE_PATTERN,
    )
    unit: str = Field(min_length=1, max_length=100)
    reference_range: str | None = Field(default=None, max_length=200)
    page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=1000)

    @field_validator("unit")
    @classmethod
    def unit_must_be_visible_measurement_text(cls, value: str) -> str:
        if "\n" in value or "\r" in value:
            raise ValueError("lab unit must be a single visible unit")
        if not any(character.isalpha() for character in value) and "%" not in value:
            raise ValueError("lab unit must contain a unit symbol")
        return value

    @model_validator(mode="after")
    def tuple_must_be_verbatim_in_source_row(self) -> VLMLab:
        source = " ".join(self.source_text.split()).casefold()
        test_name = " ".join(self.test_name.split()).casefold()
        value = " ".join(self.value.split()).casefold()
        unit = " ".join(self.unit.split()).casefold()

        if test_name not in source:
            raise ValueError("source_text must contain the lab test name")

        # Contiguity prevents a shortened unit such as `uL` from passing when
        # the visible tuple is `291 x10^3/uL`. It also prevents unit text from
        # being duplicated inside the value field. No repair is attempted.
        tuple_pattern = re.compile(
            rf"(?<!\w){re.escape(value)}\s+{re.escape(unit)}(?=\s|$)",
            re.IGNORECASE,
        )
        if tuple_pattern.search(source) is None:
            raise ValueError(
                "source_text must contain value immediately followed by the complete unit"
            )

        if self.reference_range is not None:
            reference_range = " ".join(self.reference_range.split()).casefold()
            if reference_range not in source:
                raise ValueError("source_text must contain reference_range")
        return self


class VLMDiagnosis(StrictVLMModel):
    name: str = Field(min_length=1, max_length=300)
    assertion: Literal[
        "present", "absent", "possible", "historical", "family_history"
    ]
    page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=1000)


class VLMMedication(StrictVLMModel):
    name: str = Field(min_length=1, max_length=300)
    strength: str | None = Field(default=None, max_length=100)
    dose: str | None = Field(default=None, max_length=100)
    route: str | None = Field(default=None, max_length=100)
    frequency: str | None = Field(default=None, max_length=200)
    page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=1000)

    @field_validator("name")
    @classmethod
    def none_sentinel_is_not_a_medication(cls, value: str) -> str:
        sentinel = " ".join(value.casefold().split()).rstrip(".")
        if sentinel in {"none", "nil", "no medication", "no medications"}:
            raise ValueError("medication absence must be represented by an empty list")
        return value


class VLMAllergy(StrictVLMModel):
    allergen: str = Field(min_length=1, max_length=300)
    assertion: Literal[
        "present", "absent", "possible", "historical", "family_history"
    ]
    reaction: str | None = Field(default=None, max_length=300)
    severity: str | None = Field(default=None, max_length=100)
    page: int = Field(ge=1)
    source_text: str = Field(min_length=1, max_length=1000)


class VLMExtraction(StrictVLMModel):
    patient: VLMPatient
    labs: list[VLMLab] = Field(max_length=200)
    diagnoses: list[VLMDiagnosis] = Field(max_length=200)
    medications: list[VLMMedication] = Field(max_length=200)
    allergies: list[VLMAllergy] = Field(default_factory=list, max_length=200)
