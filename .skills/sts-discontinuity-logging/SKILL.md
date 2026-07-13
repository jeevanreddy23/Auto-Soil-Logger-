---
name: sts-discontinuity-logging
description: Use when implementing, reviewing or testing GeoFlow rock-core discontinuity entry, point defects, defect zones, compact notation, repeated entry, corebox linking, or defect PDF rendering. Do not use for soil-only logging or generic UI work.
---

# STS Discontinuity Logging

1. Read [defect-codes.md](references/defect-codes.md), [defect-attributes.md](references/defect-attributes.md), and [zone-rules.md](references/zone-rules.md).
2. Preserve structured attributes; compact notation is a derived display, never the source.
3. Give every record a durable ID and allow multiple defects at one depth.
4. Separate point-defect and zone actions. Never merge defects or copy depth silently.
5. Keep image coordinates/source links without replacing engineer-confirmed depth.
6. Verify normal, same-depth, invalid-depth, ambiguous-code and legacy-row cases, then inspect the PDF.

Failure behavior: retain the record as draft, mark the exact invalid attribute and exclude it from derived statistics without omitting it from review.

Expected output: stored attributes, repeated-entry behavior, notation, calculation inclusion/exclusion and PDF evidence.

Provenance: GeoFlow corebox and rock-row vocabularies, issued cored logs, `CLAUDE.md`, and the STS geotechnical domain skill.
