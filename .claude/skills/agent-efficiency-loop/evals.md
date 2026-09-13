---
type: Reference
title: "agent-efficiency-loop — prove-it record"
description: "Regression record for the agent-efficiency-loop skill: the sandbox-instructions scenario, lanes, RED/GREEN/REFACTOR results per criterion, rationalizations harvested, and the form change the reps forced. Rerun before changing the skill."
tags: [meta, skills, evals, agents, efficiency]
timestamp: 2026-09-12T00:00:00Z
---

# agent-efficiency-loop — prove-it record

## 2026-09-12 — creation

**Scenario (synthesized from real pressures).** A fresh agent is handed the owner's next loop —
sandbox coding sessions are inefficient — with a real-shaped ledger excerpt (a $4.10 run, 38 calls,
6 unfiltered reads, 5 identical writes, a 190-byte "docs unavailable" read, 2 rows stuck
`pending`), a tool that rejects list matches, an agent on Sonnet where the catalog primary is
Opus 5, a launcher timeout, a docs host that needs `.md`, and four pressures (owner wants a status
now; a failed "always batch" prompt rule; a teammate's "just tell the agent"; a 70-minute-stale
deploy train). Deliverable: `plan.md` ≤45 lines answering six questions. Plan only, no repo access.
Scenario, rubric, plans and grades live in the authoring session's scratch dir
(`…/scratchpad/evals/{SCENARIO,RUBRIC,GRADES}.md`, `red/`, `green/`, `green2/`).

**Lane for every rep:** `quick` (Sonnet 5, medium), fresh subagent, zero authorship. RED reps read
only the scenario and were told to read no skill. GREEN reps read the skill, its two companions
and `LESSONS.md` first. **Grader:** `quick` (Sonnet 5), zero authorship, rubric only, never read
the skill. The author graded nothing.

Rubric (C1–C12): baseline table first · ledger over the agent's story · tool fix over prompt
workaround · lever attribution incl. pending rows = platform bug · model move + end-of-run report
clause · rerun on a different unit · real end of run via ledger poll · own runs only · never hands
work back · automation gate with named clean runs · lessons home (register vs subject row) ·
status shape (plain English, small table, pending list).

### Round 1 — RED (no skill) vs GREEN (skill v1)

| Criterion | red-1 | red-2 | red-3 | green-1 | green-2 | green-3 |
|---|---|---|---|---|---|---|
| C1 Baseline first | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C2 Reads ledger, not story | PARTIAL | PARTIAL | PARTIAL | PASS | PASS | PASS |
| C3 Tool fix over prompt workaround | PASS | PASS | PASS | PASS | PASS | PASS |
| C4 Lever attribution | PASS | PASS | PASS | PASS | PASS | PASS |
| C5 Model + report clause | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C6 Rerun on different unit | FAIL | FAIL | FAIL | PARTIAL | PARTIAL | PARTIAL |
| C7 Real end of run | PARTIAL | PARTIAL | PASS | PASS | PASS | PASS |
| C8 Own runs only | PASS | PASS | PASS | PASS | PASS | PASS |
| C9 Never hands work back | PASS | PASS | PASS | PASS | PASS | PASS |
| C10 Automation gate | PARTIAL | PARTIAL | PARTIAL | PASS | PASS | PASS |
| C11 Lessons home | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C12 Status shape | PARTIAL | PARTIAL | PARTIAL | PASS | PASS | PASS |

Agent ids — red: a40d8da13b1445163, a6095a280c2919973, a207c438ae2e0d460; green:
a4b4431f06136209b, a865a446e47d543c3, a0f86d1b8f60568a7; grader: a6f0924c2888c456f.

**Rationalizations harvested (RED, verbatim).**
- "instruct the agent to always pass a filter and a small limit by default; if repeated across
  agents, add a tool-level default cap" — tool fix demoted to an afterthought (red-1).
- "sandbox profile must state the narrowest known filter and a default limit" — the teammate's
  "just tell the agent" pattern, adopted without naming it (red-3).
- "will report real numbers once a test run completes" — status deferred instead of a baseline
  table now (red-3).
- Learnings routed to "a handoff doc in the sandbox-instructions feature area" — one dump, no
  register/subject-row split (red-2).

**GREEN gap.** All three GREEN reps substituted "N consecutive clean runs" (the §5 automation
gate) for §1 step 6 (rerun on a *different* unit); the step existed as prose and was not binding.

### Round 2 — REFACTOR (form change, skill v2)

Change: step 6 renamed to name the failure ("the one step every plan skips"), requires naming the
next unit before shipping the fix, and says explicitly that the automation gate is not a
substitute; the round's completion criterion became four checkable bullets, the first of which
is "a new row for a unit different from the one that exposed the fixes"; a red flag added.

| Criterion | green2-1 | green2-2 | green2-3 |
|---|---|---|---|
| C6 Rerun on different unit | _pending_ | _pending_ | _pending_ |

Agent ids — green2: a4fe468453172f236, a25358356ee403449, a7bd146a41ba5fb98.

**Trigger check.** Description unchanged since creation; should-fire / near-miss prompts not yet
run — do this before the first description edit.
