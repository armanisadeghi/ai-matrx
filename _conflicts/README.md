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
- features/make/FEATURE.md — LOCAL latest 2026-10-09 00:39; GITHUB latest 2026-10-09 01:07; LOCAL lacks 14 of GITHUB's 14 new lines; GITHUB lacks 2 of LOCAL's 2 new lines; recover: git show ede216c8ac:'features/make/FEATURE.md' / 1dcb78466f:'features/make/FEATURE.md'

## Held files
- _conflicts/2026-10-09-011149/features/make/describe/DescribeBox.tsx.held — LOCAL latest 2026-10-09 01:10; GITHUB latest 2026-10-09 01:07; LOCAL lacks 22 of GITHUB's 24 new lines; GITHUB lacks 170 of LOCAL's 171 new lines; recover: git show ede216c8ac:'features/make/describe/DescribeBox.tsx' / 1dcb78466f:'features/make/describe/DescribeBox.tsx'
- _conflicts/2026-10-09-011149/features/make/describe/describeTemplate.ts.held — LOCAL latest 2026-10-09 01:02; GITHUB latest 2026-10-09 01:07; LOCAL lacks 8 of GITHUB's 8 new lines; GITHUB lacks 28 of LOCAL's 28 new lines; recover: git show ede216c8ac:'features/make/describe/describeTemplate.ts' / 1dcb78466f:'features/make/describe/describeTemplate.ts'
- _conflicts/2026-10-09-011149/pnpm-lock.yaml.held — LOCAL latest 2026-10-09 01:09; GITHUB latest 2026-10-09 01:07; LOCAL lacks 28 of GITHUB's 108 new lines; GITHUB lacks 11 of LOCAL's 11 new lines; recover: git show ede216c8ac:'pnpm-lock.yaml' / 1dcb78466f:'pnpm-lock.yaml'
- _conflicts/2026-10-09-032923/pnpm-lock.yaml.held — LOCAL latest 2026-10-09 03:29; GITHUB latest 2026-10-09 03:13; LOCAL lacks 22 of GITHUB's 147 new lines; GITHUB lacks 31 of LOCAL's 155 new lines; recover: git show 69ce10233e:'pnpm-lock.yaml' / 654d4fe443:'pnpm-lock.yaml'
