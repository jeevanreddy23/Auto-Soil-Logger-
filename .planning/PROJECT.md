# STS GeoFlow Brownfield Modernisation

## Objective

Improve the existing Cloudflare-hosted STS GeoFlow application in controlled field-to-PDF slices while preserving existing records and working modules.

## Current Phase

Milestone 0 baseline and first soil-plus-SPT vertical slice.

## Constraints

- Cloudflare Worker and Workers KV remain the production platform.
- Existing record shapes and unknown fields must be preserved.
- `geologger/index.html` is layered; later script blocks intentionally override earlier behavior.
- PDF geometry is measured against the issued logs in `C:\Users\pored\Downloads\Logs`.
- No final issue workflow may silently repair or overwrite engineering values.

## Definition Of Done

The existing project opens, two soil intervals and structured SPT data can be edited and reloaded, manual descriptions remain protected and visibly stateful, invalid SPT does not produce an ordinary N value, overlaps are actionable, the soil PDF contains the source values without clipping, and desktop/tablet/phone checks pass.
