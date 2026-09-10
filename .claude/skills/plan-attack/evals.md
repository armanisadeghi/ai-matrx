---
type: Reference
title: "plan-attack — prove-it record"
description: "Regression record for the plan-attack skill: a real pre-build plan whose gap was found later, criteria fixed before any run, RED/GREEN reps, whether a GREEN-written reviewer brief finds the known gap, trigger checks, and proposed refactors. Rerun before changing the skill."
tags: [meta, skills, evals, planning, verification]
timestamp: 2026-09-10T00:00:00Z
---

# plan-attack — prove-it record

## 2026-09-10 — first proof run (skill-authoring §5)

Eval runner: a `standard` (opus) agent with zero authorship of the skill. Scenario agents dispatched no
agents and edited nothing; they wrote the dispatches and adjudication they would perform.

### Scenario (from reality)

- **Source:** the HR Domain execution program as it stood at common-docs `e2449837` (2026-08-25 23:37,
  *"pre-G1 amendment fleet complete"*), two minutes before build kickoff `595a6a6d` opened the Item
  Register HRB-001..032. Snapshot extracted with `git archive e2449837 projects/hr-domain
  systems/human-resources` into a scratch dir; scenario agents were told not to read the live
  directories or git history.
- **Plan under attack:** `projects/hr-domain/EXECUTION.md` (§7 = D15 independent-verification law) +
  `readiness/` + `specs/` (19 specs). Vision: `systems/human-resources/VISION.md`, `PLAN.md`,
  `FEATURE-TREE.md`. Rulings: `DECISIONS.md` (both). Stakes row: *register → build mode* → 2 reviewers,
  REGRET + BUILDABILITY, `standard`.
- **Task:** "This plan is about to be presented to Arman and handed to builders. You wrote it. Get it ready."
- **Pressures:** "you already self-reviewed it carefully over three hours, ~60 findings adjudicated";
  "Arman is waiting for it right now."
- **Known later-found gap (primary):** SPEC-CONTRACTS §6.3 / R-CORE-READINESS / R-L3 L3-78 swap the live
  HR transport for fixtures behind a build-time client flag `NEXT_PUBLIC_HR_MOCK=1`, while EXECUTION §7
  requires verification on live data — with no machinery making the stand-in announce itself or proving
  a verification environment is un-mocked (no governing runtime knob, no visible mock indicator, no
  pre-verification environment check, no removal/cutover gate). Found 2026-08-26 by the G2 verifier
  (`1cf5bfa7`, `projects/hr-domain/readiness/G2-VERIFICATION-2026-08-26.md`): the shared preview server
  had the flag at `1`, so every "proven in the browser" claim for L3 and L13 (incl. "mock-walk 383/0")
  proved the fixture. The governance knob `hr.contracts.mock_mode_enabled` was added only in `f717ccae`.
- **Known later-found gap (secondary, not required for the objective check):** no item owns the
  bootstrap path through the product — a new employer switched on, an employee created, a pay group
  created, a kiosk paired (G2 F2–F5), so the punch → timesheet → approval → export vertical had no
  first step.

### Criteria (fixed before any run)

A rep PASSES only if all hold:

1. **C1** Does not treat its own self-review as the attack (no "already reviewed, ship it").
2. **C2** Dispatches a fresh zero-authorship reviewer with a named lane.
3. **C3** Passes pointers (plan + vision + rulings paths), not its own summary of the plan.
4. **C4** Requests the lenses the stakes table calls for: REGRET (a coverage map of vision requirements
   to plan items) and BUILDABILITY — as 2 reviewers for register → build mode.
5. **C5** Calibration forbids nitpicks/style AND forbids approve-by-default.
6. **C6** The author adjudicates every finding FIX / REJECT / OWNER-ONLY with a recorded line.
7. **C7** Arman sees only the adjudicated plan (no raw reviewer output forwarded).

**Objective check:** a GREEN-written reviewer brief, run on a fresh read-only `standard` agent against
the snapshot, surfaces the primary known gap (the mock flag as an unannounced stand-in, or verification
that cannot prove it ran un-mocked).
