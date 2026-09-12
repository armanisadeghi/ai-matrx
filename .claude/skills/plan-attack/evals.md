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

### Lanes

Scenario reps: `standard` (opus, medium), fresh, one per rep, told not to use the Skill tool and — for
RED — not to read the skill. Objective check: `standard` (opus, medium), read-only. Trigger checks:
`quick` (sonnet, medium), fresh per prompt.

### RED — baseline, no skill (3 reps, 2026-09-10)

All three refused to ship on their own self-review (C1) and dispatched fresh zero-authorship reviewers
with lanes named (C2) from file pointers (C3), adjudicated every finding (C6) and sent Arman only their
own adjudicated words (C7). **All three failed C4, two failed C5 — 0/3 pass.**

- **RED-1** (`a4c2b7418ee14f040`) — 3 dispatches: spec-consistency census, program hole-poke (`deep`,
  high), privacy walls (`deep`, high). No REGRET coverage map anywhere (C4 fail). Calibration invites
  "cosmetic" severity and never forbids nitpicks (C5 fail). Anchored the reviewers on its own
  conclusions inside the briefs ("The domain STATE/HANDOFF say the program is 'proposed'…").
- **RED-2** (`adffc3f91c2205770`) — 3 attackers, all `standard`, with a shared preamble and the strongest
  RED calibration: *"Praise is worthless; so are style nits"* (C5 pass). Explicitly refused to anchor:
  *"I don't pass my findings above to them, so they aren't anchored on my view."* Lens C is vision-fit
  ("does the package build what Arman ruled"), but nothing asks for a requirement→item map (C4 fail).
- **RED-3** (`af5bff88dba17b411`) — 2 dispatches (one `deep` high, one `standard`), consistency census +
  program attack. Vision fit is one bullet, no coverage map (C4 fail); MINOR severity invited, no
  nitpick ban (C5 fail).

**Rationalizations harvested (verbatim).** None of the expected kind — no rep argued its self-review was
enough. What RED shows instead is *lens drift*: with the trigger description alone ("an agent that did not
write it"), agents reliably dispatch attackers and reliably invent their own lenses. Two of three reached
for `deep`/high by reflex, which the skill bans:
- RED-1: *"lane `deep`, model opus, effort high. Reason: sequencing and ownership calls across 14 lanes
  and 19 specs where the evidence conflicts."*
- RED-3: *"Dispatch A: lane `deep`, model opus, effort high… consequential judgment about the program
  across 19 specs, not a census."*

### GREEN — with the skill (3 reps, 2026-09-10)

**3/3 pass all of C1–C7**, and all three cite the skill by name.

- **GREEN-1** (`aa9a5287abb77c688`) — exactly 2 reviewers, REGRET + BUILDABILITY, `standard`, brief
  template used verbatim including the CALIBRATION and RETURN blocks. Kept its own spot-finding out of
  the briefs: *"I will not pass this to the reviewers, because they get pointers, not my conclusions."*
  Adjudication FIX / REJECT / OWNER-ONLY, `Attacked …` changelog line, Arman gets a holding line then the
  adjudicated package.
- **GREEN-2** (`a8cc7d91373474301`) — the 2 required lenses plus a third (CONTRACTS) with a stated reason
  and an explicit refusal of the `deep` reflex: *"No `deep` lane: finding gaps across a package doesn't
  need extended reasoning."* All other criteria met.
- **GREEN-3** (`a0ce71907f2685245`) — exactly 2 reviewers, both lenses, identical header repeated in full
  per reviewer ("subagents share no context"). Added a correct refusal to adjudicate doc-vs-doc intent:
  *"Report doc-vs-doc intent disagreements as OWNER-ONLY, never resolve them."*

Per-criterion: C1 6/6 · C2 6/6 · C3 6/6 (RED-1 and RED-3 anchored, not disqualifying) · C4 RED 0/3,
GREEN 3/3 · C5 RED 1/3, GREEN 3/3 · C6 6/6 · C7 6/6.

### Objective check — does a GREEN-written brief find the known gap?

GREEN-1's REGRET brief, sent verbatim to a fresh read-only `standard` agent (2026-09-11, `ae00ddeeae4858824`,
51 tool uses, 442 s): **the primary known gap was NOT surfaced.** The answer contains no "mock", "fixture
flag" or "stub"; the nearest finding is the neighbouring one:

> "[G2 real data] All 41 `hr.employee` rows live in "Write Target Sandbox", "ZZZ G2 Activation Probe",
> "ZZZ N7 Seed Test" orgs; zero in the AI Matrx org… Every verifier will be handed manufactured data —
> the exact D15 defect."

Secondary gap: PARTIAL — AD-9 activation named as a missing G2 precondition, but no pay group, kiosk
pairing or employer switch-on. Verdict returned: FIX-FIRST, COVERAGE 29/38, 7 BLOCKING / 5 ADVISORY /
4 OWNER-ONLY. **Contamination:** the brief lets the reviewer read live repos and the live DB, so its first
BLOCKING is drift between the plan and today's live state — a finding the 2026-08-25 reviewer could not
have made.

So the brief's calibration and return shape work, and the "manufactured data" clause fires, but the
skill's generic *"a fallback or stand-in that does not announce itself"* bullet did not make a reviewer go
looking for a build-time flag inside the plan's own verification path.

### Trigger check (2026-09-11, `quick`)

| # | Prompt | Result |
|---|---|---|
| 1 | "I've finished the feature-deep-dive plan for the Notification Center and I'm about to present it to Arman. What's next?" | FIRE ✓ |
| 2 | "The Local Listings register is ready to move to build mode — open it and start handing out lanes." | FIRE ✓ |
| 3 | "Here's the contract for the new `agent.review_queue` table I designed — go ahead and write the migration and the ORM model." | FIRE ✓ |
| 4 | "The subagent I dispatched says the fix is DONE. Verify it before I close the register item." | **FALSE FIRE** — picked plan-attack, expected subagent-dispatch |
| 5 | "Grill me on the scope of the unified settings platform before we write the register." | no-fire ✓ (grilling) |
| 6 | "Write a regression test for the context-trim re-fetch bug we fixed yesterday." | no-fire ✓ (forcing-function-tests) |

3/3 should-fire, 2/3 near-miss. Prompt 4's rationalization, verbatim: *"its scope explicitly covers
adversarial re-verification of 'done' claims before belief, which matches verifying a subagent's DONE
report before closing the register item."* The agent read the root CLAUDE.md line *"'done' claims get an
adversarial re-verify"* as this skill's scope; the existing `NOT for finished work` clause did not hold.

### PROPOSED refactors (exact diffs — a parallel agent owns SKILL.md; do not apply from here)

**R1 — the stand-in bullet is too abstract to find a build flag (objective check).** In the REGRET block:

```diff
 - Verification: is "done" proven by someone other than the builder, on the live surface, with
-  real data? Self-authored tests on manufactured data are a finding.
+  real data? Self-authored tests on manufactured data are a finding. Name every build flag,
+  env var, fixture mode, seed script or demo dataset the plan can run under, and say what proves
+  a verification ran with none of them on.
```

**R2 — the reviewer graded today's repo against a pinned plan (objective check, contamination).** In
Dispatch rules:

```diff
 - Fresh agent, zero authorship, lane named ([subagent-model-ladder](/policies/subagent-model-ladder.md)).
   Read-only; it may read code and the live DB.
+- Pin the plan: give the reviewer the SHA or snapshot it must judge, and say that drift between the
+  plan and newer live state is not a finding against the plan.
```

**R3 — trigger 4 false fire.** Description, 281 → 300 chars, still inside the ≤300 target:

```diff
-…or code a new contract or table. NOT for finished work (use subagent-dispatch)."
+…or code a new contract or table. NOT for judging work already built or reported DONE (use subagent-dispatch)."
```

### Limitation

RED reps ran in sessions where the skill listing (name + description) was still in context; they were
instructed not to load the skill body. The description alone carries "an agent that did not write it",
which is why every RED rep dispatched reviewers. RED therefore measures what the *body* adds — the named
lenses, the coverage map, the two-way calibration, the lane discipline — not what the skill adds over
nothing.
