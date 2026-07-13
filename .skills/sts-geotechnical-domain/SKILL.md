---
name: sts-geotechnical-domain
description: Use when implementing or reviewing STS GeoFlow behavior that crosses soil, rock, SPT, samples, groundwater, drilling, validation, review, or borehole PDFs. Enforces engineering terminology, depth integrity and non-destructive brownfield compatibility. Do not use for unrelated infrastructure or generic visual-only changes.
---

# STS Geotechnical Domain

1. Read `CLAUDE.md`, the affected current-system docs, and the canonical record shape before editing.
2. Read [terminology.md](references/terminology.md) for entity boundaries, [as1726-description-order.md](references/as1726-description-order.md) for descriptions, and [validation-rules.md](references/validation-rules.md) for release gates.
3. Preserve observation depth, type, provenance, uncertainty and unknown fields. Never merge, move or infer records for visual convenience.
4. Keep one canonical borehole record; UI, validation and PDF are projections of it.
5. Add optional fields compatibly. Any bulk migration requires fixtures, report, rollback and explicit approval.
6. Verify one normal, boundary, invalid, ambiguous and legacy regression example.

Fail closed when a change could alter engineering meaning: leave the source unchanged, surface a blocker with record/depth context, and report the uncertainty.

Expected output: affected entities, preserved behavior, rules exercised, tests, migration impact, PDF impact and residual risk.

Provenance: repository `CLAUDE.md`, issued STS logs in `C:\Users\pored\Downloads\Logs`, current GeoFlow records, and project modernisation docs. AS 1726 labels are workflow guidance, not a substitute for licensed standard text or engineering review.
