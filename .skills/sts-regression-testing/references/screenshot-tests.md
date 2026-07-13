# Screenshot Tests

Capture at minimum:

- Desktop 1440x1000.
- Tablet landscape 1024x768 and portrait where field-facing.
- Large phone and 390x844 small phone.
- Empty, loading, error, offline, dense, long-description and blocker states.

Compare structure, not raw anti-aliased pixels only. Fail on overlap, clipping, missing controls, critical horizontal phone scrolling, touch targets under 44 px, or unreadable semantic states. Baseline changes require visual explanation.
