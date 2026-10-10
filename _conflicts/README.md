# Merge conflicts from scripts/sync-main.py

This folder is permanent. When every list below is empty, nothing from `scripts/sync-main.py` is
open in this repo. (`scripts/sync-main.py` removes empty folders left inside it on every run.)

## What the items are
- **Held file** — `_conflicts/<stamp>/<path>.held`. LOCAL and GITHUB changed the same code.
  GITHUB's version is live in the repo at `<path>`; LOCAL's version is inside the `.held` file,
  below a FACTS block computed from git. Both versions stay in git permanently; each `.held` file
  has the `git show` commands that print either one.
- **Docs/comments, both versions kept** — a file in the repo where a clashing passage now holds
  both versions between three marker lines (LOCAL first, then GITHUB).

## Marking an item done
- Held file: the final code is in `<path>`, the `.held` file is deleted, its line below is deleted.
- Docs/comments: the passage is edited, the three marker lines are deleted, its line below is deleted.
- `python3 scripts/check-conflict-markers.py` lists everything still open, or prints `clean`.
- `python3 scripts/sync-main.py` commits and syncs.

## Escalation
An item is passed up by moving its line to the next section (Needs a manager -> Needs the boss
agent -> Needs Arman) with ` — <question> — <what was checked> — <who>` added to the end of it.
Its files stay as they are.

## Needs a manager

## Needs the boss agent

## Needs Arman

## Docs and comments — both versions kept

## Held files
- _conflicts/2026-10-10-091152/migrations/measurements/14bc0eaa690bda1d05b1d91e85934fbb76c4e16e2b77def6c83f2072734b7b2c.brief.json.held — LOCAL latest 2026-10-10 09:11; GITHUB latest 2026-10-10 09:06; LOCAL lacks 2 of GITHUB's 5 new lines; GITHUB lacks 2 of LOCAL's 5 new lines; recover: git show 4ebce7e45d:'migrations/measurements/14bc0eaa690bda1d05b1d91e85934fbb76c4e16e2b77def6c83f2072734b7b2c.brief.json' / e1e5755ccc:'migrations/measurements/14bc0eaa690bda1d05b1d91e85934fbb76c4e16e2b77def6c83f2072734b7b2c.brief.json'
- _conflicts/2026-10-10-091152/migrations/measurements/2599b11da632be579ecfd1080b1f7eda40202fc1646f85380c832ce2f6ec0a7e.brief.json.held — LOCAL latest 2026-10-10 09:10; GITHUB latest 2026-10-10 09:06; LOCAL lacks 2 of GITHUB's 5 new lines; GITHUB lacks 2 of LOCAL's 5 new lines; recover: git show 4ebce7e45d:'migrations/measurements/2599b11da632be579ecfd1080b1f7eda40202fc1646f85380c832ce2f6ec0a7e.brief.json' / e1e5755ccc:'migrations/measurements/2599b11da632be579ecfd1080b1f7eda40202fc1646f85380c832ce2f6ec0a7e.brief.json'
- _conflicts/2026-10-10-091152/migrations/measurements/d1fc7fb63738dae9114e272fb2d61a8b65040b5d3b9ad70b658e603c990ceb6d.brief.json.held — LOCAL latest 2026-10-10 09:08; GITHUB latest 2026-10-10 09:06; LOCAL lacks 2 of GITHUB's 5 new lines; GITHUB lacks 2 of LOCAL's 5 new lines; recover: git show 4ebce7e45d:'migrations/measurements/d1fc7fb63738dae9114e272fb2d61a8b65040b5d3b9ad70b658e603c990ceb6d.brief.json' / e1e5755ccc:'migrations/measurements/d1fc7fb63738dae9114e272fb2d61a8b65040b5d3b9ad70b658e603c990ceb6d.brief.json'
- _conflicts/2026-10-10-091152/scripts/apply-migration.ts.held — LOCAL latest 2026-10-10 09:07; GITHUB latest 2026-10-10 09:06; LOCAL lacks 4 of GITHUB's 48 new lines; GITHUB lacks 4 of LOCAL's 48 new lines; recover: git show 4ebce7e45d:'scripts/apply-migration.ts' / e1e5755ccc:'scripts/apply-migration.ts'
- _conflicts/2026-10-10-091152/scripts/lib/migration-target.ts.held — LOCAL latest 2026-10-10 09:07; GITHUB latest 2026-10-10 09:06; LOCAL lacks 2 of GITHUB's 60 new lines; GITHUB lacks 2 of LOCAL's 60 new lines; recover: git show 4ebce7e45d:'scripts/lib/migration-target.ts' / e1e5755ccc:'scripts/lib/migration-target.ts'
- _conflicts/2026-10-10-091152/scripts/rehearse-migration.ts.held — LOCAL latest 2026-10-10 09:07; GITHUB latest 2026-10-10 09:06; LOCAL lacks 2 of GITHUB's 16 new lines; GITHUB lacks 5 of LOCAL's 19 new lines; recover: git show 4ebce7e45d:'scripts/rehearse-migration.ts' / e1e5755ccc:'scripts/rehearse-migration.ts'
