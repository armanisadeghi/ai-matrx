---
name: git-disaster-recovery
type: Skill
title: "git-disaster-recovery — stacked leftover recovery (living, unproven)"
description: "Stacked-git recovery when a checkout looks like a second product line. Use when ahead/behind is huge, worktrees/PRs/stashes stacked, the shared checkout is dirty, or you are tempted to reset, force-push, or commit the dirty tree. NOT for a 30-minute integration sweep (use integration-maintainer)."
tags: [operations, git, worktrees, branches, pull-requests, recovery]
timestamp: 2026-09-20T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/git-disaster-recovery/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# git-disaster-recovery — stacked leftover recovery

This is a **living field guide**, not a finished playbook. It was extracted from one
aidream recovery on 2026-09-19. Several moves worked once. Some were ordered that
night and have not been proven on a second repo. Treat every run as a test of the
guide. If this file and the tree disagree, the tree wins, and this file must change.

Companions, read only when the pointer says so:

- After a unique finding → read [field-log.md](field-log.md), add the row, then fold
  any reusable rule back into this file.
- Proof status of this skill → [evals.md](evals.md). There is no GREEN claim yet.
- Stage 4c only → read [owner-park.md](owner-park.md) for the required
  owner-map research, the one-agent-per-provider fan-out, Prompts A/B/C,
  and the first hunt that found all five leftovers.

## Who may run it

| Who | Allowed | Stop |
|---|---|---|
| Senior (Opus, Astra, or the session owner at that strength) | The whole recovery | When a real two-writer conflict or an ancient leftover needs Arman |
| Junior (Grok, Spark, Sonnet on inventory) | Stage 0 count + Stage 1 facts only | Before any delete, land, reset, or merge |

A junior who sees this pile: inventory, escalate, do not clean. A senior who sees a
**new shape** this file does not name: change the approach, edit this skill in the
same session, and tell Arman in plain English what was unique. Do not silently
adapt and leave the next agent with the old guide.

## Hard bans

These are standing. They are not "unless it would be faster."

- Do not reset the shared checkout
- Do not force-push
- Do not commit the dirty shared tree as one blob
- Do not delete unique **product** GitHub does not have. Older copies of
  files GitHub already rewrote, leftover trees that would unwind later
  `main`, and non-product scratch are junk — delete those.
- Do not merge onto the dirty shared checkout
- Do not treat `ahead/behind` or `git branch --merged` as unique work
- Do not wait on a silent inventory script to decide posture
- Do not treat a hung delete (iCloud, Documents, dead path) as a repo stop
- Do not tell cut-off agents to commit, pull, or reset the shared checkout
  **until Stage 6 is finished and the shared folder is a clean match of
  `origin/main`.** After that, they should commit on this tip — they see
  current code and they resolve their own conflicts. They still must not reset.
- Do not pull the shared checkout onto GitHub `main` until Stage 6
- GitHub `main` (`origin/main` after fetch) is the only merge target and the only
  comparison line. Local `main` is a view, often a stale one. After Stage 4,
  current GitHub `main` usually lives only in the intake checkout. The shared
  folder staying behind is expected.

## Related law (do not copy it here)

- Size 1 leftover (about two worktrees) vs Size 2 stop-the-line →
  [aidream-release-obstacles](/operations/scheduled-tasks/aidream-release-obstacles.md).
  This skill is the Size 2 recovery. A Size 1 pile is ordinary leftover cleanup.
- How unique leftovers land, once you are on the decision pile →
  [unmerged-work-intake](/policies/unmerged-work-intake.md). This skill is the outer
  recovery around that policy. If the two disagree, stop and tell Arman — do not
  pick a winner in the dark.

## Completion

A recovery wave is done when all of these are true, **and** Stage 8 has
started (at least one pull-merge-release after the first disaster release):

1. You fetched, then compared leftovers to current `origin/main` by **patch**, not
   by hash.
2. Every leftover you touched has a bucket from the table below, written down.
3. You deleted only buckets A, B, and H, or you landed unique work through a clean
   intake checkout and then deleted that leftover.
4. The wave report below is filled (landed / held / deleted / owner parks /
   unique findings / Stage 8 cycle / skill edits / one next recommendation).
5. Every unique finding from this run is in this skill or in `field-log.md`, and
   Arman has been told the ones that need him.

"The checkout looks better" is not done.

---

## Stage 0 — Freeze and size

Fetch. Do not move `HEAD` or the working tree.

Count with ordinary git: extra worktrees, local branches, remote branches besides
`main`, open PRs, stashes, dirty and untracked files, `HEAD` vs `origin/main`
left-right. If an official audit script goes silent, drop it. If
`git cherry HEAD origin/main` (the GitHub-only side) hangs on a large behind
count, kill it. The direction that decides unique local work is
`git cherry origin/main HEAD`.

- A handful of leftovers whose unique patches are already on `origin/main` → this
  is not a disaster. **Finish Stage 1 first.** `HEAD` matching `origin/main` can
  still hide leftover branches, a rejected prototype, skill companions that
  sync wrote and nobody committed, or unique untracked files that `log.md`
  already names. Then stand Size 2 down. Junior leftover pass.
- A pile like the 2026-09-19 aidream example (dozens of worktrees, diverged local
  `main`, dirty shared checkout, stacked PRs or stashes) → stop other writers on
  this checkout, then only safe repair. Continue.

## Stage 1 — Truth pass. No changes

The status line is usually a liar. The hygiene pile is usually not.

**1a. The two mains as patches.** Record GitHub `main` SHA, local `HEAD`,
merge-base, last push age. Then `git cherry origin/main HEAD`. Same-message
commits on GitHub usually mean "already landed under a new hash." Report unique
local commits, not the ahead count. Then cherry **every leftover branch** the
same way. `HEAD == origin/main` does not mean the leftover branches are empty.
Cherry `+` plus a same-message commit already on GitHub, with later GitHub
commits on those files, is J: keep GitHub. The leftover is not newer just
because the patches differ.

**1b. Dirty checkout vs GitHub, not vs stale local `main`.** For each modified or
untracked path: already matches `origin/main`, already exists on `origin/main`,
generated/lockfile/`.wt` noise, or truly unique. Untracked often only looks new
because local `main` froze. If `SKILL.md` is on GitHub and its companions
(`evals.md`, `field-log.md`, `owner-park.md`, or any other file in that skill
directory) are only untracked here, that is a sync-commit miss — land the
canonical copies. It is not unique product. Dirty can also be a rewind: a
working-tree file older than GitHub (a version number, a config). That is
junk, not unique product. A `log.md` Creation line is not proof the file is
on GitHub — check `origin/main:path`.

**1c. Bucket every leftover** — every worktree, local branch, remote branch, PR,
and stash gets one letter:

| Bucket | Meaning | Fate |
|---|---|---|
| A | Commit already on `origin/main` | Delete in Stage 2 |
| B | Looks unmerged, same patch already landed | Delete in Stage 2 |
| C | Unique, recent, no real overlap | Land in Stage 4 |
| D | Unique, same-area family (vault, native, storage, same migration numbers) | Inspect as a family |
| E | Unique uncommitted | Park onto a named branch, then intake |
| F | Ancient: last unique commit or edit older than 72 hours | Second look |
| G | Hung / external (iCloud, Documents, missing path) | Skip; do not block |
| H | Noise: lockfile-only, generated, empty stash | Delete in Stage 2 |
| I | Additive collision: unique work, reused a migration number or export name | Renumber / keep both names, then land |
| J | Blind rewrite: leftover rewrites a behavior already on GitHub, and the author likely never saw the live version | Keep GitHub. Land only the new capability. Find the author |
| K | Behind-stack: ~40+ files behind current `main`, fighting the tree | Junk-check, then delete unless a clean feature extracts |
| L | Non-product residue: review notes, agent scratch | Do not land. Delete after a look |
| M | Owner-parked local branch: a cut-off agent committed their in-flight work | Inventory the same hour, then intake like C or E |
| N | Audit leftover: unique production code GitHub does not have | Keep, document, find the owner, review. Never mix this with junk |

If a leftover fits no bucket, that is a unique finding. Do not invent a silent
fifteenth fate.

**1d. Census sibling repos** with the same four numbers: extra worktrees, unique
local commits (`cherry`, not ahead), dirty vs `origin/main`, open PRs.

Resolve `git rev-parse --git-common-dir` for every folder. A differently named
folder that shares another repo's `.git` is that repo's leftover, not a new
disaster. Do not assign a second recovery to it.

A stash can be mixed: some files already on GitHub, some unique lines. Do not
drop it in Stage 2. Land the unique lines, then drop.

Two recoveries writing this skill at once is bucket J on the overlapping
paragraphs: keep GitHub, land only the new capability.

Stop and report two sentences: what the status implied, what the patches say.
Ask before any delete.

## Stage 2 — Easy leftovers only

Delete A, B, and H. Leave C through G and I through L.

- Remove a worktree only if its commit is on `origin/main`. Let git refuse dirty
  ones. Skip a hung remove.
- Delete local and remote branches whose unique patches are on `origin/main`.
  Cherry / patch-id, not `--merged`.
- Drop a stash only when it is empty or older than what is already on GitHub. If
  you cannot prove every file is already on GitHub, it stays. A mixed stash
  (some files B, some unique lines) is not a Stage 2 drop.

Do not touch the dirty shared checkout, open PRs, unique patches, or local `main`.

The "behind" count may go up while you clean, because GitHub is still receiving
pushes. That is healthy.

Report a before/after table. What remains is the decision pile.

## Stage 3 — Confirm the landing rules

If [unmerged-work-intake](/policies/unmerged-work-intake.md) already exists, use
it. Do not rewrite it from memory. If this is the first disaster and the rules
are not written, stop and lock them with Arman before any land.

Standing intake rules, in short:

1. Most recent work lands now, unless the conflict is massive.
2. Inconsequential work lands now: prose docs, comments, lessons, coverage-only
   tests. A git conflict there is keep-both.
3. Anything without a **real** conflict lands too. A git conflict is not a real
   conflict. A real conflict is the same behavior written twice, two ways.
4. Older than 72 hours and not on GitHub `main` gets a second look, unless it is
   an obvious separated chunk.

Sharpenings that kept those rules from being twisted:

- **Recent** is the last unique commit or last uncommitted edit, not the birthday
  of the branch.
- Migrations, generated API contracts, lockfiles, and docs that change a
  behavior claim are not "just docs."
- Merge onto current GitHub `main` in one short-lived intake checkout. Never
  onto the dirty shared checkout. Never reset it to make room.
- Failing CI stops a merge only when it proves this change broke boot, auth,
  data, or a shared contract.
- After it is reachable from `origin/main`, delete the leftover.

Do not start Stage 4 until the human has the rules, or has already locked them.

## Stage 4 — Land the decision pile

**4a. Setup.** Fetch again. Open one clean intake worktree from **current**
`origin/main`. Leave the shared checkout untouched. Park unique uncommitted work
onto its own named branch, then **re-diff the source**. If the park is smaller
than the unique dirty set, you missed files. First aidream park caught two files
and had to go back.

**4b. Wave 1 — obvious yes.** Docs, coverage-only tests, comments, lessons.
Draft PRs that merge cleanly may land. Draft is not a hold. Mid-wave, drop
anything that turns out already to be on GitHub.

**4c. Wave 2 — recent product, no real overlap.** Mechanical git conflicts
(imports, two names for the same helper, changelog lines): keep both.

**4d. Wave 3 — same-area families.** Split the family. Additive new files land.
Rewrites of files that already exist on GitHub hold. Additive migrations that
collided on a number: **renumber onto the next free number and land.** Same
number plus same behavior is a real conflict. Two leftover copies of one rewrite
are one decision.

**4e. Wave 4 — ancient and unproven.** Autostashes. Unique commits that exist
only on the stale shared checkout. Last unique edit older than 72 hours.

One leftover at a time onto the intake tree, then push `origin/main`. Do not
squash unrelated leftovers into one merge. After it is on GitHub `main`, delete
that leftover's PR, branch, and worktree.

The dirty shared checkout catching up is Stage 6, not this stage.

## Stage 4b — Next level (ordered 2026-09-19, first field uses only)

Use this only after the obvious unique leftovers from Stage 4 are on `main`.

1. **Blind-writer extract.** If GitHub has a version and the leftover author
   likely never saw it: keep GitHub's version. Land only the new capability if
   it is still wanted. Dispatch a small finder for that author's conversation
   in Cursor, Codex, or Claude Code. Tell Arman who it was.
2. **New vs old.** New work, even if it looks scary, goes in. Scariness is not
   a hold. A real rewrite-conflict is a hold. Old leftovers do not linger:
   junk-check, then delete. A subagent may do the junk-check.
3. **Stashes older than a day** are rarely a feature. Still look, then drop
   them if they are an old working tree. This is tighter than the 72-hour
   ancient line, and it applies to stashes, not to a clearly separated feature
   branch.
4. **Dirty files without a real conflict go in.** Take them through the intake
   checkout the same way parked work went in. This is not permission to commit
   the dirty tree as one blob. Keep out only what will absolutely conflict.
5. **Shrink the pile.** Tests and harmless residue land now so the next look
   is smaller.

Come back after the round with the wave report. Do not tour the leftover tree.

This is still **not** "we have main in the shared folder." Landing onto intake
does not update the shared checkout. Do not tell anyone it did.

## Stage 4c — Owner research, then recall

This is a required stage, not a side hunt. The owner-map research was the most
useful move of the first recovery. Skip it and later messages are guesses.

Stage 4c only → read [owner-park.md](owner-park.md).

**4c-1. Research (required).** Cluster dirty files first (drop `.wt/` noise
and same-second codegen stamps). Hunt chats for distinctive paths from the
biggest clusters. A subagent may run that hunt. Every leftover gets a
best-guess owner or is marked unclaimed. For a subagent writer, name the
**parent** chat (title + id) and the last-active time on that parent. Write
**one table per provider** (Claude Code, Codex, Cursor). That set is the
artifact you hand people. Never one mixed-provider table.

**4c-2. One agent per provider.** Do not try to message every owner yourself.
Pick one live Codex chat, one Claude Code chat, and one Cursor chat. Give
each **only that platform's table** and tell them to ignore the other
platforms. They fan the prompt to the other chats **on that same provider**.
Skip a platform with `None.` Skip a still-live cluster author unless they
are the fan-out agent.

**4c-3. Which prompt.** Prompt A (park only) until Stage 6 is done. Prompt B
(commit on current `main`) after Stage 6 plus generate. Prompt C (go to the
worktree or audit path; delete the leftover or land the best product on
`main`; delete leftover branches and worktrees; no in-between) once leftovers
have owners and a place they sit. All three texts are in `owner-park.md`.

**4c-4. Inventory the same hour.** New commits and branches become bucket M.
Two owners on one file: hold it.

**4c-5. Unclaimed dirty.** Group files that look like the same work into one
named commit or branch, then keep hunting the owner. Not one blob of the
shared tree.

**4c-6. Hard leftover reduction, in parallel.** Extract a held new capability
onto GitHub's version. Junk-check old behind-stacks. Do not start a
shared-folder pull while unknown dirty remains, unless Arman has already
ordered Stage 6.

## Stage 5 — Sibling repos

Same stages. Do not invent a second method. Suggested order from the first
census: smallest pile first (that night: common-docs, then matrx-local, then
matrx-frontend). Confirm sandbox / extend / ship are still one worktree on
`main`, then ignore them. A folder that is only another name for an already
counted checkout (same common git dir) is not a sibling — skip it.

## Stage 6 — Shared checkout last

Local `main` on the dirty shared checkout catching up is a later checkout
problem. Do not start it while unique leftovers are still unpublished, or
while unknown dirty still has no owner and no orphan park.

A reset of the shared folder onto GitHub `main` is allowed only when Arman
has ordered it **and** unique dirty is parked as named files (not one blob).
Aidream 2026-09-19: he ordered it because the disaster inverted the usual
"local is truth every 30 minutes" rule — remote `main` became the line.

After the shared folder matches `origin/main`, **generate before leftover
replay** when the parked pile is full of `db/models`, `db/managers`, or
helpers. `python db/generate.py` is the live schema contract. Many "unknown"
db files are missing generate, not leftover product. Land that commit first.

Generate is schema truth, not a license to wipe hand methods on a manager
subclass. The stale-revert guard caught `db/managers/media/library_item.py`
losing its paging and metrics. Restore those files and commit the rest.

A pull of GitHub `main` into the shared folder is allowed only when:

- Intake already matches `origin/main`, **or** Arman has ordered Stage 6
  because the shared folder itself is the next work surface
- Bucket M parks are named
- Remaining dirty is empty, already matches GitHub, parked as named orphans,
  or is a held real conflict
- You are not merging onto the dirty tree to "make room"

Until then, GitHub `main` stays in the intake checkout. People who need a
clean tree open a **new** worktree from current `origin/main`.

**After Stage 6 plus generate are on `origin/main` and the shared folder is
clean at that tip:** send Prompt B, then Prompt C once leftovers have names
and paths. One agent per provider, that platform's table only. They go to
the worktree or audit copy, delete the leftover or land the best product on
`main`, and delete leftover branches and worktrees. They do not reset and
they do not paste an old tree onto this one.

After that fan-out has landed, leftover **fresh** dirty with no real conflict
is committed blindly — the ordinary 30-minute rule is back. Real conflicts
come to Arman immediately, one at a time, with one recommendation.

## Stage 7 — Close the pile: junk versus unknown

A mixed pending list is how a disaster grows back. Before you keep anything
for Arman, sort every leftover. The goal is a short list of real product, then
the 30-minute loop again: `git pull`, `git commit -a`, resolve, `release.sh`.

**Delete. These are not review items.**

- Transient files, `.wt/` noise, lockfiles, same-second codegen stamps
- Not a production-app code file (review notes already landed, agent scratch)
- An older copy of a file GitHub already rewrote, and GitHub is newer
- A leftover tree or branch whose merge would unwind later `main`
- Anything already folded in. A done leftover is deleted, not replayed
- A hung iCloud delete of work already on `main` is cleanup, not a review

**Keep and document. These are bucket N.**

- Unique production code GitHub does not have
- It may be good, bad, or mixed. That is why it stays
- Write the exact path. Find the owner. Review before land or delete

Aidream 2026-09-19: a ten-item "pending" list was mostly junk. After this
sort, five real leftovers remained.

**How to review a bucket N leftover** (suggest first, no silent land):

- Newer is usually better. Rare exceptions exist — say why
- Docs: pick the more concise version
- A partial update may land if it does not break the running product. Mark
  it partial and assign a finish agent, or find the original owner
- Destructive or an absolute conflict: hold and ask Arman, one item, one
  recommendation
- Known-good small leftovers (skills, coverage tests, non-destructive
  docs) land now so they stop occupying the list

When the shared folder is current `main` and the only leftovers are a
handful of documented N items, the recovery is over enough to start a
normal release. That is where this process is supposed to begin.

**If `release.sh` stops, that is already a bug.** Once you have said
release, nothing may halt except a failed image/build or a failed live
health check. A fingerprint, a stale proof, a feature break, or a few bugs
is a fixer assignment. Get past the halt quickly so incoming commits keep
landing. Then fix the bug or break that made the script stop — the instance
and the class — so the next run cannot do it again. Aidream 2026-09-19: it
halted on a stale D249 access-kernel fingerprint after a later campaign
rewrote the kernel and never re-proved it. That is a real proof drift and
an illegal halt. Keep merging. Do not sit on the red gate.

## Stage 8 — Pull, fix, release, repeat

**This is the most important step.** Finding leftovers and getting one
release out is the cleanup. Quality comes from the loop after that.

Once the first release is out and leftover owners are found: rapidly fix
what you can. Commit those repairs together with live updates from the
team. Release again. Repeat.

Every cycle, in this order:

1. **Pull `main` first.** Always. Never release on a stale tip.
2. Merge what just landed.
3. Fix what you can yourself, quickly.
4. **Type errors are a Stage 8 fan-out, every cycle they appear.**
   Frontend `pnpm type-check`, each `@ai-matrx/*` `pnpm typecheck`,
   dashboard `tsc`. Read the frontend `type-safety` skill first. One
   file (or one tight sibling cluster) per small agent. They work
   blind from the error list and **never run `tsc`**. **They commit
   those exclusive files locally as they finish** — an uncommitted
   type fix misses the next build. You commit orchestrator type
   syncs the same turn. You run the one
   central check after the wave. At most six at a time. A missing
   OpenAPI path that exists on local aidream is a type sync, not a
   cast. A missing RPC that already exists on `origin/main`'s
   `database.types.ts` is a splice (or a pull), not a full
   `pnpm db-types` on a behind or dirty checkout. Missing
   `node_modules` is install, not a type fix.
5. Fan out everything else to subagents. Do not sit on a list waiting
   for a roster. Another session may write a specific subagent plan —
   start this loop anyway.
6. Commit the repairs plus the incoming work.
7. `release.sh` again.

Fast releases keep the tree in good shape and easy to keep pushing.
Slow, perfect cleanups grow the pile back. Aidream 2026-09-19: owners
were found, Prompt C went out, the first release went out. The next
work is this loop, not more inventory.

---

## Wave report (required shape)

Fill every slot. This is the report, not a reminder.

1. **Repo and stage just finished**
2. **Counts now:** worktrees, local branches, remote branches, open PRs,
   stashes, unique commits still unpublished, dirty unique files
3. **Landed** (each leftover, one line)
4. **Held** (each leftover, why: J / K / F / N / real conflict / unproven)
5. **Deleted** (A/B/H/K-junk only)
6. **Owner research** — one table per provider, who was the one fan-out
   agent per provider, who committed (bucket M), what is still unclaimed
7. **Unique findings** — things this skill did not name. REQUIRED if any.
   What you saw, what you did, what you added to this skill.
8. **Stage 8** — last pull SHA, what you fixed yourself, what you fanned
   out, whether the next release ran
9. **One next recommendation**

Talk to Arman in plain sentences. Do not send him to a path.

## After every unique finding

In the same session:

1. Change your approach for the rest of this run.
2. Add the reusable rule to this SKILL.md, or a dated row to `field-log.md`
   if it is still a one-off.
3. Tell Arman what was unique and whether you changed the skill.

A run that adapted quietly and left this file alone is a failed run.

## Rationalizations

Rows from the 2026-09-19 transcript, not imagined.

| Excuse | Reality |
|---|---|
| "149 ahead means 149 unique commits" | Cherry / patch-id. Most were already on GitHub under new hashes. |
| "Cherry said plus, so this leftover is newer" | Same-message on GitHub plus later GitHub commits on those files is J. Keep GitHub. |
| "This dirty file is uncommitted new work" | Compare to GitHub. A rewind (older version number, older config) is junk. |
| "I need the GitHub-only cherry to finish before I know unique work" | Kill it if it hangs. `git cherry origin/main HEAD` is the unique-local direction. |
| "log.md says the file was created, so it is on GitHub" | Check the path on `origin/main`. A Creation line can land without the file. |
| "This stash is B because one of its files already landed" | A mixed stash stays until the unique lines land. |
| "I'll overwrite the skill with this repo's findings" | Keep GitHub. Land only the new capability. Two recoveries must not rewind each other. |
| "I'll wait for the official audit script" | It ran ~16 minutes with no output. Count with ordinary git. |
| "I'll reset the dirty checkout to make room" | Open an intake worktree from current `origin/main`. |
| "Failing CI means do not merge" | Stop only when this change broke boot, auth, data, or a shared contract. |
| "A git conflict is a real conflict" | Two implementations of the same behavior is a real conflict. |
| "This family is one yes or no" | Split it. Additive files landed; the rewrite was held. |
| "I'll commit the dirty tree" | Park unique files, re-diff, intake. Never one blob. |
| "The hung Documents worktree blocks the repo" | Skip it. Finish the rest. |
| "Behind went up, so I made it worse" | GitHub still moving is the live line. Healthy. |
| "`--merged` did not list it, so it is unique" | Same work, new hashes. Cherry it. |
| "The skill covers this, no need to tell Arman" | A shape this file does not name must be presented and written in. |
| "We landed on intake, so agents can pull main here" | Shared folder is still the stale mash until Stage 6 finishes. Intake is the live line until then. |
| "Tell cut-off agents to commit on the shared checkout" | Only after Stage 6 plus generate are on `origin/main` and this folder is clean at that tip. Until then they park on their own local branch. |
| "I'll wait to find owners until after I pull" | The owner map is the critical step. Run it. Messaging without it is a guess. |
| "I have to message every owner myself" | One live agent per provider, that platform's table only, they fan out on that provider. |
| "Generate is done, so leftover db files are junk" | Schema-shaped output is truth. Hand methods generate just wiped are product. Restore those. |
| "I'll keep all ten pending so we don't lose anything" | Most were older copies or unwind trees. Sort junk from unknown. Only unique product stays. |
| "This leftover tree looks huge and unique" | Compare to current GitHub. If merging it unwinds later work, it is junk. |
| "I'll give every provider the full mixed table" | One table per platform. They cannot message outsiders. |
| "Park it again and we will decide later" | Prompt C: deleted or committed. No leftover branch or worktree left. |
| "release.sh went red, so we wait" | Illegal halt. Get past it. Fix the class. Only a failed build or health check may stop a release. |
| "The first release is out, so we are done" | Stage 8 is the point. Pull main, fix fast, fan out, commit, release again. |
| "Wait for the subagent plan before touching anything" | Do what you can now. Fan the rest. Do not sit. |
| "pnpm db-types will clear three missing RPCs" | Only at `origin/main`. On a behind checkout it imports the whole live schema and explodes tsc. Splice the missing functions, or pull first. |
| "HEAD equals origin/main, so stand down now" | Finish Stage 1. Leftover branches can still hold a unique rejected commit. |
| "The skill file is on GitHub, so the skill landed" | Companions are part of the skill. Untracked companions after a `SKILL.md` commit are a sync-commit miss. Land the canonical copies. |

## Red flags

- "I'll just reset `main`."
- "This is close enough to commit everything."
- "The inventory script will finish eventually."
- "I already know what is unique from the ahead count."
- "This case is different, so I will not update the skill."
- "I'm only a junior, but I can clean this."
- "Main is landed, so everyone can pull now."
- "I'll just have them commit on this folder."
- "I'll skip the owner hunt and just message someone."
- "I'll keep the leftover trees so we can look at them later."
- "I'll paste Claude leftovers into the Codex chat too."
- "release.sh stopped, so we stop."
- "The first release shipped, so we can slow down."
- "I'll wait for the subagent roster before I pull."
- "I'll just run `pnpm db-types` on this behind checkout."
- "HEAD matches GitHub, so there is nothing left."
- "SKILL.md synced, so I can ignore the untracked companions."
- "log.md already recorded the creation, so the file is on GitHub."
- "One file in the stash landed, so drop the stash."
- "I'll replace the skill text with this repo's version."

## Trigger relocation

Triggers dropped from the listing description live here so a repo grep still
finds them.

| Old / extra trigger | Home |
|---|---|
| "git disaster", "insane disaster", "merge review" | Stage 0 |
| "no worktrees, no unmerged code", leftover PRs | Stage 1c buckets |
| `origin/main`, `git cherry`, patch-equivalent | Stage 1a |
| autostash, stash older than a day | Stage 4b.3 |
| migration number collision, `0925` / `0926` | Bucket I, Stage 4d |
| blind writer, leftover author never saw main | Bucket J, Stage 4b.1 |
| intake worktree, detached merge | Stage 4a |
| shared checkout, dirty tree as one blob | Hard bans, Stage 6 |
| cut-off agent, error mode, stopped session, dirty-file owner | Stage 4c, owner-park.md |
| cluster dirty files, owner map, one agent per provider | Stage 4c-1 and 4c-2 |
| "do we have main", pull main, commit your work | Stage 4c Prompt A vs B vs C, Stage 6 |
| db/generate.py, generated managers, schema truth | Stage 6 generate-first |
| Size 2, stop the line | Related law → obstacles |
| integration every 30 minutes | NOT-for → integration-maintainer |
| junk vs unknown, GitHub is newer, not production code | Stage 7 |
| release.sh, blindly commit fresh dirty | Stage 6 tail, Stage 7 |
| release must not block, D249, stale fingerprint | Stage 7 tail |
| Prompt C, delete or commit, no in between | Stage 4c-3, owner-park.md |
| pull main first, repeat release, fan out | Stage 8 |
| type errors, type-safety, tsc army | Stage 8 type-error fan-out |
