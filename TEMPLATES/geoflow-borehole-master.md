# Borehole log — data contexts and render selection

Companion to `TEMPLATES/log-layout-rules.md`, which holds the measured geometry (column
x-positions, depth scale, fonts, footer text). This file holds the project metadata contexts,
the rule that picks a template, and the wording constraints.

Every value below was read out of the issued reference PDFs on 2026-07-25 — 18 files, of which
14 are distinct boreholes (`BH1-Cored` = `BH2`, `BH201` = `BH202`, `BH4` = `BH5` are
byte-identical; `TP1` re-exports BH8-Cored). Where a value differs from the draft schema this
replaces, the difference is noted and the measurement wins.

---

## 1. Project contexts — three, not two

The reference set covers **three** jobs. Two of them share the Marsden Park site with different
clients, job numbers and drill bits, so site name alone cannot select the metadata.

### Context ALPHA — Ryde
- Client: `Cadence Constructions`
- Job No.: `33529`
- Address: `744-748 Victoria Road Ryde NSW`
- Drill Bit: `AD/T` · Hole Ø `100` mm · Inclination `90°`
- Logs: BH01, BH02, BH03, BH04 · depths 13.70–25.00 m · all cored

### Context BETA — Marsden Park (BY Group)
- Client: `BY Group`
- Job No.: `33526/2420E-G`
- Address: `Lot 37, South Street, Marsden park` — comma after Lot 37, lower-case "park"
- Drill Bit: `Auger` · Hole Ø `100` mm · Inclination `90°`
- Logs: BH201–BH206 · depths 8.00–15.00 m · BH201, BH202, BH206 cored; BH203, BH204, BH205 soil only

### Context GAMMA — Marsden Park (CDC)
- Client: `CDC Data Centres Pty Ltd`
- Job No.: `32917/9295D-G`
- Address: `Lot 37 South Street, Marsden Park` — no comma after Lot 37, capital "Park"
- Drill Bit: `AD/T` · Hole Ø `100` mm · Inclination `90°`
- Logs: BH1-Cored, BH2, BH3-Cored, BH4, BH5, BH8-Cored, BH9-Cored, TP1 · depths 4.50–20.00 m

The two Marsden Park addresses differ in punctuation and capitalisation. Reproduce each job's
string exactly; normalising them would change issued-document text.

**Correction to the draft schema:** it described two contexts and folded the CDC job into
"Marsden Park". Generating a CDC borehole with BY Group's client name and job number would put
the wrong party on an issued log. Select context by **job number**, which is unique.

---

## 2. Template selection is per page, driven by the data

The draft schema tied templates to projects ("Ryde = deep cored, Marsden Park = shallow soil").
The reference logs contradict that: BH201, BH202 and BH206 are BY Group holes with cored pages,
and every cored log in the set — in all three contexts — starts on the soil template.

The measured rule:

```
page 1                      → SOIL template   (always; drilling starts in soil)
first page containing core  → CORED template
every page after that       → CORED template
soil-only hole              → single SOIL sheet, "Sheet 1 of 1"
```

Sheets break every 10.00 m of depth (body 77 → 271 mm at 19.4 mm/m). Pagination therefore
follows termination depth, and `Sheet X of Y` can only be filled once Y is known.

Column order left to right, as measured (`log-layout-rules.md` §3–4 has the x values):

- **SOIL** — Water/ground levels · Samples & field tests · Depth (m) · Graphic log ·
  Material description · Classification symbol · Consistency / rel. density · Moisture
- **CORED** — Method · Flush return · TCR % · RQD % · Depth (m) · Graphic log · RL (m AHD) ·
  Material description · Weathering · Estimated strength Is(50) · Discontinuities · Fracture spacing

**Correction:** the draft ordered the cored sheet as Depth · RL · Graphic · Method · TCR · RQD ·
… · Description · Discontinuities, and omitted Flush return. Method leads the sheet at x 17,
description sits between RL and weathering, and fracture spacing is the right-most band.

---

## 3. Wording

### Material names
Principal soil noun in capitals, qualifiers in title case. Rock types and manufactured or
special units fully capitalised. Measured forms, with counts:

`Silty CLAY:` (43) · `SILTSTONE:` (31) · `TOPSOIL:` (11) · `FILL:` (10) · `CLAYSTONE:` (10) ·
`SHALE:` (9) · `NO CORE:` (9) · `Sandy CLAY:` (8) · `Silty SAND:` (4) · `SANDSTONE:` (3) ·
`CONCRETE:` (3) · `Gravelly SAND:` (2) · `Clayey SAND:` (2) · `Gravelly Silty SAND:` (1)

The draft asked for names "completely upper case" while giving `Silty CLAY:` as the example.
Follow the measured convention: the last soil noun carries the capitals, which is also what
AS 1726 principal-name grammar produces.

After the colon comes the descriptor sequence in lower case — plasticity, colour, then
`trace`/`with` clauses. Rock adds weathering and strength terms.

### Missing values
Render `-`. Never emit an empty cell, `undefined` or `null`; the reference logs print `-` in
Location # and other unfilled header fields, and a blank cell changes the visual grid.

### Termination
Form: `Terminated at {depth to 2 dp}m. {Reason}.` printed at the true depth, with the blank
framework continuing below it.

Reasons observed verbatim: `Target Depth Reached.` · `Target depth reached.` ·
`Target Depth reached.` · `Borehole Discontinued.` · `T-C Bit Auger Refusal on Weathered Siltstone.`

**Correction:** the draft made the capitalisation a per-context rule (`Target Depth Reached.`
for Ryde, `Target depth reached.` for Marsden Park). Context BETA contains both
`Target depth reached.` and `Target Depth reached.`, so the variation is inconsistent typing by
different loggers rather than a house style. Encoding it as a rule would reproduce the typos.
Pick one canonical form — `Target depth reached.` — and apply it everywhere.

Some reference logs also show a doubled full stop (`Target Depth Reached. .`) where the reason
already ended in a period. Generate a single terminating period.

### Continuation
`Log continued on next page.` at the foot of a continuing page; `Log continued from previous
page.` at y 77.3 on the page that follows. Arial italic 6 pt.

### Other fixed strings
Surface RL prints with a true `≈`: `≈40.63 m (AHD)`. Inclination prints `90°`. The footer notes
line and the six-cell legend are reproduced character for character in `log-layout-rules.md` §6.

---

## 4. Validation before a log is issued

Run these as arithmetic, not judgement:

1. Context resolves from job number, and client / address / drill bit are inherited rather than
   retyped.
2. Template per page matches the core-run rule; page 1 is SOIL.
3. Depth positions satisfy `y = 77.0 + 19.4 × depth` within ±0.3 mm; sheet breaks at 10 m.
4. Every unfilled field renders `-`.
5. Termination string matches the canonical form at the true depth.
6. `Sheet X of Y` present on every page, including single-sheet logs.
7. RQD ≤ TCR ≤ 100, SPT `N` = 2nd + 3rd increments, no record below termination.

---

## 5. Using this with the feature workflow

```
/geoflow-feature
Task: turn the attached field data into an issued-format borehole log.
Read TEMPLATES/geoflow-borehole-master.md for context and wording,
TEMPLATES/log-layout-rules.md for geometry.
Data: [paste raw field log / CSV / JSON]

Discover  — resolve the context from the job number; find the depth where core runs begin.
Plan      — page the hole at 10 m boundaries; mark which pages are SOIL and which are CORED.
Implement — inherit header metadata from the context; map intervals, samples, SPT and core runs.
Test      — run the §4 checks; report each pass or fail with the value that failed.
```

The generator should never ask for client, job number, address, drill bit, hole diameter or
inclination. Those come from the context.

---

## Unresolved

`log-TP1.pdf` is a copy of BH8-Cored — its body carries BH8 sample IDs (`BH8_0.50-0.95`) and
SPT rows, and it renders on the borehole templates. No genuine test-pit log exists in this set,
so the TEST PIT LOG / PIT ID / Excavation Contractor / Pit Dimensions template remains
unverified. Treat it as a proposal until STS supplies a real issued test-pit log.
