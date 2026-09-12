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

| Rep | Transcript (agent id) | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | `a0a85109d4c174f0a` | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |
| R2 | `a763cabafc41c52b7` | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |
| R3 | `a35ab0d1b2ccbd152` | Y | **N** | **N** | Y | Y | Y | Y | Y | FAIL |

**RED: 0/3.**

All three reps were strong on evidence, rejecting the patch, a real-seam guard, census, and live done. Workspace CLAUDE.md, defect-ownership, verify-live-state, and the "walk the real pipe" memory already carry those rules, and every rep cited them. All three failed the same two places:
- **No red-capable loop before theorizing.** Each plan traced code first and put reproduction late, as a vague step.
- **No falsifiable hypotheses.** Each listed candidate causes without predictions.

- **R1:** traced the chat render path to the fallback first. Reproduction came at step 5 ("render the real stored data through the chat component"). Its theories were duplicate package copies, an empty registry, or a silent import failure, with no predictions: "The duplicate-package and registry theories are guesses to test".
- **R2:** traced `kindIsRoutable` in two copies and then diffed that day's releases. It listed possible causes without predictions ("a renamed or reshaped host field, a registry key change, or a missing component registration"). It named no loop. Its walkthrough stopgap was "revert or pin the one bad change once step 4 finds it". R1, by contrast, noted the latest law forbids pinning.
- **R3:** wrote "Then I'd test locally with the package before and after the change to find the one that broke it". That is a differential run with no assertion or command, and no hypotheses.

### GREEN — with the skill ("Before acting, read …/diagnose/SKILL.md and follow it")

Each GREEN rep read the skill (its first tool call was `Read …/diagnose/SKILL.md`) and cited it in a closing "What guided this" list. Graded 2026-09-11 by a finisher that ran none of the reps.

| Rep | Transcript (agent id) | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| G1 | `a4c528f349558aa6c` | Y | Y | **N** | Y | Y | Y | Y | Y | FAIL (C3 only) |
| G2 | `a43b49747fcf58f2c` | Y | Y | **N** | Y | Y | Y | Y | Y | FAIL (C3 only) |
| G3 | `ab82e5a8258a2cae3` | Y | Y | **N** | Y | Y | Y | Y | Y | FAIL (C3 only) |

**GREEN: 0/3 on the all-eight bar. C2 moved 0/3 → 3/3. C3 stayed 0/3.**

- **G1:** loop = "take the stored payload from 20fd67fb and render it through the published `KindInstanceRender`, using the version the frontend actually installs … assert that the purpose-built component appears and the key/value fallback does not", plus a browser DOM check, both before any fix. Four suspects (registry change, two package copies, key mismatch, swallowed import error) with "Each gets a test that should flip the loop" — no prediction per suspect. Guard at the package-to-app seam over real stored payloads, fail-then-pass. Named the fallback silence and "CI passed because those tests check source code" as a second defect.
- **G2:** loop = browser check on 20fd67fb asserting "the kind's own component mounted, not the generic key/value one", with a flashcard message as the working sibling. Wrote the skill's own instruction back ("write 3–5 ranked guesses, each with a prediction") and then listed five guesses with no predictions; only agent drift got a test ("Checking the stored payload against the kind schema rules it in or out"). Found from code that `kindIsRoutable` never loads the component, so the fault is downstream of the teammate's evidence. Walkthrough stopgap "pin or revert to last-good" — pinning conflicts with the latest-law, a defect outside these criteria.
- **G3 (graded by the runner, confirmed by the finisher):** loop = browser script on 20fd67fb failing on the grey table, then the same on a flashcard set. Four ranked guesses, no predictions. **Leakage:** it read today's `KindInstanceRender.tsx` and quoted the post-fix comment that a row naming the generic fallback is "coverage on paper only" — that comment did not exist on 2026-08-28, so its boundary reasoning is partly informed by the resolution. It disclosed this ("router details come from today's checkout").

**Reading:** the skill fixed the failure the reps had in common (no red loop before code reading: §1 is the longest section and is titled "the core of the skill"). It did not fix the falsifiable-prediction miss even though §4 states it in one sentence and G2 repeated that sentence. Per skill-authoring §3/§5.4, three agreeing misses against a stated rule means the form is not binding, not that words are missing.

### Transcript provenance (added 2026-09-12 — verdicts unchanged)

Every scenario rep above cites its agent id. A transcript reads at
`/private/tmp/claude-501/-Users-armanisadeghi-code/0cf3c493-04c8-4d2f-b3cf-f84c84998f99/tasks/<id>.output`
(JSONL; the last assistant message is the graded answer). Ids were recovered by matching each row's
verbatim harvested quote to exactly one transcript, not by dispatch order — the runner's own RED-2 and
RED-3 filenames disagree with this record's R2/R3, and the quotes are the ground truth. Nothing here
re-grades a verdict; this section adds provenance only.

The six **trigger-check** reps were `quick` (sonnet) subagents whose replies came back inline to the
runner; no separate transcript file was persisted for them, so their rows are **not recoverable** as
transcripts. Their answers survive verbatim in the runner's own transcript, `a61e511d9f0e1d0b3` (the
2026-09-11 rerun of row 1 is in the finisher's, `a1409fa61ea011915`).

### Rationalizations harvested (verbatim)

RED (no skill):
- R1: "The duplicate-package and registry theories are guesses to test" (hypotheses offered without predictions).
- R2: "revert or pin the one bad change once step 4 finds it" (fix named before a loop exists).
- R3: "Then I'd test locally with the package before and after the change to find the one that broke it" (differential run offered as the loop; no assertion).

GREEN (skill read):
- G1: "Each gets a test that should flip the loop" (a test promised in place of a prediction).
- G2: "write 3–5 ranked guesses, each with a prediction" followed by five guesses and no predictions (the rule restated, then skipped).
- G2: "if a bisect finds a bad package release, pin or revert to last-good. That is a proven, reversible move" (pin offered as safe; the workspace forbids pins).
- G3: "I'd trace each step once, with tagged temporary logging, and find the first one where good data goes bad" (boundary walk correct, but ranked guesses came after it with no predictions).

### Trigger check (description as of 2026-09-10)

Each prompt went to a fresh `quick` (sonnet) subagent with this question: "Which skill (if any) would you invoke first? One line; do not invoke."

| Prompt | Expected | Answer | Fired? |
|---|---|---|---|
| "/workflows/runs on aidream started returning 500s after yesterday's deploy — find out why" | fire | runner (2026-09-10): `server-log-analyzer`; finisher rerun (2026-09-11): `diagnose`: "a live 500-error regression after a deploy, and diagnose is the doctrine for root-causing any bug/regression before proposing a fix" | **MISS** on the recorded run; fire on rerun |
| "Notes stopped saving sometime this week. No error … It worked last Friday." | fire | `diagnose`: "a 'worked before, now silently fails with no error' regression" | **fire** |
| "I bumped the scraper client timeout to 60s like you said and the page fetches still fail about a third of the time. What now?" | fire | none: "server-log-analyzer/diagnose are for different scopes … I'd investigate directly" | **MISS** |
| "Write a pytest for aidream's normalize_org_slug function" | silent | `aidream:task-hygiene` | silent |
| "Added Mistral as a provider — set up error capture for its calls" | silent | `error-capture` | silent |
| "Run tonight's persistence sweep: list the stuck rows and repair" | silent | `persistence-repair-patrol` | silent |

**Listing observation:** in the eval runner's own skill listing, which loads at the workspace root, `diagnose` appeared **name-only**, with no description. Per skill-authoring §1, the listing budget admits descriptions by usage score, and a new skill with no uses scores last. Subagent listings may differ. The scraper miss fits a reader who never saw the "immediately after a fix attempt did not work" trigger text.

### Proposed refactors (NOT applied — never edit a SKILL.md from an eval)

Grounds: C3 missed 6/6 across RED and GREEN while §4 already says "Each states a prediction". Change the form, not the words (skill-authoring §3): make the prediction a required column and the missing column a red flag.

```diff
--- a/skills/diagnose/SKILL.md
+++ b/skills/diagnose/SKILL.md
@@ ## 4. Hypothesize: several, falsifiable, one variable at a time
-Write 3–5 ranked hypotheses before testing any — a single hypothesis locks onto the first plausible
-story. Each states a prediction: *"if X is the cause, changing Y turns the loop green."* No
-prediction → sharpen it or drop it. Test one variable per run (debugger/REPL or targeted boundary
-logs), never "log everything and grep". A result that contradicts every hypothesis sends you back to
-§3, not to a guess.
+Write 3–5 ranked hypotheses before testing any — a single hypothesis locks onto the first plausible
+story. Write them as this table; a row with an empty middle column is not a hypothesis, sharpen it or
+drop it:
+
+| # | If the cause is … | … then this one change turns the loop green | One-variable test |
+|---|---|---|---|
+
+Test one variable per run (debugger/REPL or targeted boundary logs), never "log everything and grep".
+A result that contradicts every hypothesis sends you back to §3, not to a guess.
@@ ## Red flags — stop, go back to §1
 - "Let me just try…" or "it's probably X" before a red loop exists
+- A list of suspects, guesses, or "theories to test" with no prediction column
```

Trigger: the recorded should-fire miss on "500s after yesterday's deploy" (picked `server-log-analyzer`) did not reproduce on a 2026-09-11 rerun. No description change is proposed from one non-reproducing miss; the scraper "what now?" miss (row 3) is the standing one and is covered by the listing observation above — rerun row 3 after the description gains usage before editing it.

### Limitations

- Baseline subagents still saw the skill listing entry (at most its name and description). They were told not to load it, and no RED rep cited `diagnose`.
- These were dry-run plans for a historical incident. No rep could run a loop. C2 therefore grades whether the plan names a concrete loop before any fix, not whether one was executed.
- The runner graded RED and G3; a separate finisher session (2026-09-11), which ran no rep, graded G1–G2, re-checked G3, and filled this record. Neither wrote the skill.
- All reps shared one scenario (a frontend and package render path). A server-side or flake scenario is a sensible next rerun.
