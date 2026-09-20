---
type: Reference
title: "git-disaster-recovery — owner research and recall"
description: "Required owner-map research, then one-agent-per-provider fan-out. Read for Stage 4c."
tags: [operations, git, recovery]
timestamp: 2026-09-19T00:00:00Z
---

# Owner research and recall — Stage 4c

Read this when you are running Stage 4c. The skill file has the law. This file
has the hunt, the report, and the three messages.

## The research is the critical step

Do not skip this to start messaging, pulling, or replaying leftovers. The
aidream recovery's most useful move was the cluster-and-hunt: 2,619 porcelain
paths collapsed to 212 product files, and the biggest real batches got owners
in one pass. Without that map, every later message is a guess.

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
   Prefer sessions that are idle, errored, or explicitly cut off. Skip a
   session that is still writing this checkout right now — that is the
   recovery owner or a live helper, not a cut-off owner. Skip a still-live
   cluster author unless they are the one fan-out agent you chose.
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

## Which prompt

**Prompt A — shared folder is still the stale mash.** Use this before Stage 6
finishes. They park on their own local branch. They do not commit, pull, or
reset the shared checkout.

**Prompt B — shared folder is current GitHub `main`.** Use this only after
Stage 6 plus generate are on `origin/main` and this folder is a clean match
of that tip. They commit on this tip (or a short branch from it), resolve
their own conflicts, and get non-destructive work onto `main`.

**Prompt C — leftovers are named and sitting somewhere.** Use this once the
owner table exists and the leftover has a path (audit dir, worktree, parked
branch). They go to that place. They either delete the work completely, or
resolve it with current `main`, keep only the best final product, commit
that, and delete every leftover branch and worktree. **Deleted or committed.
No in between.** They may take a little time to make it the best product,
as long as they work fast.

Aidream 2026-09-19 used Prompt A first, then Prompt B once the shared folder
matched GitHub, then Prompt C once the five leftovers had owners and paths.
He pasted Prompt C with one table per platform. That found every leftover
owner. Cursor had none, so nothing was pasted there.

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

Prompt C is his words. Keep them. After that hunt, the work is Stage 8 —
not another inventory.

## Prompt A — park only

```
We had some disruptions so your work got cut off and we're trying to clean up
a big mess on git. For now, If you have any work in flight, I need you to
quickly commit it to a local branch for easy management and if you have some
things that are completely broken and need a little work, go ahead and do what
you need to make sure it's in a good place. If you see any major issues, stop
and tell me. But for now, just a quick cleanup and a local branch commit to
reduce unknown dirty files and make sure you don't have anything that is
completely broken.

Then, give me a full update on where you're at with everything and ensure you
clarify where we stand, what's done, what you still need to do to get to the
vision. Provide a clear list of what still needs to be done in an organized
and concise way.
```

Add at the top: this shared folder is not current GitHub `main`. Do not
commit, pull, or reset it. Park on your own local branch or worktree only.

## Prompt B — commit on current main

Wrap the owner-map report, then:

```
You are in {CODEX / CLAUDE CODE / CURSOR} so message any chat in {that
provider} with this:

We had some disruptions so your work got cut off and we're trying to clean up
a big mess on git. For now, If you have any work in flight, I need you to
quickly commit it to a local branch for easy management and if you have some
things that are completely broken and need a little work, go ahead and do what
you need to make sure it's in a good place. If you see any major issues, stop
and tell me. But for now, just a quick cleanup and a commit to reduce unknown
dirty files and make sure you don't have anything that is completely broken.

Then, give me a full update on where you're at with everything and ensure you
clarify where we stand, what's done, what you still need to do to get to the
vision. Provide a clear list of what still needs to be done in an organized
and concise way.

We have now pulled origin main and local is in good shape. Commit all of your
work now and resolve your own conflicts for your own files and any related
files so we can get this code pushed. if your work is non-destructive, commit
it now. If you created a branch or worktree before, now we need it on main
unless its truly destructive.
```

Also say, in that same send:

- Do not reset this checkout
- Do not re-land parked generate / schema files that are already on `main`
- If they are still in an old worktree, rebase that work onto this tip first
- Do not paste an old tree onto this one
- Two owners on one file: hold it and say so
- Their "what's left to the vision" list is for Arman, not a resume order

## Prompt C — delete or land, no leftover left

Paste **only this platform's table**, then his words:

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

Unclaimed dirty: group files that look like the same work into one named
commit or branch, then keep hunting the owner. Do not leave them as anonymous
dirt.

After Prompt B or C has had time to land, leftover **fresh** dirty with no
real conflict is committed blindly — that is the ordinary 30-minute rule
returning. Real conflicts come to Arman immediately, one at a time, with one
recommendation.
