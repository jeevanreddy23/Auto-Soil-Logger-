# First Slice Results

## Delivered

- Browser/Node domain module for soil description state, SPT derivation, notation and interval checks.
- Focused soil and SPT editors below 900 px, with 44 px touch targets and no document-level horizontal overflow at 390 px or 820 px.
- Visible Structured, Manual and Manual-out-of-sync description states with explicit regeneration.
- Optional SPT penetration, end-depth, hammer-bounce and status fields with legacy compatibility.
- Validation for incomplete/invalid SPTs, stored/derived N mismatches and description drift.
- Report-safe projection so PDF repair logic operates on a copy.
- Native Helvetica report typography to avoid multi-page embedded-font corruption.
- STS green/graphite shell alignment for the changed workflow.

## Verification Fixture

Project route `p_rwulad`, borehole BH3:

- Two soil intervals.
- One legacy-compatible complete SPT at 1.50 m.
- Derived end depth 1.950 m and N=17.
- One rock interval and termination at 6.00 m.
- Two-page A4 output saved and read back through the local Worker file API.

## Persistence Evidence

The third SPT increment was changed from 9 to 10 in the focused editor. N changed from 17 to 18, then remained 18 after reload. The fixture was restored to 9/N=17 and synced before PDF verification.

## PDF Evidence

- `pdfinfo`: two A4 portrait pages, unencrypted, no JavaScript.
- Browser/PDFium render: both sheets complete with STS header, tracks, legends, sheet numbers and no clipped text.
- Soil sheet: sample mark, SPT 1.50-1.95, blows `5,8,9 N=17`, two material intervals and continuation note.
- Rock sheet: NMLC/flush tracks, weathering/strength bands, material interval and 6.00 m termination.
- Poppler text/geometry render completed; its bundled build logged missing optional Symbol/ArialUnicode display fonts, while neither font is referenced by page content. PDFium and the browser preview render both pages correctly.

## Remaining Scope

Required project metadata is still blank in the supplied project, so its output remains visibly marked `DRAFT - UNREVIEWED`. Filling real project metadata is an operational data task, not a report-layout defect.

## Production Release

- Cloudflare Worker version: `ca9afc2d-e28b-4739-84b6-ae97fc0c874e`.
- Soil logging route: `?v=files#/projects/p_rwulad/soil-logs`.
- Report assembly route: `?v=files#/projects/p_rwulad/reports`.
- Live soil verification: BH3 loaded two intervals, showed the new description-state control, offered cohesive consistency terms for Sandy CLAY and had no document-level horizontal overflow in the narrow production viewport.
- Live report verification: BH3 displayed `2 soil · 1 rock · 2 sheet(s)`, created the PDF preview from a blob URL and produced no browser warnings or errors.
- Deployment target: Cloudflare Workers and KV only; no Vercel deployment was used.
