# Zone Rules

Zones require ID, from, to, type and description. Supported working types include CZ, FZ, SZ, XWZ, XWS, CS, core loss and approved custom codes.

- Require numeric `from < to`.
- Preserve overlaps when geologically real, but report them for review.
- Never collapse a zone into a point defect.
- Keep natural zones distinct from drilling/core-loss annotations.
- Render start/end boundaries and full text without moving depths.
