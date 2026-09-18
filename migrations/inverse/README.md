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
  construction — that is what reversing means — so the header is **`-- chair-step: <why>`
  and NO `-- target:` line at all**. 🚨 Re-headed 2026-09-16 (ATTACK-7 finding 2): these
  four files used to carry `-- target: branch,production` above the chair-step line, and
  that header is judged by the ALLOW-LIST, which `-- chair-step:` does not waive. It
  waived everything in `pnpm db:apply` and nothing in `uv run python
  db/apply_migrations.py`, so §8.9 step 3a was accepted by one command and refused by the
  other. A file carrying both is now refused by name, in both runners.
  `-- chair-step:` stands in for `-- additive: yes` and `-- guard:` on a header-less file
  and excuses its deny-list scan, and in exchange the runner prints the reason **and the
  file's entire body** before a single byte executes — and at `--target production`, in
  BOTH runners, runs ONLY when the command names the file (`--confirm-chair-step <file.sql>`),
  and writes the reason into `public._schema_migrations.chair_step`. No terminal, no human: the
  senior session that owns the work runs it; a smaller lane hands it up; never Arman.
- **The SAME bytes rehearse on the branch.** A header-less `-- chair-step:` file is
  accepted at `--target branch` precisely so rule 27's "the inverse was RUN on the branch"
  has a route that does not change a byte between the rehearsal and production.
  The one normative description of all of this is [`../JUDGMENT.md`](../JUDGMENT.md).
- **It is never swept, so it is always named.** Run one deliberately:

```
pnpm db:apply migrations/inverse/<file>.sql --target branch
pnpm db:apply migrations/inverse/<file>.sql --target production --confirm-chair-step <file>.sql
```

Files here are ledgered by **basename**.

## What each inverse still owes you

A down-migration refuses rather than corrupts. `custom_entity_types_detail_variant_down.sql`
counts the rows using `detail` first and raises if any exist — narrowing the CHECK under
live rows would make the table reject its own contents.
`custom_campaign_build_lock_down.sql` raises while any lock row is held, because dropping
the table does not release the lock, it erases the record of who holds it.
