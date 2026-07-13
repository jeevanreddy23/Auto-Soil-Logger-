# Offline States

Required states: synced, saving locally, offline with pending count, syncing, retrying, conflict and failed.

- Save locally first and keep typing responsive.
- Queue attachment uploads separately from the canonical text record.
- Show `Offline - N changes waiting to sync` without repeated modal warnings.
- Retry on reconnect and on explicit command.
- Compare versions/timestamps for conflicts; preserve both values until resolved.
- Verify refresh, app restart and a failed network request do not lose edits.
