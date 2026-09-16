# `migrations/inverse/` — the down-migrations, and the one way to run them

BUILD-BOOK §4.13 makes every migration carry its own down-migration in the same commit,
and §8.9's abort checklist runs them. Until 2026-09-16 they were all marked
`-- migrate: skip:` — which meant **no path could execute them**: `pnpm db:apply` refuses
a skip-marked file "by any path" by name, and hand-applying through the Supabase MCP is
forbidden in this repo. The abort checklist depended on files nothing could run. That is
ATTACK-5 finding 1's "the abort checklist cannot undo it", literally.

## How this directory replaces the marker

- **No release sweeps it.** Every migration glob in both repos is non-recursive —
  aidream's `_glob_for`, `detect_applied.py`'s copy, this repo's `check-migrations.ts`
  `listSql` — so a file here is invisible to `release.sh` and to
  `pnpm check:migrations`. The marker's job is done structurally, by location.
- **A production apply must be a declared chair step.** An inverse is non-additive by
  construction — that is what reversing means — so `-- target: branch,production` plus
  `-- chair-step: <why>` is the header. `-- chair-step:` stands in for `-- additive: yes`
  and `-- guard:` and excuses the non-additive body scan, and in exchange the runner
  prints the reason **and the file's entire body** before a single byte executes.
- **It is never swept, so it is always named.** Run one deliberately:

```
pnpm db:apply migrations/inverse/<file>.sql --target branch
pnpm db:apply migrations/inverse/<file>.sql --target production
```

Files here are ledgered by **basename**.

## What each inverse still owes you

A down-migration refuses rather than corrupts. `custom_entity_types_detail_variant_down.sql`
counts the rows using `detail` first and raises if any exist — narrowing the CHECK under
live rows would make the table reject its own contents.
`custom_campaign_build_lock_down.sql` raises while any lock row is held, because dropping
the table does not release the lock, it erases the record of who holds it.
