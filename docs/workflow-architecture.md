# GeoFlow workflow architecture — September 2026

## Active components

- `geoflow-workflow.js`: pure evaluation of eight project delivery stages; laboratory row enumeration; report-source change detection.
- `v24-flow` in `index.html`: presentation and routing only. It reads the engine for both the next-action bar and Pipeline cards.
- `geoflow-workflow-refresh`: refreshes workflow after saves, field changes and window focus without changing engineering records.
- `geoflow-premium.js`: registers the Workflow workspace and persistent project route.
- `geoflow-reports.js`: records generation metadata only after successful file storage; detects changed source records; selects the report targeted by a workflow blocker.

## Dependencies

Project record → Scope → Plan → Fieldwork → QA → Sign-off → Handover preparation.
Plan → Laboratory → Sign-off is a parallel branch. Local checks remain visible and actionable while prerequisites are outstanding. `complete`, `action-needed` and `waiting` are separate states. Any blocker or unfinished dependency keeps progress below 100%.

The engine consumes the existing state schema and validation/logic/scoring adapters. Missing engines fail closed. It has no storage or network side effects and no time-based cache that can leak between projects. Existing KV keys, field sync bridges and master-record locks remain unchanged.

## Corrected handoffs

Blank rows and recovery-only intervals no longer count as completed geology. Planned depths require finite positive values; early termination without a reason remains incomplete. Laboratory counts and the gate use the same planned/sample rows, including checkbox test requests and excluding empty arrays.

Saved reports record a non-security source change token. Source edits, an archived file or a new revision require regeneration/review. An old approval does not approve a newer saved PDF. Saving failure leaves metadata unchanged. Switching projects while a save is in flight never marks the newly selected project complete. A client-share URL alone is not evidence of report issue.

Existing saved reports lack source tokens and will initially show **Needs regeneration**. Regenerate and review them to establish a current record. This does not delete previous files.

This is workflow readiness, not an immutable issue ledger or an authorization system. Pipeline remains specific to geotechnical investigation delivery; specialist pile and environmental modules retain their existing domain workflows.

## Verification

`node --test tests/*.test.js` covers the original suite plus workflow dependencies, strict depth handling, lab row parity, read-only evaluation, stale reports, failed saves and project switches during saves. Browser checks use localhost without a backend to avoid changing production records.

Measured navigation: before, opening Pipeline took one click but left the Scope URL and reload returned to Scope. After, one click sets `/pipeline` and reload retains Workflow (zero recovery clicks). Report blockers now carry the borehole identifier into Reports; generic navigation previously required a separate report selection.
