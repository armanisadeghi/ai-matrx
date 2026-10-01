---
type: Reference
title: "safety-net — proof record"
description: "The RED/GREEN record skill-authoring §5 requires. Not yet run: the first real change that uses this skill is its eval, and this file records it."
tags: [testing, skill-eval, safety-net]
timestamp: 2026-10-01T00:00:00Z
---

# safety-net — evals

**Status: PROVEN IN ONE REAL USE (2026-10-01), formal 3-rep RED/GREEN still owed.** Written 2026-10-01 from Arman's brief (the client-side chat migration net) and
his correction the same day that these are real tests run by an agent, never automated ones.

The scenario this skill guards is a whole change, so a synthetic three-rep RED/GREEN run would cost
more than a real use. **The first real change dispatched with "use safety-net" is the eval.** The
owner of that change records here, per rep, with agent ids or transcript paths:

| Date | Change | Lane | Without skill (RED) — did the agent write tests first, dispatch a blind runner, plant a fault? | With skill (GREEN) — same three | Rationalizations harvested |
|---|---|---|---|---|---|
| 2026-10-01 | chat agent-runner real tests (PB-01…PB-08) before the package move; cutover net review | standard/opus builders, quick/sonnet runners, Fable owner | RED (observed, not a dispatched rep): the cutover net's own lanes wrote scripted walks authored by the builders of the features they check, ran them themselves, and no test was blind; the owner's own words: agents write tests after the change and tests they know will pass | GREEN: eight playbooks written first with sealed checks; fresh Sonnet runners given STEPS only; run 2 of PB-01 produced the exact line across 3 providers and FAILED honestly on two real defects; ~40 defects found in dry runs and runs (see operations/real-tests/chat/LEDGER.md), incl. the markdown-attachment body never reaching the model and a declined write landed through a server tool | "The existing test already covers this" (none); "I graded my own dry run" (builders repeatedly reported DONE_WITH_CONCERNS and did not grade — compliant); grader's own lapse: ran a fault proof on a dirty start state → rule added to SKILL.md §4 |

Trigger check (3 should-fire, 3 near-miss prompts) is also pending and recorded here.
