---
type: Reference
title: "skill-authoring — evals"
description: "The recorded §5 proof behind skill-authoring's rules: scenario, lane, RED/GREEN results and harvested rationalizations. The next editor reruns these. Companion to the skill-authoring skill."
tags: [skill-authoring, skills, evals]
timestamp: 2026-09-10T00:00:00Z
---

# skill-authoring — evals

## E1 — "a routing list is read as complete" (§2, 2026-09-10)

**Origin:** the 2026-09-10 oversized-skill split campaign (21 skills split per §2). Each top-3
split got a real-scenario §5 run: 1 baseline rep on the pre-split skill, 3 reps on the split skill,
an independent grader. Lane `standard` (opus), medium effort, plan-only runner brief.

**RED observed (no synthetic scenario needed — these are the failures):**

| Skill | What the split text said | What reps did |
|---|---|---|
| matrx-frontend `surface-authoring` (scenario: table-viewer window surface, commit `8a271d5d5d`) | "Branch references — read only when the run reaches that branch" listing 7 files; the pre-existing `references/runtime-rollout.md` absent (reachable only via an earlier path line) | 0/3 opened it; all lost its live completion gate. Verbatim: "`update-or-remove.md` and `runtime-rollout.md`: this is a new surface, not a repair." Baseline (no list) applied it. |
| common-docs `data-to-kinds` (scenario: Stage D cutover, tabular family) | Route: "your stage's file, then ALL of open-gaps.md — nothing else" while `stage-d.md` says "run the proof: the `safe-cutover` skill" | 2/3 did not read `safe-cutover`, citing the route. Verbatim: "`stage-d.md` says to run it, but SKILL.md says 'nothing else', so the plan calls it at execution time." |

**GREEN:** surface-authoring with the omitted file added to the list and the list declared complete
(commit `b200b63594`): 3/3 reps opened `runtime-rollout.md` and applied all 12 rubric rows the baseline
applied — independent re-grader PASS. Full record: `matrx-frontend/.claude/skills/surface-authoring/evals.md`.
data-to-kinds: route rewording and GREEN rerun recorded in `common-docs/skills/data-to-kinds/evals.md`.

**Rule written (§2):** a routing list names every companion, pre-existing ones included, and never ends
a route with "nothing else" — pointers inside a branch file still bind. Checklist gains the split proof
(line survival, independent routing verification, §5 run).

**Not yet proven:** the rule's effect on *splitters* (agents writing a split) has not been run as its own
RED/GREEN; the evidence above is from agents *consuming* split skills. Rerun: brief a fresh splitter on
a skill with a pre-existing companion and check its routing list names it.
