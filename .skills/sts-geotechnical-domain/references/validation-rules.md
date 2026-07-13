# Validation Rules

## Blockers

- Missing borehole ID or required project metadata for final issue.
- From/to absent, non-numeric, equal or reversed for an interval.
- Overlap or observation below termination.
- RQD or TCR outside 0-100; RQD greater than TCR.
- Incomplete/refusal SPT displayed as an ordinary N value.
- Duplicate sample ID within a project.
- Rendering failure, omitted source observation or migration failure.

## Warnings

- Depth gap, missing groundwater status, missing orientation, unconfirmed suggestion.
- Manual calculation override, long description, duplicate-looking defect.
- Core recovery mismatch or incomplete weathering/strength coverage.

Every issue states severity, record/depth, why it matters and an action target. Validation never changes source data.
