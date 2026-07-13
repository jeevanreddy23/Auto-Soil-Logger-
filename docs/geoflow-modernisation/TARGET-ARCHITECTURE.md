# Target Architecture

## Principle

Retain the Cloudflare Worker, Workers KV records, field PWA, layered desktop app and measured PDF renderer. Add compatibility boundaries around deterministic domain rules before changing broad UI structure.

## Layers

1. **Canonical record:** existing `S`/`F` project and borehole JSON, unknown-field preserving.
2. **Compatibility/domain helpers:** pure soil description, SPT calculation/status, interval validation and formatting functions shared by UI/PDF and directly tested.
3. **Workspaces:** existing specialist modules plus a later continuous field-log view; all write the canonical record.
4. **Validation/read model:** structured issues with severity, record/depth target, rationale and action.
5. **PDF projection:** deterministic, non-mutating view of a source snapshot and template version.
6. **Issue store:** immutable PDF plus source/PDF checksums, reviewer, issue metadata and amendment history.

## First Slice Boundary

Only the soil and SPT helper rules, visible manual-description state, structured partial SPT fields, phone soil editor, and their PDF trace are in scope. Existing rock/corebox/sample routes remain available and unchanged.
