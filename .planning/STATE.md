# State

## Milestone

0 - Field data to professional borehole PDF and AGS 4.1.1 export

## Phase

COMPLETE

## Release Baseline

- Working branch: `improve/geoflow-field-to-pdf`
- Final code commit: `9ad0786`
- Live report route: `#/projects/p_rwulad/reports`
- Cloudflare Worker version: `77bd2b91-f063-41a7-97ed-cbcfeb09cd5e`
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
- Added true empty soil and rock views that do not create placeholder records.
- Separated geology, core-recovery and defect semantics in counts, PDFs and AGS export.
- Added observed OpenGround-style symbols for fill, cohesive soil, sand, gravel, claystone, shale, siltstone and sandstone.
- Kept unentered PDF metadata, lithology, method and graphic tracks blank instead of fabricating values.
- Saved verified PDFs for BH01, BH02, BH03, BH3 and BH4 to the Cloudflare project file store.

## Verification

- 36/36 Node regression tests passed.
- Three browser-compatible modules and 23 inline scripts parsed.
- Backend Python compile passed.
- Wrangler dry run passed with the production KV binding.
- `python_ags4` 1.2.0 against the AGS 4.1.1 standard dictionary: 0 errors, 0 warnings, 0 FYI findings.
- BH01 production preview: 0 soil geology, 0 rock geology, 1 core run, 9 defects, 2 sheets.
- BH03 production preview: 0 entered records, 1 blank sheet.
- BH3 production preview: 2 soil, 1 rock, 1 sheet.
- BH01 soil and BH02 rock production editors both open with zero rows before entry.
- Production console: no warnings or errors; PDF preview used a live blob URL.
- Four production PDF pages are pixel-identical to the approved local blank, material and cored renders.
- A concurrency-guarded KV cleanup removed exactly two fully blank legacy placeholders after backup.

## Next

Populate and review the real project metadata before issue so the reports can move from `DRAFT - UNREVIEWED` to an approved issue state.
