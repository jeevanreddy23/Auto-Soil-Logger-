---
name: geoflow-pdf-compare
description: Compare a generated borehole log PDF against the approved STS/OpenGround references by measurement, then fix the renderer. Use for any PDF layout complaint or after any pdf-v3 change.
---

# GeoFlow PDF Compare (measure → diff → fix → re-measure)

Ground truth: `C:\Users\pored\Downloads\Logs` (13 issued logs) and
`brain/style_guide.md` (the measured spec — update it with any accepted change).

## Measure the reference (sandbox, pdfplumber)
- Lines with extents + stroke widths (`page.lines/rects`, linewidth in mm).
- Font sizes per vertical zone (`page.chars`); band labels are vertical text.

## Measure the generated PDF (in-browser, exact)
- Build with `_carlito=false` (fast, byte-searchable). 
- Prefer pdf.js `getOperatorList()` → parse `constructPath` (moveTo/lineTo/
  rectangle, coords in pt, y from bottom, A4 = 841.89 pt) — no rasterising.
  Canvas rendering of generated docs can freeze the tab; avoid.

## Diff & rank
- Compare v/h line sets (±0.5 mm), stroke weights, font sizes, label wording.
- Rank Critical (geometry/weights) / Major (missing rules, wrong spans, fonts)
  / Minor (<1 mm drift). Known-correct "extras": lithology hatching verticals,
  unit boundaries within 60–118 mm.

## Fix rules
- Only touch pdf-v3 constants/tokens (T, LW, column arrays, footer block).
- Boundaries + termination rule span 60→118 mm; band lines segmented
  [60–118],[124–196] on cored sheets; footer 271/274/280 with cells 64/111/157.
- TCR/RQD horizontal 5 pt once per value change; strength markers not blocks;
  fracture spacing = stepped polyline on 2.5 mm log grid.

## Accept
- Zero missing reference lines, no unexplained extras, then update
  style_guide.md change log, deploy, and re-run the measurement on the live
  build before claiming done. Final gate: printed overlay by a human.
