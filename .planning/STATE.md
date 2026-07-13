# State

## Milestone

0 - Baseline and soil-plus-SPT vertical slice

## Phase

COMPLETE

## Baseline

- Production branch: `main` at `77bd196`
- Working branch: `improve/geoflow-field-to-pdf`
- Live route: `#/projects/p_rwulad/soil-logs`
- Live console warnings/errors: none
- Existing baseline inline script parse: 24/24 across the three HTML entry points
- Cloudflare Worker dry run: pass
- Backend compile check: pass
- Impeccable baseline: four warnings
- Cloudflare production version: `ca9afc2d-e28b-4739-84b6-ae97fc0c874e`

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

Populate the real project metadata before issue so the generated logs can move from `DRAFT - UNREVIEWED` to an issued state.

## Release

- Release gate passed: 8/8 domain tests, 25/25 inline script parses, backend compile, skill validation and Wrangler dry run.
- Committed and pushed on `improve/geoflow-field-to-pdf` at `a54e378`.
- Deployed directly to the Cloudflare Worker; no Vercel deployment was used.
- Production soil route verified with the responsive editor, manual-description state, cohesive Sandy CLAY terms and no horizontal overflow.
- Production report route verified with a clean console and a live two-sheet BH3 PDF blob preview.
