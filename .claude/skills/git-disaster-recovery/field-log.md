---
type: Reference
title: "git-disaster-recovery — field log"
description: "Dated observations from live recoveries. A row here is not law until it is folded into SKILL.md. Read only when you have a unique finding, or when you are editing the skill."
tags: [operations, git, recovery]
timestamp: 2026-09-20T00:00:00Z
---

# Field log

**These rows are examples from specific repos on specific nights. They are not
procedure.** The five aidream leftovers, the `db/generate.py` step, the D249
release halt, the W7-OFF ancestor, the launchpad series: none of that is
required on your repo. Read a row only when you hit something like it.

One row per unique observation. If a row turns out to be a reusable rule, fold
a one-line version into `SKILL.md` and leave the example here. Column "Folded
into" names the old stage numbers from the first draft; the current skill is
six numbered steps.

**The lesson of the frontend run (2026-09-20).** The agent followed the first
draft's stage order: inventory, owner tables, prompts, then landing. Seven hours
in, skills, docs, and thirty already-applied migrations were still sitting
dirty while owners were being hunted. Arman: "the name of the game is to reduce
the volume of stuff in front of your face." The skill was rewritten so step 2
is shrink the dirty set, and owners are step 4 for whatever is left.

| When | Repo | What we thought | What was true | Folded into SKILL.md? |
|---|---|---|---|---|
| 2026-09-21 | matrx-frontend | The install gate protecting the dev preview was a safeguard | It refused `pnpm sync-types` and the release loop while a preview ran; changed to warn-and-proceed with strict mode opt-in, self-test 10/10 both ways | Step 7 |
| 2026-09-21 | matrx-frontend | Synced at 15:00 means synced | By 18:50 the shared folder was 62 behind with a stale conflicted index entry from someone's aborted merge; every pull refused. Resolve stray unmerged entries with GitHub's version, then the loop | Step 7 |
| 2026-09-20 | matrx-frontend (afternoon) | A clean folder stays clean | A 5-hour usage pause at 13:00 stranded 81 dirty files from paused Claude sessions; Codex and Cursor lanes kept writing. Committed the hour-old ones in six clusters; Vercel built them green | Step 7 |
| 2026-09-20 | matrx-frontend | Landing a lane's dirty helper is safe if origin never touched it | A one-line change to a helper reached from client bundles imported the server-only Supabase client and failed the Vercel build. Reverted one file. Client reach, not origin history, is the test for shared helpers | Step 7 type-check |
| 2026-09-20 | matrx-frontend | A regenerated database.types.ts is truth, land it | It brought 136 type errors because no consumer had landed. Regenerated types land with their consumers, in the lane's own commit | Step 7 |
| 2026-09-20 | matrx-frontend | The pull is blocked by a conflict | It was blocked by untracked duplicates of files lanes had pushed from worktrees. Byte-identical to origin: delete; different: move aside | Step 7 |
| 2026-09-20 | matrx-frontend | Down-migrations at the top level were a one-off | Twice in one day. Now a step-6 rule | Step 6 |
| 2026-09-20 | matrx-frontend | The release watch stopped releasing | After a release lands in the range, the Vercel ignore step builds every later push, so live already contains every commit and the watch correctly ships nothing. Check the deployment list before declaring the watch dead | Step 6 |
| 2026-09-20 | matrx-frontend | An intake worktree is mine for the session | Another lane's cleanup removed it mid-run. Recreate and continue; never assume it is there | Step 7 |
| 2026-09-20 | matrx-frontend (rewrite proof run) | 266 dirty paths were a mountain | 159 matched GitHub byte-for-byte, 28 were older copies, 12 junk, all 38 migrations identical to GitHub. 24 unique; 9 of those were pre-fix states GitHub had already hardened. Eight files landed. Two subagents classified everything in under ten minutes | Step 2 |
| 2026-09-20 | matrx-frontend | 74 leftovers (branches, worktrees, stash) needed individual decisions | 49 were landed or superseded by patch; one branch of eight commits landed by cherry-pick; one port allocation renumbered; 12 hollow trees; 6 live. All 14 "unique" local-main commits were older halves of pairs GitHub had resolved better | Step 3 |
| 2026-09-20 | matrx-frontend | The morning's "land dirty product that adds to GitHub" commit was safe | It put an exact 16-hour-older MandatesConsole.tsx over the three-state version, re-imported a deleted canvas menu, and dropped a diagnostics key: one release-halting gate failure and two type-error files. Whole-file copies of exists-and-differs paths are rewinds | Hard bans, step 2 |
| 2026-09-20 | matrx-frontend | Down-migrations at the top level of migrations/ are inert | The release sweep treats them as pending forward work and refuses them (DD-224), halting release.sh. They belong in migrations/inverse/ with a chair-step header. Same class as b530eceb62 the same morning | Step 6 |
| 2026-09-20 | matrx-frontend | `git checkout -- .` is how you restore the tree | The shared-checkout guard reads the whole command line and refuses it before anything runs, including the unrelated commands chained before it. Name paths with `git restore -- <paths>`; run separate commands | Step 5 |
| 2026-09-20 | matrx-frontend | A removed worktree stays removed | A live Codex owner re-created the vault worktree at the same tip under a new branch name minutes after it was removed. Its commits were all on main. Owner line, not a second removal | Step 4 |
| 2026-09-20 | matrx-frontend | Live writers pause for a recovery | Two Codex sessions committed on the shared folder during the run (one already on GitHub by patch) and a third started fresh work the minute the folder matched GitHub. The loop restarts itself once local equals remote | Step 5 |
| 2026-09-20 | matrx-frontend | Fan-out after 01:30 PT was Prompt A | Codex/Claude got Prompt C cleanup at ~01:33 PT. Only vault-task3 parked a new branch. Live writers `4aca9d01` / `97ce06fb` are not leftovers | owner-park: C forbidden on stale shared folder |
| 2026-09-20 | matrx-frontend | Prompt A is the first-night "you got cut off" text | There was no interruption. The ask is isolate unique work so it can be found. The cutoff sentence makes owners resume and repair the shared folder | owner-park A/B rewritten |
| 2026-09-20 | matrx-frontend | Owner hunt waits for Stage 4c | Arman ordered it as soon as Stage 1 named the hard leftovers. Codex owners (battle, server-search, storage-picker, vault-task3) showed up while landing continued | Owner hunt after Stage 1 |
| 2026-09-20 | matrx-frontend | Merge-tree of a stale-main commit is the leftover | That commit object still carries the W7-OFF ancestor. Cherry-pick the unique patch. A launchpad series must be picked in order | Stage 4 cherry-pick series |
| 2026-09-20 | matrx-local | Prompt C waits for a Codex paste | This Cursor session has no Codex send door. The keep-GitHub decision was already written. Recovery owner deleted the leftover and the park branch, then started Stage 8 | owner-park Prompt C, Stage 4c-2 |
| 2026-09-20 | matrx-local | Stage 6 is `git reset --hard origin/main` | The shared-checkout guard refused reset and `restore .`. Named-path restore, then point `main` at GitHub, made the folder a clean match | Stage 6 |
| 2026-09-20 | matrx-local | Stage 6 generate-first applies here | No `db/generate.py`. Desktop app. Skip generate | Stage 6 |
| 2026-09-20 | matrx-frontend | merge-tree clean means the leftover stays clean | After one land, the next leftover collided in FOUND_DEFECTS.md / window-panels. Re-probe after every push | Stage 4 |
| 2026-09-20 | matrx-frontend | Keep-both on FOUND_DEFECTS.md can keep the same D number | Two D339 filings. Later leftover gets the next free ID | Stage 4 |
| 2026-09-20 | matrx-frontend | Delete the leftover branch as soon as the merge commit exists | Push was rejected because GitHub moved. Delete only after `origin/main` is an ancestor | Stage 4 |
| 2026-09-19 | aidream | 149 ahead / 433 behind was a second product line | 129 of 149 local commits were already on GitHub as the same patch; ~10 unique; GitHub half of the split was real | Stage 1a |
| 2026-09-19 | aidream | 76 worktrees were unique leftover work | 56 already pointed at commits on GitHub; 12 had unique patches | Stage 2 |
| 2026-09-19 | aidream | Untracked files were new work | 46 of 67 already existed on `origin/main`; local `main` was stale | Stage 1b |
| 2026-09-19 | aidream | `--merged` would list the safe deletes | Several "unmerged" branches were the same work under new hashes | Stage 2 |
| 2026-09-19 | aidream | `audit_branches.sh` is how you inventory a pile | Piped to `tail` it stayed silent ~16 minutes; ordinary git decided posture | Stage 0 |
| 2026-09-19 | aidream | A Documents/iCloud worktree must be removed before continuing | The remove hung; skipping it let the rest finish | Bucket G |
| 2026-09-19 | aidream | Parking unique uncommitted work is one add | First park caught two files; the rest, including a renamed migration, were still dirty | Stage 4a |
| 2026-09-19 | aidream | A used migration number means pick a winner | GitHub had used `0925`/`0926` for different work; leftover migrations were additive and landed after renumber | Bucket I |
| 2026-09-19 | aidream | A vault/native family is one merge decision | Additive lifecycle files landed; native-export rewrite of live validation was held | Stage 4d |
| 2026-09-19 | aidream | Folder-browse leftover still needed to land | It was already on GitHub; discovered mid-wave | Stage 4b "already on GitHub" |
| 2026-09-19 | aidream | Draft PRs wait | Google-native draft merged cleanly and landed | Stage 4b |
| 2026-09-19 | aidream | Two leftover copies are two decisions | Native-export existed twice; same work | Stage 4d |
| 2026-09-19 | aidream | A 40–60 file behind stack is a feature waiting to merge | Merging it would fight current `main`, not add a clean chunk | Bucket K |
| 2026-09-19 | aidream | Git conflict on two exports of one helper is a pick | Kept both names | Stage 4c |
| 2026-09-19 | aidream, sibling census | Only aidream is in this class | Frontend same class (29 worktrees, 8 unique local commits, 7 PRs). Local 15/1. Docs 6/0. Sandbox, extend, ship clean | Stage 5 |
| 2026-09-19 | aidream | After Stage 4, hold remaining dirty files and old stashes | Arman ordered Stage 4b: keep GitHub on a blind rewrite and find the author; new-even-if-scary goes in; old junk-check then delete; stashes >1 day rarely worth it; non-conflicting dirty files go through intake | Stage 4b — first field uses only, not yet proven on a second repo |
| 2026-09-19 | aidream | After leftovers landed, the shared folder has main | Intake matches GitHub. Shared `main` was still ~150 ahead / ~480 behind and dirty. Cut-off agents must not commit or pull there | Stage 4c, Stage 6 |
| 2026-09-19 | aidream | Cut-off agents should commit on the shared checkout once main is in | They park on their own local branch. Recovery intakes it. They may start fresh from GitHub `main` in a new worktree | Stage 4c, owner-park.md |
| 2026-09-19 | aidream | Cluster dirty files, then search chats for those paths | Worked. 2,619 porcelain paths were mostly `.wt/release2-ui`. 212 product files remained. Certain owners: live Claude default-org chat (do not message), disconnected Codex vault-task trio, idle Cursor disk-groom. Identical-second mtime on ~138 generated files is codegen, not an author | owner-park.md step 0 |
| 2026-09-19 | aidream | After leftovers land, keep the shared folder stale and keep agents parked | Arman ordered Stage 6: remote `main` is the line in this disaster. Park unique dirty as named files, reset `--hard origin/main`, do not replay yet | Stage 6 |
| 2026-09-19 | aidream | Replay parked leftovers onto the new shared main | Run `db/generate.py` first. Live schema is the contract. 13 parked manager files were identical to the new generate | Stage 6 generate-first |
| 2026-09-19 | aidream | Generate is undeniable truth for every db file it touches | It wiped hand paging/metrics on `library_item.py`. Keep those methods; generate wins only on schema-shaped output | Stage 6 |
| 2026-09-19 | aidream | Message every owner from the recovery session | No send door. What worked: one Codex, one Claude Code, one Cursor, each given the full owner-map report and told to fan the cleanup prompt to other chats on that provider | Stage 4c-2, owner-park.md |
| 2026-09-19 | aidream | After shared main is current, keep them on side branches | Prompt B: commit on this tip, resolve your own conflicts, get non-destructive work onto `main` | owner-park.md Prompt B |
| 2026-09-19 | aidream | After agents have committed, leftover dirty still needs a hunt | Fresh dirty with no real conflict is committed blindly (30-minute rule back). Real conflicts come to Arman now | Stage 6 tail |
| 2026-09-19 | aidream | Keep a ten-item pending list until everything is reviewed | Most were older GitHub-newer copies, unwind trees, or non-product. After junk-vs-unknown, five real leftovers remained | Stage 7 |
| 2026-09-19 | aidream | The five audit leftovers have no owners | Certain: coding-tool door = Claude `1e13b704` (CX explorer). Kind-marker + masterwork `__kind` = Claude `94401698`. Vault fork tests = Codex Vault Task 3. Dashboard tables = Codex `01a091ac` / Hypatia (pages certain, tests likely) | Stage 4c hunt |
| 2026-09-19 | aidream | One mixed leftover table across Claude and Codex | Unusable paste. One table per provider. Parent chat title+id if the writer is a subagent. Last active is a real timestamp | Stage 4c report |
| 2026-09-19 | aidream | Prompt B is enough once main is current | After leftovers have owners and a path, Prompt C: go there, delete or land the best product, delete leftover branches/worktrees. No in-between | owner-park.md Prompt C |
| 2026-09-19 | aidream | release.sh may halt on a stale proof while we wait | Illegal. Get past it, keep merging, fix the class. Only failed build or failed health may stop a release. Tonight: D249 kernel fingerprint after a later campaign never re-proved | Stage 7 tail |
| 2026-09-19 | aidream | Five leftovers might stay ownerless | Same finder, second pass with parent title + last-active, one table per platform. All five found. Prompt C (his words) is what he pasted | owner-park.md hunt |
| 2026-09-19 | aidream | First release out means the recovery is over | Stage 8 is the point: pull main first, fix fast, fan out, commit with live team updates, release again. Repeat. Do not wait for a subagent roster | Stage 8 |
| 2026-09-19 | aidream + frontend | Type errors after a release are a separate project | They are a Stage 8 fan-out. Use the frontend `type-safety` skill. One file per small agent, no agent-side tsc, ≤6 at a time. Tonight: 29 frontend errors / 15 files; shared packages clean except two install misses | Stage 8 type-error army |
| 2026-09-19 | frontend | `pnpm db-types` is the fix for three missing RPCs | The three names already existed on `origin/main`. Full regen on a tip 284 behind origin turned 3 errors into 134. Splicing the three function entries from origin/live gen brought `pnpm type-check` to 0 | Stage 8 + type-safety "when type errors appear" |
| 2026-09-19 | frontend | Type-fix agents can report and leave the diff uncommitted | Uncommitted type fixes miss the next build. Each agent commits exclusive files locally as it finishes; the orchestrator commits type syncs the same turn | Stage 8 type-error army + type-safety batch |
| 2026-09-20 | matrx-extend | Second-repo run would be another Size 2 disaster | Shared folder already *was* GitHub `main` (0/0, one worktree, no PRs, no stashes). Two leftover branches: one already landed later and tighter (B), one rejected private-transport prototype GitHub had already sealed (J). Size 2 stood down after Stage 1 | Stage 0 stand-down after Stage 1 |
| 2026-09-20 | matrx-extend | `HEAD == origin/main` means leftover branches are empty | Cherry still found unique commits on both leftover branches. Do not stand down at the Stage 0 count | Stage 1a leftover-branch cherry |
| 2026-09-20 | matrx-extend | Skill file on GitHub means the skill landed | `SKILL.md` was committed; `evals.md` / `field-log.md` / `owner-park.md` were left untracked. Sync writes the whole directory; the follow-up commit missed the companions | Stage 1b sync-commit miss |
| 2026-09-20 | matrx-local | 33 ahead meant 33 unique local commits | Cherry: 2 unique, 31 already on GitHub. One of the two was the same-message org commit GitHub landed 29 seconds later, then extended with two fixes. Cherry `+` was J, not newer product | Stage 1a |
| 2026-09-20 | matrx-local | Dirty `tauri.conf.json` was uncommitted new work | It rewound the app version from GitHub's 1.4.179 to 1.4.168 | Stage 1b |
| 2026-09-20 | matrx-local | `git cherry HEAD origin/main` would finish the other half of the split | It hung past two minutes on the 82-behind side. The unique-local direction finished in seconds | Stage 0 |
| 2026-09-20 | sibling census | A folder named builder-blind-trial looked like a new Size 2 pile | It is a worktree of the frontend repo already assigned; common-dir pointed at that repo | Stage 1d / Stage 5 |
| 2026-09-20 | common-docs | Two mains same SHA and leftover worktrees already on GitHub meant stand down | Unique untracked files still existed. `log.md` and Integration Maintainer already named Unmerged work intake; the file was never on GitHub | Stage 0 / 1b |
| 2026-09-20 | common-docs | Stash board rows already on GitHub, so drop the stash | Two disaster-recovery log lines in that stash were still unique | Stage 2 mixed stash |
| 2026-09-20 | common-docs | Dirty skill files were this recovery's notes to commit | They were matrx-local's rewrite and would have unwound the extend stand-down already on GitHub | Bucket J, two-recovery skill |
| 2026-09-20 | common-docs | Stage 6 reset was ordered, so reset now | Five new screenshots and a recapture set had appeared. Re-diff first | Stage 6 |
| 2026-09-20 | common-docs | A walker committed three files on stale shared main | Extracted through intake. Did not reset him | Stage 4b |
| 2026-09-20 | matrx-frontend | A worktree on `origin/main` is a Stage 2 delete | One of them was the live intake landing leftovers that hour | Stage 2 hold live intake |
| 2026-09-20 | matrx-frontend | Git refused A deletes because the trees were dirty | Porcelain was thousands of ` D` missing files (hollow leftover), not unique product. `--force` then hung on every one. Skip; bucket G; keep going | Stage 2 hollow + hung |
| 2026-09-20 | matrx-frontend | Hold the two big PRs until the family is inspected | They had no named two-writer conflict. Overnight another intake merged both. Holding without an exact conflict is just delay | Stage 4 — name the conflict or land |
| 2026-09-20 | matrx-frontend | Dirty files look inconsequential so commit the working tree | 169 paths already exist on GitHub with different content. Several dirty blobs were exact earlier GitHub commits; local deletes would drop campaign SQL GitHub still has. Unique product extracted through intake. Dumping dirty unwinds main | Stage 1b exist_differs ≠ unique |
| 2026-09-20 | matrx-frontend | Leftover-branch cherry+ is the namesake feature still unmerged | The + commits were stale W7-OFF and playground ancestors. GitHub already has later hashes. Merging the leftover commit would delete ~200k lines | Stage 1a cherry+ can be a stale ancestor |
