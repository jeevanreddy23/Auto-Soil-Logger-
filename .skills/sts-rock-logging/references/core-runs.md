# Core Runs

Core run fields: run ID, from, to, run length, recovered length, sound length over 100 mm, TCR, RQD, flush return, core box and status.

Calculations:

- `run length = to - from`
- `TCR = recovered / run length * 100`
- `RQD = qualifying sound length / run length * 100`
- `0 <= RQD <= TCR <= 100` for final issue

Drilling/mechanical breaks are shown but excluded from RQD and natural fracture spacing. Manual overrides require original value, override, reason, user and time.
