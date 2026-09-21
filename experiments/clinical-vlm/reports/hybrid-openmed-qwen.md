# OpenMed + Qwen experimental reconciliation

This design remains isolated from production MedMemory until a separately approved
integration phase.

1. The document processor extracts OCR/layout blocks and OpenMed candidates.
2. Qwen reads the unchanged page image and emits the narrow VLM schema.
3. Each provider's fact must independently pass canonical schema and source-grounding
   checks before reconciliation.
4. Exact semantic agreement across both providers may be approved automatically.
5. A fact supported by only one provider requires review.
6. Conflicting values, units, or assertion context require review; neither provider
   silently overrides the other.
7. Ungrounded facts and medication sentinel values such as `None` are rejected.

The reconciler does not normalize units, repair values, infer diagnoses, or invent
evidence. It retains provider attribution outside the canonical medical fact so the
decision remains auditable.
