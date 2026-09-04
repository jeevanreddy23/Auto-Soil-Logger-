# STS GeoFlow — Borehole Log Style Guide (learned specification)

Source of truth for the PDF engine. Every rule below was **measured** from the issued
reference set (13 logs: BH1-Cored…BH9-Cored, BH201–BH206, TP1; jobs 32917/9295D-G,
33526/2420E-G) at 0.1 mm resolution — none are guesses. The renderer in
`geologger/index.html` (`pdf-v3` block) implements this spec; the live output was
verified to line-set parity with the references on 2026-07-10.

## Learning-mode protocol (how this file grows)

When a new consultant log is added to the reference folder:
1. Measure it (pdfplumber: lines with extents + stroke widths, chars with font/size per region).
2. Diff against this guide. Genuine improvements → update the guide AND the engine, never regress.
3. Re-run the in-browser vector comparison (operator-list extraction) until zero missing lines.
4. Record the change here with the date and the reference that motivated it.

## Page geometry (A4 portrait, mm)

| Element | Value |
|---|---|
| Frame | x 17 → 196; header top y 17 |
| Header rows | title block 17–37, meta rows 37–49–59 (grid lines at 37 and 49) |
| Column band | 59–77 (cored band lines only span 60–118 and 124–196) |
| Log body | 77 → 271; depth scale **19.4000 mm per metre** (exactly 10.00 m per sheet) |
| Footer | notes row 271–274, legend row 274–280 (cell dividers at x 64/111/157), nothing below 280 |
| Stroke weights | columns/grid 0.132 mm; frame/majors 0.26 mm; ticks 0.09 mm |

## Columns (x positions, mm)

Soil sheet: 17 GW | 24 Samples & field tests | 50 Depth | 62 Graphic | 71 **Material
description** | 157 Classification | 164 Consistency/Rel. density | 184 Moisture | 196.

Cored sheet: 17 Method | 23 Flush | 29 TCR% | 35 RQD% | 41 Depth | 47 Graphic | 54 RL |
60 (43→101 rel.) Description | 118 Weathering | 124 Strength (6 bands × 2.5 mm, axis
0.1/0.3/1/3/10, ▼ axial ▽ diametral) | 139 Discontinuities | 181 Fracture spacing
(bands × 2.5 mm, labels 30/100/300/1000/3000 on the inner lines) | 196.

Interval boundaries and termination rules span **60→118 only** (graphic+description).

## Typography (measured)

| Region | Face | Size pt |
|---|---|---|
| Title "BOREHOLE LOG" | Calibri Light (engine: Carlito) | 22 |
| BH ID value | Calibri Light | 24 |
| Header labels / values | Calibri Light / Calibri Bold | 8 / 8 |
| Column headings | Arial bold | 5.0 (MATERIAL DESCRIPTION 8, DISCONTINUITIES 6) |
| Strength letters / axis numbers | Arial | 4.3 / 3.3 |
| Body, descriptions, defects, depths | Arial | 6.0 |
| Footer notes + legend | Calibri Light | 8 |
| Sheet n of n | Calibri Light | 11 |
| Continuation notes | Arial italic | 6 |

Glyph rules: real ≈ in "Surface RL ≈xx.xx m (AHD)" (Carlito embedded; ~ fallback);
° ▼ ▽ must render; missing values print "-".

## Wording (exact)

- Header labels: Client · Date · Job No. · Logged By · Review By · Address · Location # ·
  Drilling Contractor · Surface RL · Drill Bit · Plant · Inclination · Hole Ø (mm).
  Test pits: TEST PIT LOG / PIT ID: / Excavation Contractor / Pit Dimensions.
- Footer: "Notes: See explanation sheets for meaning of all descriptive terms and symbols";
  legend D/U/S/B/WT/N exactly as issued; "Sheet X of Y" right cell.
- Continuation: "Log continued on next page." / "Log continued from previous page."
- Termination: "Terminated at {d}m. {Reason}." at true depth; blank framework preserved below.
- SPT: "SPT 0.50-0.95" + "2,3,4 N=7" · refusal "35/150 mm HB N=R" · "20,31,17 HB N=48".
- Defects: "{depth}: {CODE} {angle}° {shape} {rough} {infill}" · zones "{from}-{to}: {CODE}" ·
  grouped "MJ: 5 joints over 0.30 m, spacing 40–60 mm, …" (MJ/JS/BP-M are internal codes —
  expand in explanation sheet). Every defect printed; never summarised or merged.

## Engineering gates (validation engine — runs before every PDF)

Blocking: missing required project fields; From≥To; primary interval overlap; RQD>TCR;
RQD outside 0–100; defect/sample/SPT below termination; duplicate sample IDs;
non-numeric Surface RL; SPT rows missing depth.
Warnings: interval gaps; last layer ≠ termination; missing descriptions; TCR>100
(historical values allowed, flagged); weathering codes outside RS/XW/HW/DW/MW/SW/FR;
N ≠ 2nd+3rd increments (auto-corrected on generation and reported).
Safe auto-repairs (always reported on doc.__validation): N recomputed from increments;
reversed defect intervals swapped; RQD clamped to TCR.
DRAFT watermark until Review By is recorded. Report Ready is deterministic arithmetic —
never model judgement.

## Open discrepancy — engine vs measurement (raised 2026-07-25)

The depth scale above was re-measured from all 18 reference logs and is **19.4000 mm/m** on
every one of them (slope from 19 depth labels per sheet, identical to 4 dp; depth 0 lands at
y 77.17). The engine still carries `SC = 1000/52` = 19.2308 mm/m in `index.html` (pdf-v3,
~line 3232) and `loggen.html`. That places 10.00 m at y 269.31 instead of 271.00 — a 1.7 mm
error at the foot of every sheet, growing linearly with depth. **Not yet applied to the
engine** — measured geometry is permission-gated. Apply as a single constant change in both
files, then re-measure a generated log against a reference before closing this out.

Also raised: `log-TP1.pdf` is a copy of BH8-Cored (its body carries BH8 sample IDs and SPT
rows, and it uses the borehole templates), so **no genuine test-pit reference exists** in the
set. The TEST PIT LOG / PIT ID / Excavation Contractor / Pit Dimensions template is
unverified and should be labelled a proposal until STS supplies a real test-pit log.

## Change log

- 2026-07-09 — geometry/typography measured from 13-log reference set; engine matched.
- 2026-07-10 — fixed line weights, footer geometry, band segmentation, TCR/RQD placement,
  fracture axis + stepped polyline, boundary spans; verified zero missing lines vs
  log-BH8-Cored. Added validation gate with auto-repairs.

- 2026-09-05 - User-requested GeoFlow soil/rock PDF redesign: distinct titles, pale bands, revision/status footers, repeated continuation descriptions and full-text detail pages. Body geometry remains 77-271 mm at 19.4 mm/m; column positions verified against log-BH8-Cored within 0.5 mm. Class estimates use dots; Is(50) values with unspecified orientation remain in details. See docs/logging-pdf-audit-2026-09-05.md. Local verification only; not deployed.
