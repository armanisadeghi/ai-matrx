# Git conflicts — goal: ZERO items

Written automatically by `scripts/sync-main.py` whenever it syncs this repo with GitHub and hits
something it cannot safely decide alone. Nothing here is lost: every local byte is also inside the
sync's "local work not committed by agents who made them" commit.

**Agents: your job is to make this file empty.** Fix an item, then DELETE its line. When a
`_conflicts/<stamp>/` folder has no files left, delete the folder and its heading. Never keep
history here — a fixed item is deleted, never ticked, annotated or moved to a "done" list.

## How to resolve a held file (do these in order)

1. **Open the `.held` file and read its FACTS block first.** The sync computed them from git:
   when each side last changed the file, the commit message on each side, which side is NEWER,
   and exactly which lines each side has that the other does not. Trust these facts over your own
   reading of dates — do not recompute them.
2. **Compare the two versions.** The live file at `<path>` is GitHub's. The `.held` file is ours
   (everything below the `LOCAL VERSION BELOW` line):
   `diff <path> _conflicts/<stamp>/<path>.held`
3. **Decide, using the facts:**
   - The NEWER side usually wins. Take it, then check the lines the facts say it does NOT have:
     if the newer side rewrote them on purpose (same job, new code), drop them; if they are a
     separate feature, add them to the newer side.
   - Both sides added different, unrelated things → combine them by hand.
   - The facts say UNSURE, or you truly cannot tell → leave the item, add ONE line under
     "Needs Arman" saying what the choice is.
4. **Apply:** write the chosen content into the live file at `<path>` (without the `.held`
   header). Make sure it compiles: `pnpm type-check` for TypeScript — fix anything your choice broke.
5. **Clean up:** delete the `.held` file, delete its line below, delete the empty folder + heading.
6. **Verify:** `python3 scripts/check-conflict-markers.py` must print `clean`.
7. **Finish:** `python3 scripts/sync-main.py` — it commits your fix and syncs with GitHub.

(History if you need more than the facts: the sync's merge commit is
`git log --merges --grep='sync-main' -1`; its `^1` is the local side, `^2` is GitHub's.)

## How to resolve a docs/comments item

The file holds both versions between marker lines (LOCAL first, then GITHUB). Keep the right text
(usually the newer one, or both merged into one clean passage), delete all three marker lines,
delete the item's line below, then do steps 6–7 above.

## Held files — real conflicts

## Needs Arman

## Docs and comments — both versions kept
