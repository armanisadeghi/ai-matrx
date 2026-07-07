---
name: handoffs
description: The handoff-document system for docs/handoffs/*.md — how to write one, take one over, groom it every turn, and delete it. Use whenever you (1) end a large task with work remaining and need to hand off, (2) are told to continue / take over / pick up work from a handoff doc, (3) finish ANY task covered by an existing handoff (grooming it before the turn ends is mandatory), or (4) touch any file under docs/handoffs/. Triggers on "write a handoff", "handoff doc", "pick up where X left off", "continue the X work", docs/handoffs/**. Cross-repo — matrx-frontend and aidream share ONE system; a piece of work gets ONE handoff in the repo that owns most of it.
---

# Handoffs — forward-looking work orders, not history

A handoff exists so a fresh agent can start producing in minutes: a work order + resource map, grounded in Arman's vision. It is **not** a record of what you did — git and `FEATURE.md` hold history. **A handoff with no remaining work gets deleted, not archived.**

## Where they live

- `docs/handoffs/<topic>.md` (kebab-case), in whichever repo owns most of the **remaining** work (matrx-frontend or aidream).
- Cross-repo work gets **ONE doc** — never twins. Frontmatter `repos:` lists every repo involved; cross-repo file references use absolute paths.
- Canonical doctrine is THIS file (matrx-frontend); aidream carries a pointer stub at `aidream/.claude/skills/handoffs/SKILL.md`. **Edit only the canonical.**

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

## Taking one over

1. **Vision first.** Read every `vision:` link before touching code. Arman's docs outrank the handoff's summary of them.
2. **Trust nothing dated.** The codebase moves daily. Fan out small parallel Explore subagents to verify each load-bearing claim — files exist? RPC live? still wired? **A comment in code is not a fact**; agents write wrong comments. Verify behavior and artifacts, not prose.
3. Plan, then execute in a loop — build, adversarially verify, fix — until done or blocked on a genuine Arman-decision (one with no best-practice answer). The handoff already authorizes the work; don't stop to ask permission for it.
4. Groom before the turn ends (below).

## Groom before ending EVERY turn — non-negotiable

Any turn that progressed work covered by a handoff ends with a rewrite of that handoff:

- **A completed task's entire description collapses to one Done bullet.** 8,000 words of pipeline spec, 4 hours, 15 subagents → `- RAG pipeline built — see services/rag/`. Readers who need detail read the code.
- **Rewrite, never append.** No "Update 2026-07-07:" blocks. The doc is always the current state, one voice.
- **The doc shrinks as work completes.** Target ≤150 lines. If it grew after progress, you appended instead of grooming.
- **Everything done → delete the file** (git keeps history) + one dated line in the affected `FEATURE.md` Change Log. Deleting is the success state — do not ask permission.
- Refresh `updated:` and `status:`.

## Escalating decisions to Arman

Arman juggles 15 projects; a question must be answerable cold:

- **Never** reference doc-internal numbering ("as noted in 3b…") or shorthand he'd have to look up.
- Per question: **Situation** (2–3 plain sentences of fact) → **Decide** (the concrete choice, with options). Fully self-contained.
- Only questions with no best-practice answer. Where a best practice exists, apply it and record the choice as a Done bullet.

## Rot control

`/handoff-cleanup` (its own skill) periodically sweeps both repos' handoff dirs, verifies claims against reality, deletes done docs, and escalates unclear drift. It is the backstop — per-turn grooming is still your job.
