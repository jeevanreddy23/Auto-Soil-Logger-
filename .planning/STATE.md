# State

## Milestone

0 - Field data to professional borehole PDF and AGS 4.1.1 export

## Phase

COMPLETE

## Release Baseline

- Working branch: `improve/geoflow-field-to-pdf`
- Final code commit: `b2a87c4`
- Live report route: `#/projects/p_rwulad/reports`
- Cloudflare Worker version: `833454d7-e37c-4d35-a555-b05542bcf857`
- Cloudflare KV namespace: `f9c604a7cd24492fb826a45f7ed1c28a`
- Deployment target: Cloudflare Workers and KV only; no Vercel deployment was used.

## Decisions

- Cloudflare KV is authoritative for project facts and borehole logs; browser storage retains view state only.
- OpenGround reference PDFs inform visual hierarchy, tracks, typography and sheet structure only. Their project data is never copied.
- PDF is the human-readable visual borehole report. AGS 4.1.1 is a separate machine-readable factual export.
- Rock remains on the material log unless corebox, recovery/RQD, or explicit coring evidence establishes a coring start depth.
- Missing source facts remain blank and the report remains marked `DRAFT - UNREVIEWED`; report generation does not invent metadata.

## Completed

- Added professional material and cored-borehole PDF layouts using the live project records.
- Corrected non-cored rock classification and split intervals that cross the coring start.
- Added AGS 4.1.1 groups for project, location, geology, samples, SPT, core and discontinuity data.
- Fixed deep-link hydration so stale browser data cannot hide current Cloudflare logs.
- Prevented cloud writes until the current KV state has been observed.
- Reset the Cloudflare PDF save action when changing boreholes.
- Saved verified `log-BH01.pdf` and `log-BH3.pdf` artifacts to the project file store.

## Verification

- 25/25 Node regression tests passed.
- Three browser-compatible modules and 23 inline scripts parsed.
- Backend Python compile passed.
- Wrangler dry run passed with the production KV binding.
- `python_ags4` 1.2.0 against the AGS 4.1.1 standard dictionary: 0 errors, 0 warnings, 0 FYI findings.
- BH01 production preview: 1 soil, 10 rock, 2 sheets.
- BH3 production preview: 2 soil, 1 rock, 1 sheet.
- Production console: no warnings or errors; PDF preview used a live blob URL.
- Saved Cloudflare artifacts are valid `data:application/pdf` payloads.

## Next

Populate and review the real project metadata before issue so the reports can move from `DRAFT - UNREVIEWED` to an approved issue state.
