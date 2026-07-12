---
name: geoflow-feature
description: Use whenever adding or changing any STS GeoFlow feature. Enforces the discover→plan→implement→test→verify→review→document loop with live measured verification and current-work preservation.
---

# GeoFlow Feature Workflow

## 1. Discover (before any edit)
- Read `CLAUDE.md` in full — it overrides generic practice.
- Identify affected script layers (index.html block ids), state fields (S/F/PJ),
  KV keys, sync-bridge fields, and PDF constants.
- Mark each touched existing behaviour KEEP / IMPROVE / CONSOLIDATE (default KEEP).

## 2. Plan
- One coherent concern per change. Smallest safe edit: fix > simplify >
  consolidate > reuse > small addition > redesign (last resort, needs evidence).
- State expected measurable gain (clicks, typing, time, error prevention).

## 3. Implement
- New behaviour → new trailing `<script>` layer or minimal targeted edit.
- Reuse existing components (sheet(), fitSize/trimToW, chips, sc-card CSS).
- Never re-type project data anywhere — read the master record.
- Add validation + error handling; missing data prints "-", never undefined.

## 4. Test (live, measured, honest)
- Deploy via GitHub web-upload → Cloudflare build → verify with `?v=N` URL.
- Drive the real UI via browser JS: stub fetch/alert/confirm, snapshot state
  before, restore after; count clicks/typing with instrumented helpers.
- Data-equality check: feature must write identical engineering data unless
  the change is about the data.

## 5. Visual verify
- Screenshot desktop; check phone (<720px) and tablet (~900px) behaviour for
  field-facing changes. No console errors on load.

## 6. Review (Current-System Advocate pass)
- What already works that this could break? Which stored records/routes/IDs
  are affected? Does it move clicks rather than remove them? Would a
  first-day field engineer understand it?

## 7. Document
- Update CLAUDE.md if architecture/rules changed; add regression baseline to
  `autonomy/tests/` when a workflow metric was improved; push GitHub + mirror.
