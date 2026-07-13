# Test Strategy

## Unit

- Soil description generation and manual-state transitions.
- Interval ordering, overlap and gap measurements.
- Complete SPT N calculation.
- Refusal, hammer bounce, partial penetration, incomplete and invalid SPT states.
- SPT PDF notation.
- RQD/TCR and termination rules remain regression covered.

## Integration

Use a copied/anonymized existing project fixture. Open BH3, edit two soil intervals, preserve a manual description, add complete and partial SPT records, save, reload, validate and generate a PDF.

## Existing Record Regression

Assert unknown fields survive load/save, legacy SPT records calculate as before, existing boreholes remain visible, and rock/corebox/sample routes still parse and render.

## Visual

Capture 1440x1000 desktop, 1024x768 tablet and 390x844 phone views. Check focus, touch targets, selected state, long descriptions, validation blockers and no overlap or critical horizontal phone scrolling.

## PDF

Extract text and render pages through Poppler. Assert page count, borehole ID, soil intervals, manual text, valid N, refusal/partial notation, termination, no broken glyphs and no clipped text. Compare visual hierarchy with the issued logs; do not copy their data.

## Release Gate

Inline scripts parse, domain tests pass, Wrangler dry run passes, browser console is clean, persistence is demonstrated, latest PDF PNGs are visually inspected, and unrelated route smoke checks pass.
