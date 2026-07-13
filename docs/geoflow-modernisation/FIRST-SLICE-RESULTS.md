# First Slice Results

## Delivered

- Professional A4 borehole-log PDFs modeled on the supplied OpenGround examples without copying their data.
- Separate material and cored templates with evidence-based transitions between them.
- Soil, rock, samples, SPT, core recovery, RQD and discontinuity tracks drawn from current project data.
- A separate AGS 4.1.1 text export for machine import; the PDF is not represented as AGS data.
- Canonical Cloudflare hydration for report deep links, including replacement of stale local logs.
- Cloudflare file storage for generated borehole PDFs.

## Root Causes Found

1. Any rock interval was previously treated as cored rock, so weathered or non-cored rock generated the wrong template.
2. Report defaults fabricated facts such as drilling method, groundwater and termination wording when source fields were blank.
3. AGS and PDF responsibilities were mixed conceptually instead of being separate outputs.
4. `pullSync()` ignored Cloudflare whenever `autosoil-logger` already existed in localStorage. This made BH01 appear empty even though KV contained 1 soil and 10 rock records.
5. After one PDF was saved, the Cloudflare save control stayed disabled when another borehole was selected.

## Verification Fixtures

### BH01 - cored

- 1 soil record, 10 rock records, 1 SPT and 1 sample.
- Two A4 sheets.
- Stored in Cloudflare as `report-BH01` / `log-BH01.pdf`.

### BH3 - non-cored

- 2 soil records, 1 non-cored rock record, 1 SPT and 1 sample.
- One A4 material-log sheet; no false cored sheet.
- Stored in Cloudflare as `report-BH3` / `log-BH3.pdf`.

## Quality Evidence

- 25/25 automated tests pass.
- Official `python_ags4` 1.2.0 validation against dictionary 4.1.1 reports no findings.
- Generated PDFs are A4, unencrypted and contain no JavaScript.
- Poppler renders are nonblank and visually inspected; both templates retain the STS header, depth scale, tracks, legends and sheet numbering.
- The exact production report route hydrates from KV, creates a blob preview and produces no browser console warnings or errors.

## Production Release

- Worker: `autosoillogger.poreddyjeevanreddy.workers.dev`
- Version: `833454d7-e37c-4d35-a555-b05542bcf857`
- Report route: `?v=files#/projects/p_rwulad/reports`
- Export route: `?v=files#/projects/p_rwulad/export`
- KV namespace: `f9c604a7cd24492fb826a45f7ed1c28a`
- Cloudflare Workers and KV only; no Vercel deployment.

## Issue Boundary

The supplied project metadata is incomplete. Reports therefore remain visibly marked `DRAFT - UNREVIEWED`; approval and issue status require factual project details and technical review, not layout changes.
