# GeoFlow Timeline PDF architecture

Active from September 2026, at the product owner's request for a distinct GeoFlow design. This specification supersedes the historical issued-log reference geometry.

`geologger/geoflow-log-pdf.js` owns PDF composition. The final `geoflow-timeline-pdf` script in `index.html` connects existing export/preview actions and QA to this renderer. Earlier inline PDF definitions remain inactive compatibility code; do not restore them as the default.

## Layout contract

- A4 portrait with 14 mm left margin and GeoFlow masthead.
- One shared soil/rock depth window per page: 5 m at 30 mm/m.
- Depth rail at x29, from y101 to y251, with half-metre ticks.
- Material narrative cards at x39, width87; evidence cards at x136, width60.
- Teal soil and sand-brown rock interval strips; charcoal range band.
- No reference-template frame, rotated column labels, hatch library or measured legacy grid.
- Cards can move downward to avoid collisions. Their written depths remain authoritative; leader lines indicate displacement.
- Full overflow observations are retained in numbered detail records. Continued intervals retain their source descriptions. Setup/location and termination are readable register entries.
- Review state, revision, groundwater and document page counts are explicit. Zero values are retained. Rendering must not modify source state.

## Verification

Run `node --test tests/*.test.js`, `node tools/generate-log-samples.js`, and `python tools/verify-log-pdfs.py`. Inspect every rendered page under `tmp/pdfs`. Samples under `output/pdf` contain fictional data. Geometry checks test this contract, not parity with third-party reference sheets.
