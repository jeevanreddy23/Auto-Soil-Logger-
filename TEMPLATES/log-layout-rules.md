# STS borehole log — layout blueprint (measured)

Every number here was measured from the issued reference logs with pdfplumber on
2026-07-25, not copied from documentation. Units are millimetres from the top-left of an
A4 page (210 × 297 mm, portrait). Where this file disagrees with `brain/style_guide.md`,
this file is the newer measurement — see "Corrections" at the end.

Reference set as supplied: 18 files covering jobs 33529, 33526/2420E-G and 32917/9295D-G.
**Three pairs are byte-identical duplicates** (MD5): `BH1-Cored` = `BH2`, `BH201` = `BH202`,
`BH4` = `BH5`, and `TP1` re-exports BH8-Cored's content. The set therefore holds **14 distinct
boreholes**. Every measurement below was consistent across all files, so the duplicates change
the sample count rather than any value — but do not treat them as independent confirmation.

---

## 1. The rule most specs miss: one log, two templates

A cored borehole log is **not** a separate document type. Page 1 is always the **soil**
template; the sheet switches to the **cored** template on page 2 and stays there.

Measured across the whole set:

| Log | Pages | Template sequence |
|---|---|---|
| BH203, BH204, BH205, BH4, BH5 | 1 | SOIL |
| BH02, BH03, BH04, BH2, BH201, BH202, BH206, BH1/3/9-Cored, TP1 | 3 | SOIL → CORED → CORED |
| BH01, BH8-Cored | 4 | SOIL → CORED → CORED → CORED |

The switch happens because drilling starts in soil (auger/wash bore) and changes to coring
at rock. Generate page 1 with the soil column set whenever the hole starts in soil, then
switch templates at the first page that contains core runs. A log that is soil-only is
simply a one-page soil sheet.

---

## 2. Page skeleton (identical on every sheet)

| Element | y (mm) |
|---|---|
| Frame top | 17.0 |
| Title block bottom / meta row 1 top | 37.0 |
| Meta row separator | 49.0 |
| Column band top | 59.0 |
| Body top = **depth 0.0 m** | 77.0 |
| Body bottom = **depth 10.0 m** | 271.0 |
| Footer notes row | 271.0 → 274.0 |
| Footer legend row | 274.0 → 280.0 |
| Nothing below | 280.0 |

Frame spans x 17.0 → 196.0.

**Depth scale = 19.4000 mm per metre, exactly 10.00 m per sheet.**
Verified from depth labels on BH8-Cored page 1: 0.5 m at y 86.87 … 6.0 m at y 193.57,
slope 19.40 mm/m, back-extrapolating to 0.0 m at y 77.17. Minor grid rules fall every
1.94 mm (0.1 m).

**Stroke weights — only two exist in the whole reference set:**
- 0.132 mm — column rules, depth grid, interval boundaries (281 strokes on a typical page)
- 0.265 mm — outer frame and major section rules (30 strokes)

Any third weight is a defect.

---

## 3. Soil template — column x positions

| x | Column |
|---|---|
| 17.0 | Water / ground levels (rotated label, "LEVELS" second line at x 20.8) |
| 24.0 | Samples & field tests (horizontal, 6 pt, two lines at y 65.8 / 68.3) |
| 50.0 | Depth (m) — rotated |
| 62.0 | Graphic log — rotated ("GRAPHIC" at x 64.3, "LOG" at x 66.8) |
| 71.0 | **Material description** — horizontal, 8 pt, centred ≈ x 98–128 |
| 157.0 | Classification symbol — rotated |
| 164.0 | Consistency / relative density — rotated |
| 184.0 | Moisture |
| 196.0 | Frame right |

---

## 4. Cored template — column x positions (pages 2+)

| x | Column |
|---|---|
| 17.0 | METHOD |
| 23.0 | Flush return |
| 29.0 | TCR % |
| 35.0 | RQD % |
| 41.0 | Depth (m) |
| 47.0 | Graphic log |
| 54.0 | RL (m AHD) |
| 60.0 | **Material description** (8 pt heading, centred ≈ x 73–101) |
| 118.0 | Weathering |
| 124.0 | Estimated strength Is(50) |
| 139.0 | Discontinuities & defects (6 pt heading) |
| 181.0 | Fracture spacing |
| 196.0 | Frame right |

**Strength band 124 → 139** carries a 2.5 mm sub-grid at **126.5, 129.0, 131.5, 134.0,
136.5**. Class letters sit on those lines: VL · L · M · H · VH · EH, with the Is(50) axis
values 0.1 / 0.3 / 1 / 3 / 10. Band heading is three lines of 5 pt text at y 59.7–67.9:
`ESTIMATED STRENGTH`, `ls(50)`, then the marker key `▼ -Axial` and `▽ -Diametral`.

**Fracture-spacing band 181 → 196** carries a 2.5 mm sub-grid at **183.5, 186.0, 188.5,
191.0, 193.5**, labelled 30 / 100 / 300 / 1000 / 3000 (mm) on the inner lines.

Interval boundaries and the termination rule span **60 → 118 only** (graphic + description),
never the full sheet width.

---

## 5. Header block — exact positions and fonts

| Element | x | y | Font | Size |
|---|---|---|---|---|
| `BOREHOLE LOG` | 82.1 | 24.0 | Calibri Light | 22 pt |
| `BH ID:` | 174.5 | 18.5 | Calibri Light | 24 pt |
| Borehole ID value | 173.0 | 28.9 | Calibri Light | 24 pt |

Meta rows — labels in **Calibri Bold 8 pt**, values in **Calibri Light 8 pt**:

| y | Left label (x 17.4) | Value x | Centre label | Value x | Right label | Value x |
|---|---|---|---|---|---|---|
| 37.9 | Client | 29.4 | Date (x 131.4) | 147.4 | — | — |
| 41.9 | Job No. | 29.4 | Logged By (x 131.4) | 147.4 | Review By (x 164.0) | 185.2 |
| 45.9 | Address | 29.4 | Location # (x 131.4) | 147.4 | — | — |
| 50.4 | Drilling Contractor | 42.4 | Surface RL (x 91.4) | 108.4 | Drill Bit (x 131.4) | 147.4 |
| 55.4 | Plant | 42.4 | Inclination (x 91.4) | 108.4 | Hole Ø (mm) (x 131.4) | 147.4 |

Value formatting seen in the references: `≈40.63 m (AHD)` (real ≈ glyph, not `~`),
`90°`, `100`, `33526/2420E-G`, `10 June 2026`.

---

## 6. Footer — exact text and geometry

Notes row, y 271.4, starting x 61.8, Calibri Light 8 pt:

> Notes: See explanation sheets for meaning of all descriptive terms and symbols

Legend, two rows at y 274.4 and 277.4, three cells starting x **17.4 · 64.4 · 111.4**:

| Row | Cell 1 | Cell 2 | Cell 3 |
|---|---|---|---|
| 274.4 | `D -disturbed sample` | `S -jar sample` | `WT -level of water table or free water` |
| 277.4 | `U -undisturbed tube sample` | `B -bulk sample` | `N -Standard Penetration Test (SPT)` |

`Sheet X of Y` sits at x 177.0, y 275.5, Calibri Light 11 pt. Single-sheet logs still print
`Sheet 1 of 1`.

---

## 7. Typography by region

| Region | Face | Size |
|---|---|---|
| Title, BH ID, meta values, footer, sheet number | Calibri Light | 22 / 24 / 8 / 8 / 11 pt |
| Meta labels | Calibri Bold | 8 pt |
| Column headings | Arial | 6 pt (MATERIAL DESCRIPTION 8 pt) |
| Rotated band labels | Arial | ~5 pt |
| Body text, descriptions, defects, depths | Arial | 6 pt |
| Strength letters, axis numbers | Arial | 4.0 / 4.3 pt |
| Continuation notes | Arial Italic | 6 pt |

The reference PDFs embed a `ti` ligature (Calibri Light), which is why extracted text shows
`explana(cid:415)on`. Rendering plain `ti` is correct; do not chase the ligature.

---

## 8. Standard sentences (copy verbatim)

- Continuation, bottom of a page that continues: `Log continued on next page.`
- Continuation, top of a following page at y 77.3, x ≈ 74: `Log continued from previous page.`
- Termination, printed at the true depth:
  `Terminated at 8.00m. Target depth reached.`
  `Terminated at 14.70m. Borehole Discontinued.`
  `Terminated at 4.50m. T-C Bit Auger Refusal on Weathered Siltstone.`
  Form: `Terminated at {depth to 2 dp}m. {Reason}.` — the blank framework continues below it.
- SPT rows: `SPT 0.50-0.95` then blows `20,31,17 HB N=48`; refusal `35/150 mm HB N=R`.
- Missing values print `-`, never blank and never `undefined`.

---

## 9. Payload contract

A generator should accept one JSON object per borehole and never require anything not in it:

```json
{
  "header": {
    "bhId": "BH204", "client": "BY Group", "date": "10 June 2026",
    "jobNo": "33526/2420E-G", "loggedBy": "KM", "reviewBy": "MF",
    "address": "Lot 37, South Street, Marsden park", "locationNo": "-",
    "drillingContractor": "Geosense Drilling Engineers", "surfaceRL": 40.63,
    "drillBit": "Auger", "plant": "Hanjin D&B 8-D", "inclination": 90, "holeDia": 100
  },
  "soil":  [{"from":0.0,"to":0.3,"description":"TOPSOIL: Silty CLAY: low plasticity, dark brown, trace rootlets","graphic":"TOPSOIL","classification":"CL","consistency":"F","moisture":"M"}],
  "core":  [{"from":6.0,"to":7.5,"method":"NMLC","flush":"100%","tcr":98,"rqd":72,"rl":34.6,
             "description":"SILTSTONE: grey, distinctly weathered","weathering":"DW","strength":"M",
             "defects":[{"depth":6.42,"code":"JT","angle":35,"shape":"PL","rough":"RO","infill":"CL"}]}],
  "spt":   [{"depth":0.50,"to":0.95,"blows":[20,31,17],"n":48,"hb":true,"refusal":false}],
  "samples":[{"sid":"BH204-D-01","from":0.30,"to":0.50,"type":"D"}],
  "water": {"state":"GWNE","depth":null},
  "termination": {"depth":8.00,"reason":"Target depth reached"}
}
```

Rules the generator must honour: depth 0 sits at y 77.0 and every 1 m advances 19.4 mm;
a new sheet starts at each 10 m boundary with the continuation sentences; the template
switches to cored on the first sheet containing `core` rows; `Sheet X of Y` is filled after
pagination is known.

---

## 10. Acceptance test

A generated log is acceptable when, compared against a reference of the same type:

1. Vertical line x-positions match the table above within ±0.5 mm, with no extra verticals
   outside the lithology hatching in the graphic column.
2. Horizontal rules exist at 17 / 37 / 49 / 59 / 77 / 271 / 274 / 280 and the 0.1 m grid.
3. Only 0.132 mm and 0.265 mm stroke weights appear.
4. Font faces and sizes match section 7 per region.
5. Footer and legend text match section 6 character for character.
6. Depth labels land within ±0.3 mm of `77.0 + 19.4 × depth`.

Measure with pdfplumber for references and pdf.js `getOperatorList` for generated output —
rasterising generated PDFs to compare visually is slow and unreliable. Never accept an
eyeball check for geometry.

---

## Corrections this measurement makes to earlier documentation

1. **Depth scale.** `brain/style_guide.md` records 19.2308 mm/m (engine constant
   `SC = 1000/52`). Measured value is **19.4000 mm/m**. At 10 m the engine places the
   grid ≈1.7 mm high — a visible drift that grows down the sheet. The engine constant
   should become 19.4 (194 mm per 10 m sheet).
2. **There is no test-pit reference.** `log-TP1.pdf` is a copy of BH8-Cored: its body
   contains BH8 sample IDs (`BH8_0.50-0.95`) and SPT rows, and it uses the borehole
   templates. Any TEST PIT LOG / PIT ID / Excavation Contractor / Pit Dimensions template
   in the engine is **unverified against any issued log** and must be treated as a
   proposal until STS supplies a genuine test-pit reference.
3. Frame/major stroke weight measures **0.265 mm** (documented as 0.26).
