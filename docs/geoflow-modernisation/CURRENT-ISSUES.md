# Current Issues

## Blockers

1. Required project metadata is missing in the linked record, blocking controlled final issue.
2. There is no immutable issued-PDF entity with reviewer, issue number/date, source checksum and PDF checksum.
3. The public Worker has no active project/user authorization when `AUTOSOIL_API_KEY` is unset.

## First Slice Defects

1. Manual soil descriptions are protected by `descTouched`, but users cannot see whether a row is structured, manually amended, or stale relative to its fields.
2. SPT does not store end depth, per-increment penetration or hammer-bounce state; partial tests rely on remarks.
3. The phone soil screen exposes only the left edge of a wide desktop grid, hides validation/description review, and has controls below the preferred 44 px touch target.
4. Validation messages are strings rather than records with stable severity, record/depth target and fix action.
5. PDF preview can mutate source values while "repairing" invalid data.

## Baseline Design Findings

Impeccable reported cramped right-panel padding, an overused Roboto fallback, one font family, and a flat type scale. A single family is an intentional product-UI choice, but spacing and hierarchy need correction in changed surfaces. The active shell is blue/slate rather than STS green and still contains inconsistent legacy component styles.

## Deferred

Canonical core runs, independent defects/zones, complete sample custody, unified review tracks, issue history, and desktop conflict handling remain later milestones.
