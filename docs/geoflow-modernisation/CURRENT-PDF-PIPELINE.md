# Current PDF Pipeline

## Source

The active borehole is read directly from `S.boreholes` and `S.logs`; project header values come from `S.project`. The renderer does not use a second borehole model.

## Browser Renderer

The latest `buildPdf(bhId)` override in `geologger/index.html` uses jsPDF. It normalizes soil and rock intervals, constructs 10 m soil windows and measured cored-rock windows, draws header/footer geometry, lithology hatching, samples/SPT, groundwater, TCR/RQD, strength, defects and termination, and returns the document for preview/download.

## Current Gate

`validate()` supplies PDF error/warning metadata. Before rendering, the current implementation also changes invalid source values in memory by correcting SPT N, reversing defect intervals and clamping RQD to TCR. That behavior is auditable only through `doc.__validation` and is a brownfield risk because preview generation can mutate source state.

## Output

- Preview uses a blob URL in `#previewFrame`.
- Download uses jsPDF save/output.
- "Save PDF to Cloudflare" posts a data URL to `/api/v1/files` with kind `report-pdf`.
- Issued version immutability and checksums are not implemented.

## Reference Contract

The visual references are 17 A4 issued logs in `C:\Users\pored\Downloads\Logs`. `log-BH01.pdf` has four A4 pages. Its first soil sheet establishes the STS logo/header block, dense horizontal rules, groundwater/sample tracks, a 0.1 m graphic/depth scale, depth-specific subordinate descriptions, structured SPT refusal notation, and a compact notes/footer band.

## Baseline Result

The linked BH3 preview loads as two sheets with two soil intervals, one rock interval, one SPT and one sample. No browser console warnings/errors were observed. Required project metadata is blank, so the PDF remains a draft and header values are placeholders.
