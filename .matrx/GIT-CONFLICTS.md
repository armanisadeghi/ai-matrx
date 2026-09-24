# Git conflicts — goal: ZERO items

Written automatically by `scripts/sync-main.py` whenever it syncs this repo with GitHub and hits
something it cannot safely decide alone.

**Agents: your job is to make this file empty — correctly.** Fix an item, then DELETE its line.
When a `_conflicts/<stamp>/` folder has no files left, delete the folder and its heading. Never
keep history here: a fixed item is deleted, never ticked or moved to a "done" list.

**Nothing here can be lost.** Both versions of every held file are permanently in git; the
`.held` file and its line below show the exact `git show` command that brings either one back.
The worst outcome is still dropping someone's work without noticing — so never delete lines from
either version unless you can say why they are not needed.

## How to resolve a held file

1. **Read the FACTS block at the top of the `.held` file.** It says exactly which version is
   which (LOCAL is in the `.held` file; GITHUB is live in the repo), when each side changed the
   file and with what commit message, what each side added and removed, and what code one side
   has that the other lacks. These are computed from git. Do not recompute them.
2. **Compare the two versions** with the COMPARE command in the facts. Its labels are correct.
3. **Work out what each side was trying to do.** Read the commit messages and the lines each side
   added and removed.
4. **Decide which code is the upgrade.** Newer is a clue, never the answer. An upgrade can ADD code
   (a new feature, a fix) or REMOVE code (a cleanup, code replaced by something better, code moved
   elsewhere). Ask:
   - Did one side rewrite, replace or move what the other side has? Then the rewrite is usually
     the upgrade — but check that it covers what the old code did.
   - Did the sides do different, unrelated things? Then the right answer keeps BOTH: combine them.
   - Would your choice drop lines from either side? For every dropped piece, you must be able to
     say why it is no longer needed. If you cannot, do not drop it.
5. **Write the result into the live file** at `<path>` (never copy the `.held` header in).
6. **Prove it works.** `pnpm type-check` for TypeScript; fix anything your choice broke. If it
   cannot be made to work, go to "When you are not sure" instead.
7. **Clean up:** delete the `.held` file, delete its line below, delete an empty folder + heading.
   Then `python3 scripts/check-conflict-markers.py` must print `clean`.
8. **Commit, saying what you decided and why** — this is the permanent record:
   `git commit -m "Resolve held conflict <path>: kept <LOCAL|GITHUB|both> because <reason>" -- <path> .matrx/GIT-CONFLICTS.md _conflicts/`
9. **Sync:** `python3 scripts/sync-main.py`

## When you are not sure — escalate, never guess

Taking your time is fine. Guessing is not. If you cannot say with confidence which code is the
upgrade, or your choice would drop work you cannot explain:

1. Delete NOTHING. Leave the live file and the `.held` file exactly as they are.
2. MOVE the item's line from "Held files" (or from the level you picked it up at) to the NEXT
   level up: Needs a manager → Needs the boss agent → Needs Arman. Write it as:
   `- _conflicts/<stamp>/<path>.held — <the exact question> — <what you checked> — <who you are>`
3. Run `python3 scripts/sync-main.py` so the escalation reaches everyone.

Whoever works a level either resolves the item (steps 1–9 above) or moves it one level up with
their own question and findings added.

## How to resolve a docs/comments item

The file holds both versions between marker lines (LOCAL first, then GITHUB, with their times).
Keep the right text — often one clean passage combining both — delete all three marker lines,
delete the item's line below, then do steps 7–9 above.

## Held files — real conflicts

## Needs a manager

## Needs the boss agent

## Needs Arman

## Docs and comments — both versions kept
