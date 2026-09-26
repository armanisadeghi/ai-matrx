# `migrations/campaign/` — the campaign's own directory, scanned by nothing

**Nothing sweeps this directory.** Every migration glob in this repo and in `aidream`
is non-recursive, and `campaign` is deliberately **not** in aidream's
`MIGRATION_SOURCES`, so `_discover`, `--check`, `detect_applied.py`, both
`scripts/release.sh`, every CI workflow and both 30-minute release crons have no way
to reach a file in here.

## Why it exists

2026-09-16. `migrations/rehearsal/` closed the **instance** — a `-- target: branch`
file applied to production at 03:52:12Z — and left the **class** open. Every campaign
DDL file by contract sits in `migrations/`, headed `-- target: branch,production`,
`-- additive: yes`, `-- guard: <feature>/<key>`. That is the exact shape both release
sweeps are built to **apply**. So the campaign's own migrations reached production
within thirty minutes of the commit: before the lane's branch exit had passed, outside
the object lock, and whether or not the lane ever got there. `BUILD-BOOK` §6b.1, §6b.5
and §4.14 were all false of what actually runs.

## The one command

```
pnpm db:rehearse migrations/campaign/<file>.sql --target clone --source campaign --lane <lane>
# …then:
pnpm db:apply migrations/campaign/<file>.sql --source campaign --target production --lane <lane>
```

or, from `aidream` (the only route for a file needing autocommit):

```
uv run python db/apply_migrations.py --source campaign --only <file>.sql \
  --target branch|production --lane <lane> --no-generate
```

Both runners refuse every other combination, by name:

- a file **in here** applied without `--source campaign` — refused by LOCATION;
- `--source campaign` naming a file **not** in here — the flag is an assertion about
  the file, not a mode;
- `--source campaign` without `--target`, without `--only`, or without `--lane`;
- ~~`--target production` when the same bytes carry no rehearsal ledger row~~ — removed
  2026-09-18 (JUDGMENT.md §6a: the rehearsal copy is information, never a gate);
- ~~`--target production` when `campaign_watch.build_lock` on the rehearsal branch holds no
  row for that `--lane`~~ — removed 2026-09-25 (lane DB-TOOLS-NO-BRANCH): the branch was
  deleted 2026-09-26 00:30Z and that read refused every campaign file. At production
  `pnpm db:apply` now needs `--lane` and matching `-- based-on:` hashes, and PRINTS the
  pair's clone-ledger state (`--dry-run` included). aidream's runner still reads the branch
  here — the same defect, open.

Ledgered by **basename** under the owning repo's source label, so a file that moves in
here keeps the identity its rehearsal row already carries.

## Rehearsing on the clone takes the SAME build_lock rows

`pnpm db:rehearse <file> --target clone` (rule 27 in one command) takes the
`campaign_watch.build_lock` rows **on the clone** that an apply of the same file would
take, before its first measure pass, and releases them on every exit path including
Ctrl-C. Which rows: the file's own `-- lock: custom,platform` header when it carries
one, otherwise every family (`custom` | `platform` | `iam`) whose schema the up or the
inverse names. A row somebody else holds is waited on five times, 15 s apart, naming the
holder, and then REFUSED — nothing measured. Without it, two lanes rehearsing the same
objects on the one shared clone kill each other's measure pass at the 5 s `lock_timeout`
with no name attached to the cause.

Guards: `scripts/__tests__/migration-target-refusals.test.ts`,
`aidream/db/tests/test_campaign_dir_is_never_swept.py`.
