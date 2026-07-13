---
name: sts-rock-logging
description: Use when implementing, reviewing or testing GeoFlow core runs, rock material intervals, weathering, strength, recovery calculations, rock transitions, or rock-page rendering. Do not use for general soil entry or standalone project administration.
---

# STS Rock Logging

1. Inspect legacy rock rows and corebox data before changing entity boundaries.
2. Read [rock-materials.md](references/rock-materials.md), [weathering.md](references/weathering.md), [strength.md](references/strength.md), and [core-runs.md](references/core-runs.md).
3. Keep core runs, material, weathering/strength and defects logically distinct even when compatibility maps them to legacy rows.
4. Distinguish entered, calculated, overridden, missing and invalid recovery values.
5. Keep rockhead, coring start, first recovery and competent rock as separate depths.
6. Verify persistence, TCR/RQD rules, transition rendering and every rock PDF track.

Failure behavior: do not clamp or overwrite source metrics. Report a blocker with the calculation inputs and leave issue disabled.

Expected output: mapping used, calculations, compatibility evidence, rock-page evidence and unresolved interpretation.

Provenance: live GeoFlow rock/corebox records, repository core calculations, issued cored logs and the STS geotechnical domain skill.
