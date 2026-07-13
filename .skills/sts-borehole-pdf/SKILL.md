---
name: sts-borehole-pdf
description: Use when generating, changing, comparing or testing STS GeoFlow borehole-log PDFs, soil/rock sheet contracts, pagination, headers/footers, validation gates, glyphs or visual fidelity against issued STS/OpenGround references. Do not use for generic document PDFs.
---

# STS Borehole PDF

1. Read [soil-page-contract.md](references/soil-page-contract.md), [rock-page-contract.md](references/rock-page-contract.md), [pagination.md](references/pagination.md), and [visual-qa.md](references/visual-qa.md).
2. Read directly from a frozen canonical source snapshot. Do not mutate source values during preview/export.
3. Render every source observation at its engineering depth. Resolve label collisions with wrapping/track layout, never moved boundaries.
4. Block final issue on validation blockers. Drafts remain visibly draft and record source/template versions.
5. Render every changed PDF to PNG with Poppler and inspect all pages; also extract text for omissions.
6. Compare style and geometry with reference logs, never their project data.

Failure behavior: return a rendering/validation blocker and preserve the previous issued file. Never emit a silently incomplete PDF.

Expected output: PDF, page/text assertions, rendered PNG evidence, source/template identifiers and known differences.

Provenance: `C:\Users\pored\Downloads\Logs`, `brain/style_guide.md`, the current `pdf-v3` renderer and the PDF skill workflow.
