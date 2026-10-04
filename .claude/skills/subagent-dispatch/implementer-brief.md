---
type: Reference
title: "Implementer brief template"
description: "Copyable brief for dispatching an implementer subagent; fill every [SLOT]. Companion to the subagent-dispatch skill."
tags: [agents, delegation, template]
timestamp: 2026-09-10T00:00:00Z
---

# Implementer brief template (fill every [SLOT]; delete nothing)

Dispatch: subagent_type=[quick|standard|deep], model=[sonnet — default | opus: REASON]. Workers cannot
dispatch; a program that needs its own workers goes to `coordinator` with a dispatch budget.

LANE: [lane (model, effort)]. You are implementing [TASK ID]: [name]. Where it fits: [one line].

## Read first
- Repo law: that repo's CLAUDE.md (and any skill it routes this area to).
- Requirements: [BRIEF/SPEC PATH §sections] — exact values used verbatim.
- Binding constraints / settled rulings: [DECISIONS refs]. A conflict with these → stop, `ESCALATE`.

## Done when / budget / out of scope
Done when: [the one observable result that ends the job — a URL showing X, a test going green, a commit].
Budget: [N tool calls; lane default quick 40 · standard 120 · deep 200]. At the budget → `HANDOFF`.
Out of scope (report in one line each, do not fix): [anything adjacent you can predict].

## Browser (delete if no browser)
Tab: [tab id to use | open your own and name its id in every call]. Never touch another tab.
Smoke check first: one click, confirm the screen changed. Two environment failures → `BLOCKED_ENV`.

## Context you cannot derive
[interfaces from earlier tasks · my resolution of ambiguity X · parked findings in this area]

## Ownership
Exclusive paths: [globs]. Touch nothing else. Shared checkout: `git add <explicit paths>` only (never
`-a` / `-A`), confirm `git status --short` shows only your paths staged, commit, push `main`.
**Commit and push each unit as you finish it, not all at the end** — an agent killed mid-run (spend
limit, crash) loses everything it never pushed, and nobody ever learns it existed.

## Do
1. Build exactly the brief — no extras, no parallel implementations (search for what exists first).
2. Defect class found inside the brief → root cause (`diagnose`), census limited to the brief's scope,
   guard shown RED then GREEN. Outside the brief → one line in the report.
3. Evidence per claim (verify-live-state §4) — fresh, run by you, this session.
4. Self-review your diff against the brief (Missing / Extra) before reporting.
5. Commit + push as each unit lands. Never run a release script. Never dispatch a reviewer of your own work.
6. Stop when "Done when" holds. No polish, extra censuses or report padding.

## Report
Full report → [REPORT PATH]: what was built · files · evidence (commands + output, URLs, SHAs, row ids) ·
RED/GREEN for any guard · what you could not verify · concerns.
Return: ONE status line (`DONE` | `DONE_WITH_CONCERNS` | `HANDOFF` | `NEEDS_CONTEXT` | `ESCALATE` |
`BLOCKED_ENV` | `BLOCKED_HUMAN_ONLY`) + ≤15 lines + your commits (short SHA + subject) + the report path.
