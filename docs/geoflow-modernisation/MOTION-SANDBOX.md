# STS GeoFlow Motion Sandbox

This worktree is a local-only motion experiment based on the MotionSites direction.
It is intentionally isolated from the production branch and Cloudflare deployment.

## Motion Scope

- Navigation rail expansion and workspace-tab context.
- Low-motion portfolio, project, validation and report page entry.
- Command palette, help dialog and important toast entry.
- Validation issue focus without moving logging rows.
- Save and sync state confirmation.
- PDF viewer entry and a progress line only while the PDF iframe is loading.

## Explicit Exclusions

- Soil, rock, SPT and DCP grid page transitions.
- Corebox image movement beyond its existing direct-manipulation tools.
- Animated values, gradients, backgrounds, parallax, bounce or elastic easing.
- Motion inside generated PDF files.
- Any Cloudflare, Worker, KV or GitHub release action.

## Timing

- Immediate: 100 ms.
- Small state change: 160 ms.
- Panel: 220 ms.
- Page: 260 ms.
- Continuous animation is limited to a genuine loading or generating state.

## Accessibility And Performance

- `prefers-reduced-motion` disables all sandbox animation and smooth scrolling.
- Page movement uses opacity and transform only.
- Technical grids preserve stable row geometry.
- No interval timer or pointer-move animation loop is used.
- PDF loading state exposes `aria-busy` and clears after the iframe load event.
