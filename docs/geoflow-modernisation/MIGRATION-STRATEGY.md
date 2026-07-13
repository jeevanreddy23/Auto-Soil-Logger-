# Migration Strategy

## This Slice

No bulk or automatic KV migration. New soil/SPT fields are optional and written only when a user edits or creates the affected record.

## Compatibility

- Missing soil description metadata is treated as a legacy manual amendment when `descTouched` is true.
- Missing SPT penetration fields retain legacy full-increment behavior when the corresponding blow count exists.
- Unknown project, borehole and log fields are preserved through object copies and JSON round trips.
- Existing `depth`, `b1`, `b2`, `b3`, `n`, `refusal`, `recovery` and remarks remain readable.

## Future Versioned Migration

1. Copy live KV records to an isolated namespace or fixture set.
2. Record input checksums and unknown-field inventories.
3. Run an idempotent `fromVersion -> toVersion` transformation.
4. Produce per-record changed/unchanged/dropped-field reports; dropped fields must be zero.
5. Test old-reader compatibility where required.
6. Write transformed records only after explicit release approval.
7. Preserve originals and provide a reverse transform or namespace rollback.

## Rollback

This slice rolls back by reverting code. Optional fields remain harmless to old readers and no stored record requires a reverse migration.
