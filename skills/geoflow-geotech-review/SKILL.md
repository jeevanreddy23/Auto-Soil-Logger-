---
name: geoflow-geotech-review
description: Engineering-completeness review for any change touching logging, samples, tests, corebox, metrics or PDFs. Rejects simplifications that weaken geotechnical data.
---

# GeoFlow Geotechnical Review

Run these checks against the change and against a generated log:

## Depth integrity
- Intervals continuous, non-overlapping, From<To, nothing below termination.
- "From" auto-continues; depths stored numeric (2 dp display).

## Soil
- AS 1726 description order: MATERIAL: plasticity, colour, …, trace/with X.
- Consistency/density, moisture (D/M/W/M<PL/M≈PL/M>PL/W>PL), classification
  symbol fields remain available — progressive disclosure may hide, never remove.

## Rock & core
- Weathering RS/XW/HW/DW/MW/SW/FR (ranges allowed); strength EL…EH.
- TCR = recovered/run·100; RQD = sound(>100 mm)/run·100; RQD ≤ TCR ≤ 100
  (TCR>100 → warning, allowed with confirmation). NO CORE thickness from interval.

## Defects
- Every defect printed, never merged/summarised. Codes per CLAUDE.md.
- HB/MB/DB excluded from RQD + fracture spacing but shown.
- Grouped MJ/JS/BP-M: count+spacing captured; JS only for consistent
  structural family; wording "MJ: 5 joints over 0.30 m, spacing 40–60 mm, …".

## Tests & samples
- SPT N=2nd+3rd; refusal N=R; partial "35/150 mm"; duplicate-depth guard.
- Sample IDs {BH}-{TYPE}-{NN}, unique; scope-required samples (CBR,
  shrink-swell) prompt only while the project-wide requirement is unmet.

## Gate
- validate() must flag: RQD>TCR, records below termination, duplicate sample
  IDs, non-numeric RL, bad weathering codes, N≠b2+b3 (auto-fix on PDF, reported).
- Report Ready stays deterministic. DRAFT until Review By.

Reject the change if any required field became unreachable or any statistic
can silently disagree with its inputs.
