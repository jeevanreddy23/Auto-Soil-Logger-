# Release Plan

## Slice 1

1. Land baseline documentation and project skills.
2. Add tested compatibility helpers and soil/SPT UI changes.
3. Verify locally against copied records and rendered PDFs.
4. Push the improvement branch for review.
5. Deploy the Cloudflare Worker only after the acceptance gate passes.

## Deployment

- Validate with `npx wrangler deploy --dry-run`.
- Deploy with `npx wrangler deploy` from the repository root.
- Record Worker version ID and Git commit.
- Verify the exact `p_rwulad` deep links for soil logs and reports.

## Rollback

Redeploy the previous Worker version or deploy commit `77bd196`. No schema rollback is required for this slice because new fields are optional and old readers ignore them.

## Later Releases

Canonical core/rock/defect models, unified review tracks, issue history and conflict-aware desktop sync ship as separate milestones.
