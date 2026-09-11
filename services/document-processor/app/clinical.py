"""Optional, verified OpenMed clinical utilities behind a stable local interface."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ClinicalEnhancement:
    normalized_units: tuple[str, ...] = ()
    provider: str = "none"
    version: str = "unavailable"
    status: str = "disabled"


class ClinicalNlpProvider(Protocol):
    def enhance(self, text: str) -> ClinicalEnhancement: ...


class NoopClinicalNlpProvider:
    def enhance(self, text: str) -> ClinicalEnhancement:
        del text
        return ClinicalEnhancement()


class OpenMedClinicalNlpProvider:
    """Use only verified OpenMed APIs; MedMemory retains candidate authority."""

    def enhance(self, text: str) -> ClinicalEnhancement:
        try:
            from importlib.metadata import version

            from openmed.clinical import normalize_unit_surface, split_measurement_text
        except (ImportError, ModuleNotFoundError) as error:
            raise RuntimeError("OPENMED_UNAVAILABLE") from error
        units: list[str] = []
        for line in text.splitlines():
            measurement = split_measurement_text(line.strip())
            if measurement:
                normalized = normalize_unit_surface(measurement[1])
                if normalized:
                    units.append(normalized)
        return ClinicalEnhancement(tuple(units), "openmed", version("openmed"), "available")


class CompositeClinicalNlpProvider:
    def __init__(self, primary: ClinicalNlpProvider, fallback: ClinicalNlpProvider):
        self.primary, self.fallback = primary, fallback

    def enhance(self, text: str) -> ClinicalEnhancement:
        try:
            return self.primary.enhance(text)
        except (RuntimeError, ValueError, TypeError):
            return self.fallback.enhance(text)
