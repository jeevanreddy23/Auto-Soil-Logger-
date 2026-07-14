# First Slice Results

## Delivered

- Professional A4 borehole-log PDFs modeled on the supplied OpenGround examples without copying their data.
- Separate material and cored templates with evidence-based transitions between them.
- Soil, rock, samples, SPT, core recovery, RQD and discontinuity tracks drawn from current project data.
- A separate AGS 4.1.1 text export for machine import; the PDF is not represented as AGS data.
- Canonical Cloudflare hydration for report deep links, including replacement of stale local logs.
- Cloudflare file storage for generated borehole PDFs.
- True zero-record soil and rock states until a logger explicitly adds or imports data.
- Lithology-specific black-and-white graphic-log symbols derived from the supplied OpenGround sheets.

## Root Causes Found

1. Raw array lengths treated placeholders, recovery runs and defects as geology, inflating log and report counts.
2. Opening an empty soil or rock page created a blank row, so an untouched log could not remain genuinely empty.
3. Report defaults fabricated drilling method, lithology, groundwater, orientation and dash placeholders when source fields were blank.
4. A generic rock hatch ignored the lithology-specific graphic language visible in the supplied OpenGround sheets.
5. Recovery-only rows were exported to AGS `GEOL`, creating a geology interval without a factual description.
6. The report selector refreshed the PDF but left the right-side borehole summary on the previous hole.

## Verification Fixtures

### BH01 - cored

- 0 soil geology records, 0 rock geology records, 1 core-recovery run, 9 defects and 1 sample.
- Two A4 cored sheets; unentered method, lithology, material description and graphic-log cells remain blank.
- TCR 100 and RQD 99 are bounded vertically to the entered 2.00-11.00 m run; defect labels remain above the footer.
- Stored in Cloudflare as `report-BH01` / `log-BH01.pdf`.

### BH3 - non-cored

- 2 soil records, 1 non-cored rock record, 1 SPT and 1 sample.
- One A4 material-log sheet; no false cored sheet.
- Stored in Cloudflare as `report-BH3` / `log-BH3.pdf`.

### BH03 - blank

- 0 soil, rock, core and defect records.
- One professional A4 blank borehole sheet with no invented project or geology values.
- Stored in Cloudflare as `report-BH03` / `log-BH03.pdf`.

## Quality Evidence

- 36/36 automated tests pass.
- Official `python_ags4` 1.2.0 validation against dictionary 4.1.1 reports 0 errors, 0 warnings and 0 FYI findings.
- Generated PDFs are A4, unencrypted and contain no JavaScript.
- Full-resolution Poppler renders were visually inspected for blank, material and cored fixtures.
- Production raster output for all four inspected pages is pixel-identical to the approved local output.
- Production BH01 soil and BH02 rock pages show zero rows before entry, with data exports disabled.
- The exact production report route hydrates from KV, creates a blob preview and produces no browser console warnings or errors.

## Production Release

- Worker: `autosoillogger.poreddyjeevanreddy.workers.dev`
- Version: `77bd2b91-f063-41a7-97ed-cbcfeb09cd5e`
- Code commit: `9ad0786`
- Report route: `?v=77bd2b91-f063-41a7-97ed-cbcfeb09cd5e#/projects/p_rwulad/reports`
- Soil route: `?v=77bd2b91-f063-41a7-97ed-cbcfeb09cd5e#/projects/p_rwulad/soil-logs`
- Rock route: `?v=77bd2b91-f063-41a7-97ed-cbcfeb09cd5e#/projects/p_rwulad/rock-logs`
- KV namespace: `f9c604a7cd24492fb826a45f7ed1c28a`
- A concurrency-guarded cleanup removed only the blank BH01 soil placeholder and blank BH02 rock placeholder after taking a KV backup.
- All five borehole PDFs were regenerated and saved to the Cloudflare project file store.
- Cloudflare Workers and KV only; no Vercel deployment.

## Issue Boundary

The supplied project metadata is incomplete. Reports therefore remain visibly marked `DRAFT - UNREVIEWED`; approval and issue status require factual project details and technical review, not layout changes.
