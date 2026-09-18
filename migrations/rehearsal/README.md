# `migrations/rehearsal/` — the directory no release path scans

A migration in here is **rehearsal-only**: it is headed `-- target: branch`, it runs
against the rehearsal branch, and it must never reach production.

## Why the directory exists, and not just a header

On **2026-09-16 at 03:52:12Z** the scheduled fleet release `release-all: v0.4.1940`
(`e9e6d4fb37`) applied `custom_entity_types_detail_variant.sql` — headed
`-- target: branch` at its only commit `529becbabb` — **to production**, widening two
CHECK constraints on `platform.entity_types`, the registry table 1,571 policies read.
The ledger row is real: `source=matrx-frontend`, `duration_ms=554`, checksum identical
to the branch's row.

The path was `scripts/release.sh` → `apply_frontend_migrations()`, which runs
`db/apply_migrations.py` **out of a sibling aidream checkout** (`${AIDREAM_DIR:-../aidream}`)
over this repo's `migrations/*.sql`, and passed no `--target` at all. So the file's
header was judged by whatever version of the runner that sibling directory happened to
hold — which is not `origin/main`, and was not that night.

That is the class: **a refusal inside the runner protects only the runner versions that
have it.** The rehearsal file must not be in the swept set at all.

Every migration glob in both repos is non-recursive — aidream's `_glob_for`
(`migrations/*.sql`), `detect_applied.py`'s copy, and this repo's `check-migrations.ts`
`listSql` — so a file in this subdirectory is invisible to all of them. Guards:

| Guard | What it refuses |
|---|---|
| `db/tests/test_rehearsal_dir_is_never_swept.py` (aidream) | a file here appearing in `_discover` / `_glob_for` |
| `pnpm check:migrations` | a `-- target: branch` file left at the **top level** of `migrations/` — exit 1, in every mode |
| `pnpm db:apply … --target production` | any path under this directory, by LOCATION, before its header is read |
| `scripts/release.sh` | an applier that does not recognise `--target production` |

## Using it

```
pnpm db:apply migrations/rehearsal/<file>.sql --target branch
```

Files here are ledgered by **basename**, so a file that moved in keeps the ledger rows
it already has on both databases.

Promoting one to production means moving it back to `migrations/` **and** changing its
`-- target:` header on purpose, with the additive + guard lines that header then
demands.

Its inverse does **not** live here — down-migrations live in
[`migrations/inverse/`](../inverse/README.md), which is also never swept but is allowed
to name production, because production has the half that needs undoing.
