---
type: Reference
title: "Implementer brief template"
description: "Copyable brief for dispatching an implementer subagent; fill every [SLOT]. Companion to the subagent-dispatch skill."
tags: [agents, delegation, template]
timestamp: 2026-09-10T00:00:00Z
---

# Implementer brief template (fill every [SLOT]; delete nothing)

Dispatch: subagent_type=[quick|standard|deep], model=[sonnet|opus|fable] — per the ladder.

LANE: [lane (model, effort)]. You are implementing [TASK ID]: [name]. Where it fits: [one line].

## Read first
- Repo law: that repo's CLAUDE.md (and any skill it routes this area to).
- Requirements: [BRIEF/SPEC PATH §sections] — exact values used verbatim.
- Binding constraints / settled rulings: [DECISIONS refs]. A conflict with these → stop, `ESCALATE`.

## Context you cannot derive
[interfaces from earlier tasks · my resolution of ambiguity X · parked findings in this area]

## Ownership
Exclusive paths: [globs]. Touch nothing else. Shared checkout: `git add <explicit paths>` only (never
`-a` / `-A`), confirm `git status --short` shows only your paths staged, commit, push `main`.
**Commit and push each unit as you finish it, not all at the end** — an agent killed mid-run (spend
limit, crash) loses everything it never pushed, and nobody ever learns it existed.

## Do
1. Build exactly the brief — no extras, no parallel implementations (search for what exists first).
2. Defect class found → root cause (`diagnose`), sibling census, guard shown RED then GREEN.
3. Evidence per claim (verify-live-state §4) — fresh, run by you, this session.
4. Self-review your diff against the brief (Missing / Extra) before reporting.
5. Commit + push as each unit lands. Never run a release script. Never dispatch a reviewer of your own work.
6. Dispatching a subagent yourself → foreground, one at a time; never end your turn with one running.

## Report
Full report → [REPORT PATH]: what was built · files · evidence (commands + output, URLs, SHAs, row ids) ·
RED/GREEN for any guard · what you could not verify · concerns.
Return: ONE status line (`DONE` | `DONE_WITH_CONCERNS` | `NEEDS_CONTEXT` | `ESCALATE` |
`BLOCKED_HUMAN_ONLY`) + ≤15 lines + your commits (short SHA + subject) + the report path.
