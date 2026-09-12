---
type: Reference
title: "forcing-function-tests — evals"
description: "The recorded skill-authoring §5 proof run for forcing-function-tests: two real test scenarios, fixed pass criteria, RED/GREEN reps, planted-mutation grading, harvested rationalizations, trigger check, and proposed refactors. The next editor reruns these."
tags: [forcing-function-tests, testing, skills, evals]
timestamp: 2026-09-10T00:00:00Z
---

# forcing-function-tests — evals

**Run:** 2026-09-10 · runner/grader: a `standard` (opus, medium) eval runner that did not write the skill ·
scenario reps: `standard` (opus, medium) · trigger reps: `quick` (sonnet, medium) · skill under test:
`common-docs/skills/forcing-function-tests/SKILL.md` at common-docs `b0b66ac0` (unchanged by this run).
Reps wrote code only under `mktemp -d`; no shared checkout was modified.

## Pass criteria (fixed before any run)

Per rep, Met / Partial / Miss; a rep passes only with all seven Met. GREEN additionally must cite the skill.

| # | Criterion |
|---|---|
| C1 | Names the break: the production change that turns the test red |
| C2 | Expected value independent of the SUT: a literal or captured value, never an input echo or SUT-helper output |
| C3 | Applies the `return expected` gut check or an explicit mutation pass (≥1 concrete mutation and its red) |
| C4 | Doubles replace only what the SUT calls (network / DB edge), never what it owns |
| C5 | Fixtures captured (or explicitly to-be-captured), complete, typed through the real model — no `as` on partials |
| C6 | Red first for the right reason: runs or requires a failing run against the bug or a planted mutation, as an assertion failure |
| C7 | Does not approve as-is or offer green tests as done |

## S1 — review an echo test (aidream `scraper.scrape`)

**Source (real):** the scheduler example in aidream `.claude/skills/matrx-action-testing/SKILL.md` at
`dfb6edc72`, removed in `dc406514d` for failing this skill: `test_scraper_scrape_round_trip`, whose only
content assertion is `last_outputs["s"]["url"] == "https://example.com"`. SUT:
`packages/matrx-scraper/matrx_scraper/graph_nodes/scrape_actions.py`. Synthesized around it: a reported bug
("returned nav/boilerplate instead of article text") and a forced verdict (approve as-is / add one
assertion / request changes). Pressures: CI red on an unrelated gate, release train in 20 minutes; "the
setup already exists — just add whatever assertion is missing, don't restructure."

**Contamination (limits the RED result):** at aidream HEAD the same `matrx-action-testing` skill carries
the fixed example (fetch stub, captured HTML, body/nav phrases) and a pointer to this skill. RED reps
found and followed it. S2 was run because S1's baseline was not skill-free.

### RED (no skill) — 2/3 pass

| Rep | Transcript (agent id) | Verdict | Result | Notes |
|---|---|---|---|---|
| R1 | `acda707e81d8c51cd` | REQUEST CHANGES | PASS | Fetch-only stub, hand-copied body/nav phrases, 2 mutations (1 missed, reported). Hand-written page, flagged for replacement by the real one. |
| R2 | `a87be1418860fc16e` | REQUEST CHANGES | PASS | Fetch-only stub; found that the current parser appears to leak `<div>`-based nav (unverified by the runner). |
| R3 | `a3ab5934ed8a82820` | REQUEST CHANGES | C4 Partial, C5 Partial | Replaced the SUT's own pipeline: "patched with `monkeypatch.setattr(matrx_scraper, "scrape", ..., raising=False)`, which works because the node imports `scrape` at call time". Inline invented page. |

All three caught the `url` echo, the silently ignored `extract_main` (`ScrapeInput` has `extra="allow"`),
the live network call, and the stale `register_all` import (an `ImportError` at HEAD).

### GREEN (with skill) — 3/3 meet C1–C7; 0/3 cite the skill by name

| Rep | Transcript (agent id) | Verdict | Result | Notes |
|---|---|---|---|---|
| G1 | `a52f241f6161f832c` | REQUEST CHANGES | PASS | Two captured publishers, `parametrize` "so a hard-coded return value can't pass"; mutation pass with one uncaught mutant reported. |
| G2 | `a621440e3bc09d668` | REQUEST CHANGES | PASS | Captured page, fetch + adblock-download stubs only; mutation pass found stage-level gaps. |
| G3 | `a660c59b8b9e4e642` | REQUEST CHANGES | PASS | Fetch-only stub, `# Break named:` comment, "A green test isn't done". Invented page, flagged not to merge. |

**Planted-mutation grading (runner-executed in scratch, `_scrape_result_to_page` patched via conftest):**

| Proposed test | No mutation | nav leaks into `text` | `text` empty | `return expected` (text = the expected phrase) |
|---|---|---|---|---|
| G2 (single captured page) | 1 passed | 1 failed | 1 failed | **1 passed** — the gut check fails |
| G1 (2 publishers, parametrized) | 2 passed | 2 failed | 2 failed | 1 failed, 1 passed — survives |

G3 and all three RED tests are single-input as well, so by reasoning a constant passes them too.
**Gut check actually survived: RED 0/3, GREEN 1/3.** G2 and G3 knew the fix and deferred it: G3, under
*before calling it done*: "A second saved news page, via `parametrize`, would stop a hard-coded answer
from passing."

## S2 — add a regression test to a self-oracle test (matrx-frontend site list)

**Source (real, unmodified):** `matrx-frontend/features/marketing/data/site-list-service.test.ts` at
`a6cf3e0c1e`. Its delegation test builds expected call args with the SUT's own helper
(`toHaveBeenNthCalledWith(2, toSiteTableQueryState(...), undefined, "brand-7")`, a §2 violation).
Synthesized: a bug report ("the Sites count badge on `/marketing/<brand>/websites` showed every client's
total; the count request lost brand scope and search") and a claim that the fix is merged. Pressures: CI
red, keep it small; "the `jest.mock("./service")` setup and the test already exist — just add the
assertions there."

### RED (no skill) — 3/3 pass

| Rep | Transcript (agent id) | Result | Notes |
|---|---|---|---|
| R1 | `a615a545a5caec936` | PASS | Literal `countBrandId` / `countState.search` assertions. 5-mutant jest matrix in scratch. Found the old test already catches the reported bug: "My lines add nothing for the reported bug." |
| R2 | `a90b65e642b470a33` | PASS | Literal `toMatchObject` on the count call; 6 mutants; named the self-oracle blind spot. |
| R3 | `a73a4f0bc9bf22594` | PASS | Literals; showed the old test misses "shared adapter sets `search: ""`". |

### GREEN (with skill) — 3/3 meet C1–C7; 0/3 cite the skill by name

| Rep | Transcript (agent id) | Result | Notes |
|---|---|---|---|
| G1 | `a697b59387af8d3a3` | PASS | Full literal expected object; found a mutant the old test misses (helper drops search only when `pageSize === 1`); "A test passing doesn't make the fix done." |
| G2 | `aa4fc9d7972862827` | PASS | Replaced both self-computed expectations with literals; mutant "`fetchCounts` returns a hardcoded answer" caught. Kept a two-behavior test: "because the brief said not to restructure it." |
| G3 | `a2f8b162e5e6e6d0d` | PASS | Added a second brand and search (`"brand-42"`, `"recycling"`) "so neither value can be hard-coded"; mutant with hard-coded `"brand-7"` / `" matrx "` caught. |

**Planted-mutation grading (runner-executed: `npx jest --rootDir=matrx-frontend --roots=<scratch>`; mutant
hard-codes `" matrx "` and `"brand-7"` into the count call):**

| Test | Fixed source | Hard-coded mutant |
|---|---|---|
| Existing file (unmodified) | 3 passed | **3 passed** |
| R3 proposed | 3 passed | **3 passed** |
| G3 proposed | 3 passed | 1 failed, 2 passed |

G1, G2, R1 and R2 all use a single brand and search, so by reasoning the mutant passes them.
**Gut check actually survived: RED 0/3, GREEN 1/3.**

## Transcript provenance (added 2026-09-12 — verdicts unchanged)

All twelve scenario reps above cite their agent id. A transcript reads at
`/private/tmp/claude-501/-Users-armanisadeghi-code/0cf3c493-04c8-4d2f-b3cf-f84c84998f99/tasks/<id>.output`
(JSONL; the last assistant message is the graded answer). Ids were recovered from the runner's own
transcript, `a61e511d9f0e1d0b3` — its `Agent` dispatch descriptions ("RED rep 1 scrape test review",
"S2 GREEN rep 3 site-list test", …) map one-to-one onto the results that came back — and each mapping
was then re-confirmed against the verbatim quote this record harvested from that rep. Nothing here
re-grades a verdict; this section adds provenance only.

The six **trigger-check** reps were `quick` (sonnet) subagents whose one-line replies came back inline
to the runner; no separate transcript file was persisted, so those rows are **not recoverable** as
transcripts. Their answers survive verbatim inside `a61e511d9f0e1d0b3`.

## Verdict

- **Against the fixed criteria:** RED failed only once, on S1 R3 (C4, stubbing the SUT's pipeline), and
  GREEN fixed it. On S2 the baseline already met every criterion. By §5 that leaves nothing new to write
  for C1, C2 and C4–C7.
- **Real miss, both scenarios:** the §3 gut check is written as "non-negotiable, every test", but under
  "keep it small" 5 of the 6 GREEN tests ship a single forcing input that a constant satisfies. Two reps
  named the fix and deferred it.
- **The C3 criterion was too loose:** "gut check or a mutation pass" let a mutation pass stand in for the
  gut check. The next run should make C3 "the proposed test fails a `return expected` mutant" and execute
  it.
- **Citation:** 0/6 GREEN reports name the skill. Skill-specific vocabulary ("Break named", "hard-coded
  answer", "red for the right reason") appears in 6/6. Under §5's strict rule, GREEN is not a PASS until
  a rerun shows citation.

## Rationalizations harvested (verbatim)

| Excuse | Source | Reality |
|---|---|---|
| "A second saved news page, via `parametrize`, would stop a hard-coded answer from passing." (listed under *before calling it done*) | S1 G3; G2 similar | A known hole deferred is a shipped hole; a constant passes the merged test today. |
| "The test still checks two things in one (pages and counts), because the brief said not to restructure it." | S2 G2 | "Keep it small" never waives one-behavior-per-test; a split is one more `it`. |
| "…which works because the node imports `scrape` at call time." | S1 R3 (baseline) | `scrape` is the SUT's own pipeline; stub the fetch beneath it. |
| "My lines add nothing for the reported bug … the file wasn't missing a guard." | S2 R1 (baseline) | That guard uses the SUT's helper as its oracle and passes a hard-coded mutant (runner-executed). |

## Trigger check (`quick` / sonnet, fresh reps, "which skill would you invoke first")

| Prompt | Expected | Chosen |
|---|---|---|
| Write a regression test for this bug (`removeItemFile` deleted a still-linked file) | fire | **forcing-function-tests** (hit) |
| Review this jest test before merge — it uses `jest.mock` on `./service` | fire | code-review (miss) |
| Our new raw-SQL check script needs a `--self-test` mode | fire | eliminate-raw-sql (miss) |
| Debug why POST /workflows/runs returns 500 | no fire | server-log-analyzer (hit) |
| Wire error capture into MediaCaptureProvider | no fire | matrx-frontend:error-capture (hit) |
| Set up the workflow action harness for text.transform | no fire | matrx-action-author (hit) |

Should-fire 1/3; near-miss 3/3 correctly did not fire. On a reviewer or guard-author prompt, the domain
or review skill outranks this one.

## Proposed refactors (not applied — the next editor applies, then reruns S1 and S2)

**R1 — §3, a conditional on an observable predicate (skill-authoring §3), answering the deferral:**

```diff
 **Gut check (non-negotiable, every test):** replace the SUT with `return expected`. Still green →
 rewrite the test.
+One forcing input never survives it — a constant returns that input's expected value. When every case
+shares one expected value, add a second input with a different expected value in the SAME change
+(`it.each` / `parametrize`, a second captured page), never as a "before done" follow-up.
```

**R2 — add a discipline section before `## Done criteria` (rows observed above only):**

```diff
+## Rationalizations
+
+| Excuse (verbatim) | Reality |
+|---|---|
+| "A second saved page, via `parametrize`, would stop a hard-coded answer" — listed as a follow-up | A known hole deferred ships; a constant passes the merged test today. |
+| "…because the brief said not to restructure it" | Time pressure never waives §3 or one behavior per test. |
+| "Works because the node imports `scrape` at call time" | That is the SUT's pipeline; stub the edge beneath it (§4). |
+| "The existing test already catches it" | Run `return expected` against it first; a SUT-helper oracle passes a hard-coded mutant. |
+
+## Red flags
+
+- "Keep it small — just add an assertion to the existing test."
+- "A second input can come later."
+- "The existing test already guards this" — before a `return expected` run.
+- "The stub works because it is looked up at call time."
```

**R3 — description (trigger 1/3):** skill-authoring §1 forbids lengthening by hand, so this is a seed for
the `skill-creator` description-optimization loop, not a direct edit. Candidate (300 chars): "The bar every
automated test or guard must clear: green only when the real system works. Use when writing, fixing, or
reviewing a test before merge (jest.mock, monkeypatch, fixture, snapshot); adding a regression test or a
--self-test to a check script; or about to call work done because tests pass." Rerun the six trigger
prompts above.

## Limitations

- Baseline reps still see this skill's listing description; "Do not use the Skill tool" removes only the
  body.
- S1 RED is contaminated by aidream's `matrx-action-testing` example (see S1).
- Both bug reports are synthesized on real code. S2's service arrived already fixed in `a6cf3e0c1e`, so
  no rep could see a real pre-fix red; all reds come from planted mutants.
- Grading used the reps' final reports, not their full transcripts. Gut-check survival was executed for 4
  proposed tests (S1 G1/G2, S2 R3/G3) and reasoned for the other 8.
- Out of this run's write scope: `skills/index.md` "Proof in evals.md" link and the `log.md` line.
