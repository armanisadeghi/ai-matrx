# Git conflicts — goal: ZERO items

Written automatically by `scripts/sync-main.py` whenever it syncs this repo with GitHub and hits
something it cannot safely decide alone. Nothing here is lost: every local byte is also inside the
sync's "local work not committed by agents who made them" commit.

**Agents: your job is to make this file empty.** Fix an item, then DELETE its line. When a
`_conflicts/<stamp>/` folder has no files left, delete the folder and its heading. Never keep
history here — a fixed item is deleted, never ticked, annotated or moved to a "done" list.

## How to resolve a held file (do these in order)

1. **Find the sync's merge commit** (M below):
   `git log --merges --grep='sync-main' -1 --format='%h %ci'`
2. **Learn WHEN and WHY each side changed the file** — the newer change usually wins:
   - GitHub side: `git log -5 --format='%h %ci %s' M^2 -- <path>`
   - Local side:  `git log -5 --format='%h %ci %s' M^1 -- <path>`
     (if the only local entry is "local work not committed…", the edit was uncommitted; its time
     is roughly the time of that commit or earlier)
3. **Compare the two versions.** The live file is GitHub's. The `.held` file is ours (skip its
   header, everything above the `LOCAL VERSION BELOW` line):
   `diff <path> _conflicts/<stamp>/<path>.held`
4. **Check whether the NEWER side already contains the older side's change.** It often does —
   an agent pushed an early copy, then kept working. The change may have MOVED to another file:
   pick 2–3 distinctive lines the older side added and search for them:
   `git grep -n -F '<distinctive line>'`
5. **Decide:**
   - Newer side contains the older side's change (in this file or moved elsewhere) → take the newer side.
   - Newer side deliberately REWROTE the older side's lines (same purpose, new code) → take the newer side.
   - Both sides added different, unrelated things → combine them by hand.
   - Truly unclear → leave the item, add ONE line under "Needs Arman" saying what the choice is.
6. **Apply:** write the chosen content into the live file at `<path>` (without the `.held` header).
   Make sure it compiles: `pnpm type-check` (TypeScript) — fix anything your choice broke.
7. **Clean up:** delete the `.held` file, delete its line below, delete the empty folder + heading.
8. **Verify:** `python3 scripts/check-conflict-markers.py` must print `clean`.
9. **Finish:** `python3 scripts/sync-main.py` — it commits your fix and syncs with GitHub.

## How to resolve a docs/comments item

The file holds both versions between marker lines (LOCAL first, then GITHUB). Keep the right text
(usually the newer one, or both merged into one clean passage), delete all three marker lines,
delete the item's line below, then do steps 8–9 above.

## Held files — real conflicts

### _conflicts/2026-09-24-113745/

## Needs Arman

## Docs and comments — both versions kept
