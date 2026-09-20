---
type: Reference
title: "git-disaster-recovery — owners and the three messages"
description: "How to find who owns the few hard leftovers left after the easy pile is landed, and the three short messages to send them. Read at step 4 of the skill, not before."
tags: [operations, git, recovery]
timestamp: 2026-09-20T00:00:00Z
---

# Owners and the three messages

Read this at step 4, after the dirty set is shrunk and the clean leftovers
are landed. The owner hunt is for what is still hard: a unique product hunk
that fights GitHub, a held migration, or leftover work only its author can
finish. It is not a reason to delay landing anything easy. Past recoveries
spent hours on owner tables while skills and docs sat dirty. Do not.

## Find the owner

A subagent may run this. Search in order and stop at the first confident hit:

1. **Cluster first.** Group the remaining paths by directory and by modified
   time. Files touched in the same minute usually share an author. Dozens of
   generated files sharing one second are codegen, not an author.
2. **Worktree path, branch name, PR head.** The slug is usually the
   conversation.
3. **Task ledgers and handoffs** that name the path.
4. **Transcripts from the last 48 hours**, idle or errored sessions first:
   - Claude Code: `~/.claude/projects/<cwd-with-slashes-as-dashes>/*.jsonl`
   - Cursor: `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
   - Codex: that provider's session list
   - AI Matrx: the `conversations` search
   Grep the path or the feature name. Skip any session still writing this
   checkout right now: that is a live helper, not a leftover owner. If the
   writer was a subagent, the owner is its parent chat.
5. **`git blame`** only for committed leftovers. It cannot name a dirty-file owner.

## What you hand Arman

One line per item, grouped by platform (Claude Code, Codex, Cursor), so he
can paste it straight into that chat:

```
Cursor
- "Canvas avatar menu vs top-right overlay": your header work is on branch
  park/cursor-shell-header. Finish it there, commit only your files, tell me when it is ready for main.

Codex
- None.
```

Exact conversation title. One sentence of what they must do. Nothing else:
no session ids in the paste, no research, no confidence column. Put the
evidence under the list if you must, never in it.

If this session has a real door into that chat, send the line yourself and
say you did. Otherwise the list is the deliverable. Do not wait for a reply.
No follow-up.

## The three messages

Each is four plain lines. Pick the one that matches where the shared folder is.

**A. The shared folder is still dirty. Isolate your work.**

```
Create a new local branch (not main) and commit only your files to it.
If your work already sits on a branch, worktree, or PR, leave it there and name it.
Do not pull, reset, merge, or resolve conflicts. Do not touch the shared folder.
Reply: what you own, the branch or PR name, and whether GitHub main already has it.
```

**B. The shared folder matches GitHub main. Land your work.**

```
The shared folder now matches GitHub main.
Commit your files on this tip or a short branch from it, and resolve conflicts only in your files.
If it is not destructive, get it onto main. Do not reset. Do not paste an old tree onto this one.
Reply: what you landed, what you held, and where anything left still sits.
```

**C. Your leftover has a named place. Finish it or delete it.**

```
Your work is at <branch / worktree / path>.
Either delete it completely, or resolve it against current main, keep only the best final product, and commit that.
Then delete every leftover branch and worktree. Deleted or committed, nothing in between. Work fast.
If GitHub already has a newer version, GitHub wins: delete yours.
```

Never send C while the shared folder is still the dirty mash. It tells
people to reconcile onto a stale tree. Never add a "you were interrupted"
story to any of them.

## After they answer

New branches and commits from owners are inventoried the same hour and land
through intake like any clean leftover. Two owners on one file is a real
conflict: hold it, one line to Arman with a recommendation. Unclaimed unique
product goes onto one named branch with a descriptive name and keeps its
owner line open. Never leave it as anonymous dirt.
