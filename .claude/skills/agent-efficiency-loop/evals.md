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

### Rounds 2–4 — REFACTOR (form changes on §1 step 6)

| Round | Change | green-1 | green-2 | green-3 |
|---|---|---|---|---|
| 2 | Step 6 renamed to name the failure; four-bullet completion criterion; red flag | FAIL | FAIL | FAIL |
| 3 | **Round card** (`expose on: unit A → fixes → prove on: unit B`) required before the first run; no unit B = no round | PARTIAL | PASS | FAIL |
| 4 | **The first six actions of every plan are fixed** as a numbered recipe; action 6 = run unit B, "a separate action from 4, never folded into it" | PASS | PARTIAL | PARTIAL |

Agent ids — round 2: a4fe468453172f236, a25358356ee403449, a7bd146a41ba5fb98; round 3:
a6c773ab40f1dbc41, aceb8651ed012e26c, a022e8a8506bb38c6; round 4: a4e6b815845a16ab8,
afa52ceacc29b7061, aff71dc191ae738f8; grader for all rounds: a6f0924c2888c456f.

**Reading of round 4.** All three reps now open with the round card and name unit B (0/3 did in
round 1). The two PARTIALs name unit B and never sequence running it — the scenario asks for the
"first five actions" and unit B is action six, so the deliverable's own cap absorbs the step. The
form is binding on naming; sequencing is proven 1/3. **Next editor:** rerun with a scenario that
asks "what happens after the fixes ship" before changing §1 again; if sequencing still slips,
move the round card into the status template so unit B's row is a required cell.

**Trigger check.** Description unchanged since creation; should-fire / near-miss prompts not yet
run — do this before the first description edit.
