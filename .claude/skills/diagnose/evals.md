---
type: Reference
title: "diagnose — prove-it record"
description: "Regression record for the diagnose skill: a real render-outage scenario, pass criteria fixed before running, RED/GREEN results per rep, rationalizations harvested, trigger checks, and proposed refactors. Rerun before changing the skill."
tags: [meta, skills, evals, debugging]
timestamp: 2026-09-10T00:00:00Z
---

# diagnose — prove-it record

## 2026-09-10 — first proof run (skill-authoring §5)

**Runner:** a `standard` (opus) eval-runner session that did not write the skill. It set up the scenarios and graded the answers. The subagents in each rep did the planning.
**Lanes:** RED and GREEN runs were `standard` (opus, medium), each a fresh subagent. Trigger checks were `quick` (sonnet, medium), each a fresh subagent.
**Form:** plan-your-actions dry run. Reps could read files and run read-only commands, and were told not to modify anything. No rep changed anything in the shared checkout.

### Scenario (from a real, fixed incident)

**Source:** the 2026-08-28 chat render outage.
- matrx-frontend `c4179794bf` — *fix(content-ir): schema-less kinds render their component again*.
- aidream `e7f560d5c` — *content-ir-react 0.7.0: kindIsRoutable stops counting the generic fallback*.
- aidream `3a60c735d` — *content-ir 0.8.0: a field is never dropped*.
- matrx-frontend `a9d4ed0a23` — *test(content-ir): the render matrix*.
- The witness line in matrx-frontend `CLAUDE.md` for `test:render-matrix`.

**Real cause:** content-ir-react 0.4.0 put a `kindState === "raw"` gate above the component paths in `applyIrKindRoute`. "raw" meant two things: the value failed its schema, or no schema was ever available. The gate could not tell them apart. About 221 live kinds fell to generic key/value dumps. Their component rows were fine, `kindIsRoutable` answered true, and CI stayed green. The failing boundary was recognition (kindState), which sits ahead of the component lookup.

**Symptom as reported to each rep:**
- The date is 2026-08-28. Arman says agent 6c4480e9's card in conversation 20fd67fb now shows as a grey key/value table. Flashcards and other kinds look the same. It started today.

**Pressures in the prompt:**
1. A client walkthrough in 15 minutes: "fixed NOW".
2. A teammate has "already checked": the component row is active and `kindIsRoutable()` is true. The teammate blames model JSON drift and proposes a two-minute fix: tighten the agent prompt, or re-save the row with `is_default=true`.
3. CI is fully green (1300+ content-ir tests).
4. About 40 commits landed that day, including package releases.

Reps were told the incident cannot be reproduced in today's checkout. They were also told not to look up the resolution in git history, FOUND_DEFECTS, or handoffs.

### Pass criteria (fixed before any run; a rep passes only if it meets all eight)

| # | Criterion |
|---|---|
| C1 | **Evidence first.** Before theorizing, pull the captured evidence: errors surfaces or incidents, the Error Inspector, and the real message. Also check what changed: package versions, lockfile, deployed SHA, and git log on the touched paths. |
| C2 | **Red-capable loop before any fix.** Name one concrete command, test, or browser check that drives the real path over the real payload and asserts the reported symptom (component vs generic). |
| C3 | **At least 3 hypotheses**, each with a falsifiable prediction, written before testing. |
| C4 | **Localize the boundary.** Find the first boundary where good data goes bad (stream → recognition/kindState → route → component → render), and/or diff against a working sibling (a kind that still renders, or the last-good version). |
| C5 | **Reject symptom patches.** Do not ship the teammate's prompt tweak or `is_default` re-save, or any fallback or retry, without a proven cause. |
| C6 | **Guard at a seam that reproduces the real bug.** Use the real recognizer and router over a real payload, not a stub. Watch it fail, then pass. |
| C7 | **Census the siblings.** Count the affected kinds and fix at the origin or shared layer, not per kind. |
| C8 | **Done means verified live.** Verified on the live surface with real data after deploy, not "tests pass". Name the silent fallback and the lying health check (routable-true, CI green) as a second defect that needs structural capture. |

### RED — baseline (told "Do not use the Skill tool")

| Rep | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Result |
|---|---|---|---|---|---|---|---|---|---|
| R1 | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |
| R2 | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |
| R3 | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |

**RED: 0/3.**

All three reps were strong on evidence, rejecting the patch, a real-seam guard, census, and live done. Workspace CLAUDE.md, defect-ownership, verify-live-state, and the "walk the real pipe" memory already carry those rules, and every rep cited them. All three failed the same two places:
- **No red-capable loop before theorizing.** Each plan traced code first and put reproduction late, as a vague step.
- **No falsifiable hypotheses.** Each listed candidate causes without predictions.

- **R1:** traced the chat render path to the fallback first. Reproduction came at step 5 ("render the real stored data through the chat component"). Its theories were duplicate package copies, an empty registry, or a silent import failure, with no predictions: "The duplicate-package and registry theories are guesses to test".
- **R2:** traced `kindIsRoutable` in two copies and then diffed that day's releases. It listed possible causes without predictions ("a renamed or reshaped host field, a registry key change, or a missing component registration"). It named no loop. Its walkthrough stopgap was "revert or pin the one bad change once step 4 finds it". R1, by contrast, noted the latest law forbids pinning.
- **R3:** wrote "Then I'd test locally with the package before and after the change to find the one that broke it". That is a differential run with no assertion or command, and no hypotheses.

### GREEN — with the skill ("Before acting, read …/diagnose/SKILL.md and follow it")

GREEN_PLACEHOLDER

### Rationalizations harvested (verbatim)

RATIONALIZATIONS_PLACEHOLDER

### Trigger check (description as of 2026-09-10)

Each prompt went to a fresh `quick` (sonnet) subagent with this question: "Which skill (if any) would you invoke first? One line; do not invoke."

| Prompt | Expected | Answer | Fired? |
|---|---|---|---|
| "/workflows/runs on aidream started returning 500s after yesterday's deploy — find out why" | fire | TRIGGER1_PLACEHOLDER | TRIGGER1_FIRED |
| "Notes stopped saving sometime this week. No error … It worked last Friday." | fire | `diagnose`: "a 'worked before, now silently fails with no error' regression" | **fire** |
| "I bumped the scraper client timeout to 60s like you said and the page fetches still fail about a third of the time. What now?" | fire | none: "server-log-analyzer/diagnose are for different scopes … I'd investigate directly" | **MISS** |
| "Write a pytest for aidream's normalize_org_slug function" | silent | `aidream:task-hygiene` | silent |
| "Added Mistral as a provider — set up error capture for its calls" | silent | `error-capture` | silent |
| "Run tonight's persistence sweep: list the stuck rows and repair" | silent | `persistence-repair-patrol` | silent |

**Listing observation:** in the eval runner's own skill listing, which loads at the workspace root, `diagnose` appeared **name-only**, with no description. Per skill-authoring §1, the listing budget admits descriptions by usage score, and a new skill with no uses scores last. Subagent listings may differ. The scraper miss fits a reader who never saw the "immediately after a fix attempt did not work" trigger text.

### Proposed refactors (NOT applied — SKILL.md is being edited by other sessions)

REFACTOR_PLACEHOLDER

### Limitations

- Baseline subagents still saw the skill listing entry (at most its name and description). They were told not to load it, and no RED rep cited `diagnose`.
- These were dry-run plans for a historical incident. No rep could run a loop. C2 therefore grades whether the plan names a concrete loop before any fix, not whether one was executed.
- The runner graded all reps against the criteria above. No second grader was used.
- All reps shared one scenario (a frontend and package render path). A server-side or flake scenario is a sensible next rerun.
