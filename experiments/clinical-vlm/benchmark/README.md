# Benchmark protocol

1. Use a small, explicitly approved local set spanning lab tables, prescriptions,
   radiology, discharge summaries, scans, and multi-column pages.
2. Keep document files and predictions under ignored local directories.
3. Annotate facts manually with `gold-template.json`; the model cannot grade itself.
4. Run the unchanged MedMemory baseline and convert its candidates with the baseline
   adapter.
5. Render pages at the recorded settings and run the local VLM page by page.
6. Evaluate both through the same canonical schema and metric implementation.
7. Review all H1-H14 counts, especially hallucination, evidence mismatch, negation,
   lab tuple association, and medication dose association.
8. Commit aggregate metrics only after inspecting them for raw medical content.

The initial benchmark is not a clinical efficacy claim. A model wins only with evidence
of lower hallucination, stronger grounding and tuple association, and acceptable
resource cost. Higher recall alone is insufficient.
