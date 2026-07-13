---
name: sts-field-ux
description: Use when designing, implementing or testing STS GeoFlow phone/tablet field capture, touch entry, focused observation editors, offline persistence, pending sync, conflicts, save state or sunlight-readable responsive behavior. Do not use for PDF-only or backend-only tasks.
---

# STS Field UX

1. Read [phone-workflow.md](references/phone-workflow.md), [tablet-workflow.md](references/tablet-workflow.md), and [offline-states.md](references/offline-states.md).
2. Preserve the fast desktop grid, but do not shrink it into a phone. Use a focused editor and interval summary on narrow screens.
3. Keep borehole, current depth/material/run, save/sync and validation visible.
4. Use 44-48 px touch targets, labels, tabular numerals and no hover-only action.
5. Autosave locally without blocking typing; queue sync and expose conflicts.
6. Verify touch/keyboard paths, refresh/restart recovery, offline/online transitions and no critical horizontal scrolling.

Failure behavior: keep data locally, show pending/error state once without modal repetition, and never resolve a conflict with silent last-write-wins.

Expected output: viewport evidence, interaction counts, local persistence, pending/conflict evidence and accessibility checks.

Provenance: `geologger/field.html`, field scenario documents, live responsive baselines and PRODUCT/DESIGN context.
