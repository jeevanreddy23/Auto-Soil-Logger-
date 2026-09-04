# GeoFlow logging and PDF audit - 5 September 2026

Implemented locally on `codex/logging-pdf-redesign`. This change has not been pushed or deployed.

## Logging corrections

- Reject whitespace/boolean numeric values, negative intervals, malformed SPT increments, and incomplete seating data instead of producing a plausible number.
- Preserve zero penetration on refusal and derive the test endpoint from actual penetration.
- Use the same SPT calculation in review and PDF generation; include the test endpoint when checking final depth.
- Keep recovery runs and defect zones separate from geological continuity checks. Check recovery ranges, RQD/TCR and SCR/TCR consistency.
- Use the earliest cored interval even when input rows are unsorted.
- Preserve cleared field recovery/spacing inputs and save the edited draft.
- Prevent merging adjacent soil intervals with different observations or non-adjacent depths.
- Regenerate a cached PDF after borehole, project, revision or log data changes.
- Validate original observations during export: deriving SPT output no longer temporarily overwrites the source and hides stale stored N-values.

## PDF design and data preservation

The requested redesign uses separate Soil / Material Log and Cored Rock Log titles, STS branding, pale column bands, depth-window labels, revision/review status, and document-wide page numbering. The technical frame remains A4 with the existing column positions and a 77-271 mm body: 19.4 mm per metre, 10 m per sheet.

Descriptions repeat on continuation sheets. Thin-layer descriptions, long metadata, crowded defects, and cored-sheet samples/tests are retained in a paginated detail register. Where space permits, the scaled sheet carries a matching D-number. Extremely thin intervals remain identifiable by depth in the register. Terminations at exact 10 m boundaries are included without adding phantom material sheets.

Per-hole groundwater takes precedence over project text and supports a depth of zero. Defect attributes and unknown defect names are preserved. Mechanical/drilling/handling breaks remain visible but are excluded from fracture-spacing calculations. Class estimates use a distinct dot; recorded Is(50) values are retained in details without inventing test orientation. Blocking validation errors keep the PDF marked draft even when a reviewer is entered.

## Verification

Run:

```text
node --test tests/*.test.js
node tools/generate-log-samples.js
python tools/verify-log-pdfs.py
```

The PDF harness runs the actual `pdf-v3` engine and bundled jsPDF, including the STS logo, against fictional soil, rock, mixed-template, long-description and dense-defect fixtures. It verifies text preservation, page boundaries and source immutability. Browser checks additionally exercised the final layered application, manual soil-description editing, SPT recalculation (2,8,4 -> N=12), reload persistence, and PDF generation at desktop and phone widths. API calls were mocked on localhost; no production records were edited.

All five sample PDF pages were rasterised with PDFium and inspected. Geometry checks verified 101 depth ticks per sheet, 1.94 mm per 0.1 m, A4 bounds, and all soil/rock column positions. Column positions matched the supplied `log-BH8-Cored.pdf` within 0.5 mm. The design changes intentionally differ from the old issued-log typography and headings.

The output PDFs are fictional design samples in `output/pdf`, generated reproducibly rather than committed as binary source. This audit does not certify all possible project data or the production deployment. Android packaging, offline cross-device conflict scenarios, production API integration and human engineering sign-off remain outside this local verification.
