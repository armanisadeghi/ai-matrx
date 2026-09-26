# `migrations/rehearsed/` — rule-27 records the production appliers read

One JSON per **exact file body**, named `<sha256 of the .sql file's raw bytes>.json`, written by
`pnpm db:rehearse <file> --target clone` **only after** rule 27 passed end to end (up → inverse →
up on the dev clone, plus the function-body parity gate). A passing rehearsal writes one record for
the up and one for its inverse.

At `--target production` both appliers — `pnpm db:apply` and aidream's `db/apply_migrations.py`
(the one the release sweep runs) — refuse a file whose current bytes are not already ledgered and
have no passing record here. The sweep holds it and reports an ERROR; a named run exits 1. One
changed byte voids the record, because it rehearsed a different file.

**Commit the record(s) with the migration.** Deleting a record is safe; it costs a rehearsal.
Emergency door: `--unrehearsed-emergency "<reason>"` on a named run, written into the ledger row.

Why: FOUND_DEFECTS.md D351 "RULE27-GATE" (2026-09-26). Library: `scripts/lib/migration-rehearsal.ts`
(mirror: `../aidream/db/migration_rehearsal.py`). Proof: `pnpm db:apply --rehearsal-gate-self-test`.
