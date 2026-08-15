---
name: handoffs
description: The handoff-document system for docs/handoffs/*.md — how to write one, take one over, groom it every turn, and delete it. Use whenever you (1) end a large task with work remaining and need to hand off, (2) are told to continue / take over / pick up work from a handoff doc, (3) finish ANY task covered by an existing handoff (grooming it before the turn ends is mandatory), or (4) touch any file under docs/handoffs/. Triggers on "write a handoff", "handoff doc", "pick up where X left off", "continue the X work", docs/handoffs/**. Cross-repo — matrx-frontend and aidream share ONE system; a piece of work gets ONE handoff in the repo that owns most of it.
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/handoffs/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Handoffs — forward-looking work orders, not history

A handoff exists so a fresh agent can start producing in minutes: a work order + resource map, grounded in Arman's vision. It is **not** a record of what you did — git and `FEATURE.md` hold history. **A handoff with no remaining work gets deleted, not archived.**

## Where they live

- `docs/handoffs/<topic>.md` (kebab-case), in whichever repo owns most of the **remaining** work (matrx-frontend or aidream). Unowned ones are listed in the cross-repo orphan list — see The orphan list.
- Cross-repo work gets **ONE doc** — never twins. Frontmatter `repos:` lists every repo involved; cross-repo file references use absolute paths.
- **This doctrine is cross-repo and canonical in `common-docs/skills/handoffs/SKILL.md`.** Every repo carries a real synced copy (see the banner at the top of this file) so it works in a one-repo sandbox. Edit the canonical, run `python3 common-docs/meta/scripts/sync_skills.py`, commit each repo — never edit a copy.
- **The orphan register is NOT a handoff and does not live in a repo** — `common-docs/operations/unassigned-handoffs.md`. See The orphan list below.

## Format

```markdown
---
status: active            # active | blocked (blocked = waiting ONLY on Arman's answers)
updated: 2026-07-07
repos: [matrx-frontend]   # every repo the remaining work touches
vision: [docs/.../VISION-x.md]   # Arman's own docs/plans — the ground truth
---
```

Sections, in this order (omit empty ones):

1. **Vision — Arman's words.** The most important section. Verbatim quotes of what he said he wants + links to his vision docs/plans. Mark anything you inferred with `(inferred)`. **Never paraphrase Arman into agent-speak — the distilled agent version is exactly what drifts.**
2. **Resources.** Everything that spares the next agent a discovery pass: key files, the `FEATURE.md`, skills to invoke, RPCs/tables, test routes + how to log in, demo pages. Pointers, not explanations.
3. **Remaining work.** Each item independently actionable: what, where (file paths), known traps. Ordered by priority — no priorities disguised as prose.
4. **Done.** One bullet per completed area, ≤1 line, pointing at the code: `- RAG pipeline built — see services/rag/`. Nothing else.
5. **Decisions needed.** Escalation format below.

**Banned everywhere:** chronology, session narratives, subagent/effort counts, "we then…", self-praise, restating `FEATURE.md` content (point to it instead).

## The orphan list — `/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md`

One table, one meaning: **every row is a handoff with no owner.** It is how Arman decides what to
staff next, so it stays short and true.

- **Taking a handoff over → DELETE its row first**, before reading the doc or touching code
  (step 1 below). Assigned ≠ orphaned.
- **Writing a new handoff, or grooming one that still has remaining work and nobody continuing
  it → ADD its row in the same commit.** A new handoff IS an orphan the moment it exists.
- **No statuses, no notes, no history in that file** — a row's existence is the status; anything
  that needs explaining belongs inside the handoff. Rows leave only two ways: someone took the
  work, or the handoff itself was deleted as finished.

## Taking one over

0. **Delete your row from the orphan list** (`/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md`, committed in the common-docs repo) — first action of the turn. You are the owner now.
1. **Vision first.** Read every `vision:` link before touching code. Arman's docs outrank the handoff's summary of them.
2. **Trust nothing dated.** The codebase moves daily. Fan out small parallel Explore subagents to verify each load-bearing claim — files exist? RPC live? still wired? **A comment in code is not a fact**; agents write wrong comments. Verify behavior and artifacts, not prose.
3. Plan, then execute in a loop — build, adversarially verify, fix — until done or blocked on a genuine Arman-decision (one with no best-practice answer). The handoff already authorizes the work; don't stop to ask permission for it.
4. Groom before the turn ends (below).

## Groom before ending EVERY turn — non-negotiable

Any turn that progressed work covered by a handoff ends with a rewrite of that handoff:

- **A completed task's entire description collapses to one Done bullet.** 8,000 words of pipeline spec, 4 hours, 15 subagents → `- RAG pipeline built — see services/rag/`. Readers who need detail read the code.
- **Rewrite, never append.** No "Update 2026-07-07:" blocks. The doc is always the current state, one voice.
- **The doc shrinks as work completes.** Target ≤150 lines. If it grew after progress, you appended instead of grooming.
- **Everything done → delete the file** (git keeps history) + one dated line in the affected `FEATURE.md` Change Log + **remove its row from the orphan list**. Deleting is the success state — do not ask permission.
- **Work remains and nobody is continuing it → its row goes in the orphan list** (add it if absent; if you took it over this turn you deleted the row at step 0, so put it back). Handing work back is what makes it an orphan again.
- Refresh `updated:` and `status:`.

## Escalating decisions to Arman

Arman juggles 15 projects; a question must be answerable cold:

- **Never** reference doc-internal numbering ("as noted in 3b…") or shorthand he'd have to look up.
- Per question: **Situation** (2–3 plain sentences of fact) → **Decide** (the concrete choice, with options). Fully self-contained.
- Only questions with no best-practice answer. Where a best practice exists, apply it and record the choice as a Done bullet.

## Rot control

`/handoff-cleanup` (its own skill) periodically sweeps both repos' handoff dirs, verifies claims against reality, deletes done docs, and escalates unclear drift. It is the backstop — per-turn grooming is still your job.
