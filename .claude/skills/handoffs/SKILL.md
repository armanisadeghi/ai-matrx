---
name: handoffs
type: Skill
title: handoffs — the work-order system
description: "The handoff-document system for docs/handoffs/*.md and node HANDOFF.md files. Use when ending a large task with work remaining, when told to continue or pick up work ('pick up where X left off', 'continue the X work'), when finishing any task a handoff covers, or when touching docs/handoffs/**."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/handoffs/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Handoffs — the future, never the past

A handoff exists so someone else can take the work over in minutes. It holds three things: **Arman's confirmed vision**, **everything still open**, and **almost nothing about the past**.

Its goal is to delete itself. The end state of any feature is one line in its docs, *"X is built and in production"*, plus a list of known weaknesses. A handoff that grows is failing. A handoff that turns into a history document is the defect this skill exists to prevent (Arman, 2026-09-24: *"We have change-logs and bullshit that just destroys us! Who cares about the past and where we were and what we did. Where are we now?"*).

## Format — four sections, in this order

```markdown
---
type: Handoff             # REQUIRED by okf_lint
title: "<name> — handoff"
description: "<one sentence>"
status: active            # active | blocked (blocked = waiting ONLY on Arman)
updated: 2026-09-24
repos: [matrx-frontend]   # every repo the open work touches
scope: feature            # domain | feature | subfeature | program
feature: <owning Feature name>
vision: []                # links to Arman's own documents, if any exist
---

# <Name> — handoff

**What this is:** one sentence a stranger understands.
**Seen from his seat:** where Arman goes and what he does to meet this work.

## Vision — Arman's words
## Where it stands
## Future — everything still open
## Resources
```

**1. Vision — Arman's words, confirmed.** Big-picture things Arman himself said he wants the system to do, **quoted exactly**.
- Only words he said to you directly, or that his own document (`authority: owner`) holds. Never carry a quote over from another agent's doc: an agent-recorded "Arman said" line is how untrue things spread.
- Never paraphrase him into agent-speak.
- No confirmed words → write `VISION MISSING` here and nothing else. An inferred paragraph is not a vision.

**2. Where it stands — five one-line bullets, at most.** Present tense, what exists now: `- RAG pipeline built — see services/rag/`.
- No dates, no "we then…", no session narrative, no counts of agents or commits, no change log.
- Nine pages of work become one bullet.

**3. Future — everything still open, in detail.** This is the heart of the doc and the only section allowed to be long. Numbered by priority. Each item is independently actionable: what, where (file paths), the trap, what "done" looks like. It holds:
- pending work and upcoming tasks
- **known weaknesses** (bugs, risks, unproven claims, fragile spots) — worth their weight in gold
- things that must not be left behind or forgotten
- decisions only Arman can make, each self-contained (see Escalating below)

**4. Resources.** Pointers that spare a discovery pass: key files, guards and how to run them, logs, skills, test login. Pointers, not explanations.

**Banned everywhere:** chronology, changelogs, "Update 2026-…:" blocks, session narratives, self-praise, restating what `FEATURE.md` or the code already says.

## Where they live

- **Cross-repo work** (2+ repos): `HANDOFF.md` in the owning registry node's home in common-docs (`systems/<domain>/<feature>/`). One doc, never twins. Cross-repo paths are absolute.
- **Single-repo work**: `docs/handoffs/<topic>.md` in the owning repo.
- This skill is canonical in `common-docs/skills/handoffs/SKILL.md`. Every repo carries a synced copy. Edit the canonical, run `python3 common-docs/meta/scripts/sync_skills.py`, commit each repo.

## Rewrite every turn — the doc only shrinks

Any turn that moved the work ends with a **rewrite** of the handoff, never an append:
- A finished Future item **leaves Future**. At most it becomes one bullet in Where it stands, and only if that bullet is not already there.
- New knowledge goes into the item it changes. The doc is always the current state, in one voice.
- Target ≤150 lines. If it grew after progress, you appended.
- Refresh `updated:` and `status:`.

## Finishing — the success state is deletion

When Future holds nothing but known weaknesses:
1. In the feature's `FEATURE.md` (or its `STATE.md` in common-docs), the status line becomes **"X is built and in production."**
2. Every remaining weakness moves into that doc's **Known weaknesses** list. Weaknesses are never deleted with the handoff.
3. Delete the handoff (git keeps history) and remove its row from the register.

No change-log line, no summary of what was built, no archive copy.

## The register of handoffs no one is working on

`/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md` is how Arman decides what to staff next. It stays short and true.
- **One row per handoff nobody is working on:** `| [Name](link) | repos · date · one sentence about what is open |`. The name is the link: a path relative to the register for common-docs files, an absolute `/Users/armanisadeghi/code/<repo>/…` path otherwise.
- A new handoff, or one handed back with work left → **add its row** in the same commit.
- **Taking one over → delete its row first**, before reading the doc.
- A deleted handoff → delete its row.
- No statuses, no essays, no extra columns. A row's existence is the status.
- The register's older five-table layout (Domain / Feature / Sub-feature / Program / Tail) is being merged into this one list. `handoff-cleanup` merges it on its next sweep; until then, add new rows to the table that fits.

## Taking one over

1. Delete the register row.
2. **Vision first.** Read the Vision quotes and every `vision:` link. `VISION MISSING` → work only what Future already names, and put writing the vision on Future as a decision for Arman.
3. **Trust nothing dated.** The codebase moves daily. Verify each load-bearing claim against code, the database and live behaviour, not prose. A code comment or a doc's "verified ✓" is not evidence.
4. Work the Future list in a loop (build, verify adversarially, fix) until it is empty or blocked on a real Arman decision. The handoff already authorizes the work.
5. Rewrite before the turn ends.

## Escalating decisions to Arman

A question in Future must be answerable cold: **Situation** (2–3 plain sentences of fact) → **Decide** (the concrete choice, your recommendation, and why). No doc-internal references or shorthand. Only questions with no best-practice answer; where one exists, apply it.

Rot control: `/handoff-cleanup` sweeps every handoff with the same rules. Per-turn rewriting is still your job.
