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

## Held files
- _conflicts/2026-09-24-231345/features/admin/spend/explorer/TopRequestsTable.tsx.held — LOCAL latest 2026-09-24 23:08; GITHUB latest 2026-09-24 22:55; LOCAL lacks 1 of GITHUB's 68 new lines; GITHUB lacks 1 of LOCAL's 68 new lines; recover: git show 51c9630433:'features/admin/spend/explorer/TopRequestsTable.tsx' / 02528b5f36:'features/admin/spend/explorer/TopRequestsTable.tsx'

## Needs a manager

## Needs the boss agent

## Needs Arman

## Docs and comments — both versions kept
