# Scenario 1 regression driver — field borehole logging (BH3/BH4)

Recorded browser-action test for the field app logging workflow.
Run in the browser console on field.html with a test project; counts must not regress.

## Accepted baseline → optimised metrics (2026-07-10)

| Metric | Original | Cycle 1 (in-log SPT+Water) | Cycle 2 (+recent-description chips) |
|---|---:|---:|---:|
| Clicks (full BH: 2 soil + 1 rock + SPT + sample prompt + GW + complete) | 32 | 31 | **19 (−40.6%)** |
| Typing actions | 8 | 8 | 8 (all mandatory engineering values: depths + SPT blows) |
| Screen switches | 7 | 5 | 5 |
| Data written | identical across all runs: 2 soil, 1 rock, SPT N=17, GW 3.1 m, COMPLETE |

## Regression assertions

1. `[data-rd]` recent-description chips appear on the log screen when any interval
   exists in the project (soil chips on soil/fill kind, rock chips on rock kind).
2. Tapping a chip applies material/colour/moisture/consistency/plasticity/extras
   (or rockType/weathering/strength/colour) to the draft — never depths, samples or SPT.
3. `#sptFromIv` opens the in-log SPT sheet with depth prefilled from `#dFrom`;
   duplicate-depth guard and N=b2+b3 calculation preserved.
4. `#gwFromIv` opens the groundwater sheet from the log screen.
5. Scope-aware shrink-swell prompt fires only while the project-wide requirement
   is unmet (BH4 after BH3 sample: no prompt — correct).
6. Interval "From" always auto-continues; project metadata never re-typed.

## Driver (paste into console; expects fetch/alert/confirm stubbed)

See session automation script: counts clicks via instrumented C()/T() helpers and
compares against the table above. Fail the build if clicks exceed baseline+10%.
