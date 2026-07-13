---
name: sts-regression-testing
description: Use when planning or running STS GeoFlow unit, integration, existing-record, browser, PDF or screenshot regression tests, especially after changes to records, validation, routing, sync or report rendering. Do not use for speculative feature design without executable verification.
---

# STS Regression Testing

1. Read [fixtures.md](references/fixtures.md), [pdf-tests.md](references/pdf-tests.md), and [screenshot-tests.md](references/screenshot-tests.md).
2. Start from a clean copy of real record shapes; never test destructive writes against the production record.
3. Add a deterministic failing assertion or reproducible baseline before implementation.
4. Cover normal, boundary, invalid, ambiguous and legacy regression cases.
5. Verify source equality/unknown-field preservation, save/reload and unrelated route smoke tests.
6. For PDF changes, combine text assertions with rendered-page inspection; for UI changes, combine semantic checks with screenshots.

Failure behavior: report the exact failed criterion and artifact. Do not update a baseline to make an unexplained difference pass.

Expected output: fixtures used, commands, results, screenshots/PDF PNGs, data diff and residual gaps.

Provenance: live `p_rwulad` record shape, issued PDF set, baseline docs, repository scenario specifications and the current Cloudflare deployment.
