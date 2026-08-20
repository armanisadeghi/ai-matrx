---
name: handoffs
type: Skill
title: handoffs — the work-order system
description: The handoff-document system for docs/handoffs/*.md — how to write one, take one over, groom it every turn, and delete it. Use whenever you (1) end a large task with work remaining and need to hand off, (2) are told to continue / take over / pick up work from a handoff doc, (3) finish ANY task covered by an existing handoff (grooming it before the turn ends is mandatory), or (4) touch any file under docs/handoffs/. Triggers on "write a handoff", "handoff doc", "pick up where X left off", "continue the X work", docs/handoffs/**. Cross-repo — matrx-frontend and aidream share ONE system; a piece of work gets ONE handoff in the repo that owns most of it.
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/handoffs/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Handoffs — forward-looking work orders, not history

A handoff exists so a fresh agent can start producing in minutes: a work order + resource map, grounded in Arman's vision. It is **not** a record of what you did — git and `FEATURE.md` hold history. **A handoff with no remaining work gets deleted, not archived.**

## The identity block — required, first, every handoff

The first lines after the title, before remaining work, before Done, before anything else:

```markdown
**What this is:** one sentence. The job in human words.
**Scope:** Feature | Program | Tail
**Feature:** the owning feature name (always — a Program and a Tail name their owner)
**Vision:** link to Arman's words, or `VISION MISSING`
```

- **What this is** is the key. A reader who does not already know the feature must understand it from that sentence. A checklist with no identity is a defect (Voice Communication Layer, 2026-08-19).
- **VISION MISSING** is loud and legal. Do not paraphrase Arman into a vision. Do not invent one from an interview summary. An inferred paragraph is not a vision. If he has not written it, say so at the top and in the orphan-list Notes. The work may still be listed; it may not pretend to have his words.
- Frontmatter `vision:` holds the links. Empty `vision: []` means VISION MISSING. Frontmatter `scope:` is `feature` | `program` | `tail`. Frontmatter `feature:` is the owning feature name.

## Where they live (re-ruled by Arman, 2026-08-20)

- **Cross-repo work** (the remaining work touches 2+ repos): `HANDOFF.md` in the owning
  registry node's home in common-docs (per `policies/feature-registry.md` — the node doc kit).
  ONE doc — never twins. Frontmatter `repos:` lists every repo involved; cross-repo file
  references use absolute paths.
- **Single-repo work**: `docs/handoffs/<topic>.md` (kebab-case) in the owning repo.
- Handoffs written under the old rule sit wherever they sit until the doc-migration board
  (common-docs `operations/doc-migration.md`) rehomes them — follow the register's links, and
  rehome-on-touch when you groom one.
- Unowned handoffs are listed in the cross-repo orphan list — see The orphan list.
- **This doctrine is cross-repo and canonical in `common-docs/skills/handoffs/SKILL.md`.** Every repo carries a real synced copy (see the banner at the top of this file) so it works in a one-repo sandbox. Edit the canonical, run `python3 common-docs/meta/scripts/sync_skills.py`, commit each repo — never edit a copy.
- **The orphan register is NOT a handoff and does not live in a repo** — `common-docs/operations/unassigned-handoffs.md`. See The orphan list below.

## Format

```markdown
---
status: active            # active | blocked (blocked = waiting ONLY on Arman's answers)
updated: 2026-07-07
repos: [matrx-frontend]   # every repo the remaining work touches
scope: feature            # feature | program | tail
feature: Workflows        # owning feature name, even on a Program or Tail
vision: [docs/.../VISION-x.md]   # Arman's own docs — empty [] means VISION MISSING
---
```

Sections, in this order (omit empty ones):

1. **Identity block** (above). Required. Then **Vision — Arman's words** when they exist: verbatim quotes + links. Mark anything you inferred with `(inferred)`. **Never paraphrase Arman into agent-speak — the distilled agent version is exactly what drifts.** If the words do not exist, the identity block already said VISION MISSING; do not write a substitute paragraph.
2. **Resources.** Everything that spares the next agent a discovery pass: key files, the `FEATURE.md`, skills to invoke, RPCs/tables, test routes + how to log in, demo pages. Pointers, not explanations.
3. **Remaining work.** Each item independently actionable: what, where (file paths), known traps. Ordered by priority — no priorities disguised as prose.
4. **Done.** One bullet per completed area, ≤1 line, pointing at the code: `- RAG pipeline built — see services/rag/`. Nothing else.
5. **Decisions needed.** Escalation format below.

## The tail law — almost-done work does not occupy a Feature row

When a feature is shipped except a leftover that **one focused session** can finish (plus any blocking ruling):

1. **Collapse the handoff.** Delete the novel. Keep only the identity block, the leftover items, and any Decision. Done work already lives in `FEATURE.md` — point at it, do not restate it. (Configuration Equivalence, 2026-08-19: 58 lines of shipped history sitting on the staffing list.)
2. **Set `scope: tail`.** The owning `feature:` stays.
3. **Move the orphan-list row** from Features (or Programs) to **Tails**. A Tail is a knock-off: Arman can see it is almost done and staff it as a short job. It is not "staff the entire feature."
4. If the leftover is a single task on a feature that already has a master handoff, attach it there instead and delete this file — same rule as any other task.

A Feature row that is 90% Done is a defect in the register. Grooming that does not collapse a tail has failed.

**Banned everywhere:** chronology, session narratives, subagent/effort counts, "we then…", self-praise, restating `FEATURE.md` content (point to it instead).

## The orphan list — `/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md`

Three tables, one meaning: **every row is a handoff with no owner.** It is how Arman decides what to
staff next, so it stays short and true. The tables are about **developer scope**, not directories:

- **Feature** — the developer owns the entire feature.
- **Program** — the developer owns a limited scope (one part of a feature, or work that spans
  several). Not a `projects/` folder.
- **Tail** — the feature (or program) is shipped except a leftover one focused session can finish.
  Knock-off work. Visible so it gets done; not a Feature row.

A **task** (one remaining item on a feature that already has a master handoff) does not get a row.
Attach it on that feature's handoff. Do not name a slice of a feature as if it were the feature.

If `vision:` is empty, Notes must include `VISION MISSING`.

**The name is the link.** File a row as `[Name](path)`, never a bare backtick path. common-docs
files use a path relative to the register (`../projects/…`, `../systems/…`) so the click opens
in the editor. A leading `/projects/` or `/systems/` is an OKF path — Cursor looks under the
workspace root and offers to create a file that already exists. Every other repo uses
`/Users/armanisadeghi/code/<repo>/…`.

- **Taking a handoff over → DELETE its row first**, before reading the doc or touching code
  (step 1 below). Assigned ≠ orphaned.
- **Writing a new handoff, or grooming one that still has remaining work and nobody continuing
  it → ADD its row in the same commit.** A new handoff IS an orphan the moment it exists. File
  it as a Feature, a Program, or a Tail by scope; a task attaches to the owning feature instead.
- **No statuses, no essays, no history in that file** — a row's existence is the status. Notes
  is repo + date + one sentence. Anything that needs explaining belongs inside the handoff.
  Rows leave only two ways: someone took the work, or the handoff itself was deleted as finished.

## Taking one over

0. **Delete your row from the orphan list** (`/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md`, committed in the common-docs repo) — first action of the turn. You are the owner now.
1. **Vision first.** Read every `vision:` link before touching code. Arman's docs outrank the handoff's summary of them. If the identity block says VISION MISSING, do not invent one — work only what the remaining-work list already names, and put writing the vision on Decisions needed.
2. **Trust nothing dated.** The codebase moves daily. Fan out small parallel Explore subagents to verify each load-bearing claim — files exist? RPC live? still wired? **A comment in code is not a fact**; agents write wrong comments. Verify behavior and artifacts, not prose.
3. Plan, then execute in a loop — build, adversarially verify, fix — until done or blocked on a genuine Arman-decision (one with no best-practice answer). The handoff already authorizes the work; don't stop to ask permission for it.
4. Groom before the turn ends (below).

## Groom before ending EVERY turn — non-negotiable

Any turn that progressed work covered by a handoff ends with a rewrite of that handoff:

- **A completed task's entire description collapses to one Done bullet.** 8,000 words of pipeline spec, 4 hours, 15 subagents → `- RAG pipeline built — see services/rag/`. Readers who need detail read the code.
- **Rewrite, never append.** No "Update 2026-07-07:" blocks. The doc is always the current state, one voice.
- **The doc shrinks as work completes.** Target ≤150 lines. If it grew after progress, you appended instead of grooming.
- **Almost done → apply the tail law.** Collapse the doc to the leftover, set `scope: tail`, move the orphan-list row to Tails. Do not leave a Feature row for a knock-off.
- **Identity block stays true.** If you still cannot say what this is in one sentence, or the vision is still a paraphrase, fix that before you hand the doc back.
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
