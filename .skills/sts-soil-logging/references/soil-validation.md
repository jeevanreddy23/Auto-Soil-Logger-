# Soil Validation

- Require numeric from/to and `from < to` for complete intervals.
- Report exact gap or overlap thickness and both affected records.
- Flag intervals or subordinate notes below termination.
- Warn when material exists without a description or classification review.
- Preserve manual text and report out-of-sync state after structured fields change.
- Do not shift boundaries to remove label collisions in the PDF.

Evaluation set:

- Normal: two contiguous intervals save and reload unchanged.
- Boundary: 0.00 m start and termination-aligned end.
- Invalid: overlap and reversed interval.
- Ambiguous: manual description differs from structured values.
- Regression: legacy `descTouched` row without new metadata remains manual and printable.
