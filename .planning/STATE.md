# State

## Milestone

0 - Baseline and soil-plus-SPT vertical slice

## Phase

VERIFY

## Baseline

- Production branch: `main` at `77bd196`
- Working branch: `improve/geoflow-field-to-pdf`
- Live route: `#/projects/p_rwulad/soil-logs`
- Live console warnings/errors: none
- Existing baseline inline script parse: 24/24 across the three HTML entry points
- Cloudflare Worker dry run: pass
- Backend compile check: pass
- Impeccable baseline: four warnings

## Decisions

- Keep the current canonical project and borehole records.
- Add optional fields only; no bulk migration in this slice.
- Extract only deterministic soil/SPT rules into a browser-compatible tested module.
- Preserve old SPT records by treating missing penetration fields as legacy full increments when the corresponding blow count exists.
- Make the phone workflow structurally different from the desktop grid.

## Completed Slice

- Added tested soil/SPT domain rules with legacy compatibility.
- Added focused phone/tablet soil and SPT editors.
- Demonstrated save/reload persistence and local Worker sync.
- Generated, saved, read back and rendered the two-page BH3 PDF.
- Removed the multi-page embedded-font failure.

## Next

Run the release gate, commit, push, deploy through Cloudflare and verify the exact production deep links.
