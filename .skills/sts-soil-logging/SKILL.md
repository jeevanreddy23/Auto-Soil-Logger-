---
name: sts-soil-logging
description: Use when implementing, reviewing or testing GeoFlow soil intervals, structured descriptors, generated or manual AS 1726-style descriptions, depth-specific notes, soil validation, persistence, or soil PDF rendering. Do not use for rock-core defects or unrelated project screens.
---

# STS Soil Logging

1. Inspect existing soil rows and preserve all unknown fields.
2. Read [soil-fields.md](references/soil-fields.md), [soil-description-examples.md](references/soil-description-examples.md), and [soil-validation.md](references/soil-validation.md).
3. Keep from/to, material and common descriptors fast to enter. Put detailed attributes in progressive groups or a focused editor.
4. Generate descriptions from structured fields, but preserve manual text and its structured basis. Mark stale text after later field changes.
5. Keep subordinate observations tied to point or interval depths and render them in review/PDF.
6. Test keyboard and touch entry, save/reload, overlap behavior and PDF text.

Failure behavior: retain the row as a draft, show a blocker/warning at its depth, and never discard manual text.

Expected output: persisted row shape, description state, validation evidence, responsive evidence and PDF trace.

Provenance: live GeoFlow soil rows, repository description generators, `log-BH01.pdf` through `log-BH03.pdf`, and the STS geotechnical domain skill.
