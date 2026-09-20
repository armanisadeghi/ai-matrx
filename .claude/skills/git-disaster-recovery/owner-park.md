---
type: Reference
title: "git-disaster-recovery — owner research and recall"
description: "Required owner-map research, then one-agent-per-provider fan-out. Start as soon as Stage 1 names the hard leftovers. Do not wait for Stage 4c."
tags: [operations, git, recovery]
timestamp: 2026-09-20T00:00:00Z
---

# Owner research and recall — start after Stage 1

Read this as soon as Stage 1 names the hard leftovers (dirty clusters,
stacked worktrees, large PRs, leftover Codex/Claude branches). Do not wait
for Stage 4c. The skill file has the law. This file has the hunt, the
report, and the three messages.

The first field test listed this as Stage 4c, after landing. Arman caught
that on the second repo: by then the hard leftovers already needed owners
and Prompt A. Start the hunt early. Fan-out still waits for a checked map.
Prompt A until Stage 6.

## The research is the critical step

Do not skip this to start messaging, pulling, or replaying leftovers. The
aidream recovery's most useful move was the cluster-and-hunt: 2,619 porcelain
paths collapsed to 212 product files, and the biggest real batches got owners
in one pass. Without that map, every later message is a guess. On the
matrx-frontend second test, starting the same hunt during Stage 4 found the
Codex leftovers (battle, server-search, storage-picker, vault-task3) while
clean leftovers were still landing.

A subagent may run the hunt. The recovery owner still checks the map before
anyone is messaged.

## Build the owner map

Do not message anyone until each dirty path, hung worktree, or unique leftover
has a best-guess owner or is marked unclaimed.

Search in this order. Stop on the first confident hit.

0. **Cluster first, then hunt the chat.** Drop `.wt/` and lockfiles from the
   count first — one leftover worktree can add thousands of fake dirty paths.
   Then group what remains by directory and mtime. Skip a bulk stamp where
   dozens of generated files share the same second; that is codegen, not an
   author. Take the biggest feature-looking clusters and search transcripts
   for a few distinctive paths.
1. **Worktree path and branch name.** `.wt/<slug>`, `Documents/Codex/...`,
   vault/native/storage names. The slug is often the conversation.
2. **Open PRs and leftover remotes.** Author and head ref.
3. **Task ledgers.** `.matrx/AGENT_TASKS.md`, review-queue rows, handoffs that
   name the path.
4. **Transcripts, last 48 hours, especially error or stopped.**
   - Cursor: `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
   - Claude Code: `~/.claude/projects/<cwd-with-slashes-as-dashes>/*.jsonl`
   - Codex: that provider's session list
   - AI Matrx: `conversations` search on the path or leftover name
   Prefer sessions that are idle or errored. Skip a session that is still
   writing this checkout right now — that is the recovery owner or a live
   helper, not a leftover owner. Skip a still-live cluster author unless
   they are the one fan-out agent you chose.
5. **Path mention in those transcripts.** Grep the dirty file path or the
   leftover feature name.
6. **File mtime.** A cluster of files touched in the same minute often belongs
   to one session. Use it to group, not as the only proof.
7. **`git blame` only for already-committed leftovers.** It cannot name a
   dirty-file owner.

Research notes can stay as a dump. The thing you hand Arman, or paste into
one fan-out chat per provider, is **one markdown table per coding platform**.
A mixed Claude/Codex/Cursor table is unusable — he cannot copy it into a
chat.

Write these three headings even when a platform has no leftovers:

1. Claude Code
2. Codex
3. Cursor

Empty platform: heading, then `None.`

Columns (short — this is a paste, not a research dump):

| Leftover | Chat to message | Session id | Parent chat (if subagent) | Last active | State | Confidence |

- **Chat to message** is the title of the session the fan-out agent opens.
  If the writer was a subagent, this is the **parent** chat — that is who
  gets the prompt.
- **Parent chat** is required when the writer was a worker or subagent:
  parent title + parent session id. Leave blank only when the owner session
  is itself the parent.
- **Last active** is the last message timestamp on the chat you are asking
  them to message (the parent, if there is one). Date and time, not
  "recent."
- Paths, worker ids, and why go under the table, not in it.

Two owners for one file is a real conflict. Hold that file. Do not let both
"clean" it.

## How to get their attention

You will rarely have a send door into every chat. What worked: **one live
agent per provider** — one Codex, one Claude Code, one Cursor.

Give that agent **only this platform's table**, plus the prompt. Do not paste
Claude leftovers into Codex, or the reverse. They cannot message outsiders.
Then tell them: you are in {Codex / Claude Code / Cursor}, so message the
other chats **on that same provider**. They fan out. You do not.

Skip still-live authors of a cluster unless that author is the fan-out agent.
Skip a platform whose table is `None.` Cursor has no peer-task send from this
recovery session: Arman pastes into one Cursor chat, or you hand him that
table plus the prompt. Same if you cannot reach Codex or Claude Code — one
paste target per provider that has candidates.

No follow-up. No "did you get this?"

## What you are actually asking

You are talking to **one agent manager per provider**. They message the
leftover owners on that platform. Nobody was interrupted.

**Prompt A — do this, not that**

| Do | Do not |
|---|---|
| Create a new named local branch (not `main`) and **commit only your files** onto it | Commit on the shared checkout or on `main` |
| Keep work that is already on your own worktree, leftover branch, or open PR, and name it | Copy that work onto the shared folder |
| Reply with four facts: what you own, the branch/worktree/PR name, whether GitHub already has it, what is still only local | Write a vision essay, a status novel, or a repair plan |
| Stop and say so if two people own the same file | Resolve merge conflicts |
| Skip anyone still writing | Pull, reset, rebase, merge, or push to `main` |

The commit is how unknown dirty files become findable. Conflict resolution
is ours, later, through intake — or theirs in Prompt B after Stage 6.

**Prompt B** (only after the shared folder matches GitHub `main`): commit on
this tip or a short branch from it. Resolve conflicts on **your** files.
Get non-destructive work onto `main`. Still no reset. Still no old tree
pasted onto this one.

## Which prompt

**Prompt A — shared folder is still the stale mash.** Use this before Stage 6
finishes. They **commit their files onto a new named local branch**, or they
name the leftover branch / worktree / PR that already holds the work. They
do not commit, pull, reset, or merge on the shared checkout. They do not
resolve conflicts.

**Prompt B — shared folder is current GitHub `main`.** Use this only after
Stage 6 plus generate are on `origin/main` and this folder is a clean match
of that tip. They commit on this tip (or a short branch from it), resolve
their own conflicts, and get non-destructive work onto `main`.

**Prompt C — leftovers are named and sitting somewhere.** Use this only
after Prompt A has isolated the work **off** the shared folder, or after
Stage 6. The leftover must have a path (audit dir, worktree, parked
branch). Never send C while the shared checkout is still the stale mash —
that tells owners to reconcile onto the dirty folder. They go to that
place. They either delete the work completely, or resolve it with current
`main`, keep only the best final product, commit that, and delete every
leftover branch and worktree. **Deleted or committed. No in between.**
They may take a little time to make it the best product, as long as they
work fast.

Aidream 2026-09-19 used a first-night Prompt A, then Prompt B once the
shared folder matched GitHub, then Prompt C once the five leftovers had
owners and paths. He pasted Prompt C with one table per platform. That
found every leftover owner. Cursor had none, so nothing was pasted there.
The first-night A/B text claimed a cutoff. Arman rejected that on the
second repo. Use the texts below.

## What the first hunt proved (aidream 2026-09-19)

Cluster dirty files, drop `.wt/` noise, search transcripts for distinctive
paths. Same finder ran twice: first for titles, then again for **parent
chat name** and **last-active time**. The paste that worked is one table
per platform, not one mixed list.

All five leftovers in `/tmp/aidream-leftover-audit-20260919` got owners:

| Platform | Leftovers | Chat to message |
|---|---|---|
| Claude Code | coding-tool door; kind-marker TS/SQL; masterwork `__kind` | CX Explorer (`1e13b704`); Annihilate all `__kind` strippers (`94401698`, parent of worker `a97f`) |
| Codex | dashboard table conversion; vault fork tests | Shared table rollout (`01a091ac`, parent of Hypatia); Complete Vault Task 3 (`01a0b881`, parent of Kuhn/Harvey) |
| Cursor | none | — |

Prompt C is his later words for the delete-or-land pass. Keep that block.
Do not copy the retired cutoff sentence into A or B.

## Prompt A — isolate unique work (shared folder is stale)

Paste **only this platform's table**, then:

```
You are in {Claude Code / Codex / Cursor}. Message only the chats in this
table. They are on your platform. Ignore every other leftover. Skip anyone
still actively writing.

Do not tell them they were interrupted. They were not.

Send each of them exactly this:

Do these three things. Nothing else.

1. If your unique work exists only as dirty files in the shared checkout:
   create a new local branch that is not named main, commit only your files
   to that branch, and stop. Do not commit on main. Do not commit other
   people's files.

2. If your work is already on a named leftover branch, your own worktree,
   or an open PR: leave it there. Do not copy it onto the shared folder.
   Do not open a second copy.

3. Reply with four lines:
   - what you own
   - the exact branch, worktree, or PR name
   - whether GitHub main already has it
   - what is still only local

Do not pull. Do not reset. Do not rebase. Do not merge. Do not push to
main. Do not resolve conflicts. Do not "fix" the shared folder. If two
people own the same file, stop and say so.
```

## Prompt B — land on current main

Use only after Stage 6. Paste **only this platform's table**, then:

```
You are in {Claude Code / Codex / Cursor}. Message only the chats in this
table. They are on your platform. Ignore every other leftover.

Do not tell them their work was interrupted or cut off. It was not.
Skip anyone still actively writing.

Send each of them exactly this:

The shared checkout now matches GitHub main. Do these things. Nothing else.

1. If you have unique work, commit it on this tip or on a short branch
   created from this tip. Commit only your files.

2. Resolve conflicts only on your files. If two people own the same file,
   stop and say so.

3. If the work is not destructive, get it onto main. If you already parked
   on a leftover branch or worktree, rebase that onto this tip first, then
   land it or say why it must stay off main.

4. Reply with three lines: what you landed, what you held, and where any
   leftover still sits.

Do not reset. Do not paste an old tree onto this one. Do not re-land
generated or schema files that are already on main.
```

## Prompt C — delete or land, no leftover left

Paste **only this platform's table**. Tell the manager they are on this
platform only. Do not add a cutoff story. Then his words:

```
Here are the updated ones:

{THIS PLATFORM TABLE ONLY}

Ignore everything other than THIS CODING platform, since you cannot message
outsiders. This time, your instructions are slightly different... now, we
need them to go into these worktrees or wherever we've stuck their work and
they need to either delete the work completely or figure out how to resolve
everything with main and ensure they get it all properly set up and ensure
their code or final product is truly the best final product and commit only
that and delete any remaining branch or worktree. The work must be either
deleted or committed... no in between, but they can take a little bit of
time to work on it as long as they work fast.
```

Also say, in that same send:

- Message the parent chat, not the worker
- Do not reset the shared checkout
- Do not paste an old tree onto this one
- Two owners on one file: hold it and say so
- "Best final product" means the leftover wins only when it is newer or
  uniquely better. GitHub-newer copies and unwind trees are delete

## After they answer

Inventory new commits and local branches the same hour. Bucket M. Intake or
leave on `main` as the rules say.

After Prompt C, every named leftover must be on `main` or gone. A leftover
that is still sitting in `/tmp`, a worktree, or a side branch is unfinished.
If this session cannot send to that provider, the recovery owner finishes
Prompt C locally using the already-written keep-GitHub or land decision.
Waiting for a paste is unfinished.

Unclaimed dirty: group files that look like the same work into one named
commit or branch, then keep hunting the owner. Do not leave them as anonymous
dirt.

After Prompt B or C has had time to land, leftover **fresh** dirty with no
real conflict is committed blindly — that is the ordinary 30-minute rule
returning. Real conflicts come to Arman immediately, one at a time, with one
recommendation.
