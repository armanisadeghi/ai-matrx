---
type: Reference
title: "campaign-pattern — prove-it record"
description: "Regression record for the campaign-pattern skill: the plan-only scenario, lanes, RED/GREEN results per round, trigger checks, and the form changes the reps forced. Rerun before changing the skill."
tags: [meta, skills, evals, doctrine, campaign]
timestamp: 2026-09-10T00:00:00Z
---

# campaign-pattern — prove-it record

## 2026-09-10 — benchmark rewrite (mattpocock/skills + obra/superpowers harvest)

**Change.** Part 3 lifecycle (ten gates with exit criteria) added; Part 2 amended with the closed
four-item stop list, the exhaustive rulings-at-close report, the post-compaction resume rule, the
builder-floor/verifier-bar split, the anti-self-answer clause, fail-fast before fan-out, the ratchet,
register-as-index with fog and out-of-scope lanes, and the named five-pass verification battery;
a "Deliberately not adopted" block records the rejected mechanisms. Description lead changed from
"Use before" to "Use when" (lint recipe).

**Scenario (synthesized from reality).** `PROMPT.md`: a fresh coordinator receives the founding
HR-domain mandate verbatim (12.5 k chars) with four real pressures — an owner running ~20 sessions
wanting near-zero involvement, two prior rollouts that struggled, usage-limit kills mid-flight, and
a shared checkout other agents commit into. Deliverable: a ≤70-line `plan.md` answering six
questions (first five actions with lane+model; phases/gates; what "done" means; what reaches the
owner; what stops a lane; how the campaign survives losing the session). Plan only — no repo access,
no questions to the owner. Scenario files live in the eval scratch dir of the authoring session; the
prompt and mandate are reproducible from `projects/hr-domain/` (the mandate is its founding message).

**Lane for every run:** `standard` (opus, medium), fresh subagent, zero authorship, reads only the
skill under test plus the method skills it points at. **Grader:** `quick` (sonnet), zero authorship,
rubric-only (never read the skill), ten criteria C1–C10 + three checks (sections cited; work routed
to the owner as "chips"; invented stop conditions). The author never graded a run.

### Round 1 — RED (old skill, `SKILL-before.md`) vs GREEN (rewrite)

| Criterion | red-1 | red-2 | red-3 | green-1 | green-2 | green-3 |
|---|---|---|---|---|---|---|
| C1 parallel file-writing discovery, lane+model named | PASS | PASS | PASS | PASS | PASS | PASS |
| C2 zero-authorship attack before commitment, adjudicated | PASS | PASS | PASS | PASS | PASS | PASS |
| C3 done = zero-authorship, deployed, real data; manufactured-data tests are defects | PASS | PASS | PASS | PASS | PASS | PARTIAL |
| C4 register + rulings ledger + succession brief, pushed | PASS | PASS | PASS | PASS | PASS | PASS |
| C5 freeze gate AND first vertical before lanes merge | PARTIAL | PARTIAL | PARTIAL | PASS | PASS | PASS |
| C6 shared inputs verified before fan-out (fail-fast) | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C7 closed four-item stop list | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C8 rulings reported exhaustively at close; never answers for the owner | FAIL | FAIL | FAIL | PASS | PASS | PASS |
| C9 resume from register+git+origin; Done rows never re-run; liveness by work products | PARTIAL | PARTIAL | PARTIAL | PASS | PASS | PASS |
| C10 five-pass verification battery named | FAIL | FAIL | FAIL | PASS | PARTIAL | FAIL |
| **PASS / 10** | **4** | **4** | **4** | **10** | **9** | **8** |
| "chips he can fire" routed to the owner (delegate-down violation) | yes | yes | yes | no | no | no |

**Rationalizations harvested (RED).** All three RED reps invented their own stop list around a
"human-only gate" (CAPTCHA/MFA) — one rep made it the *sole* stop, another added "a frozen contract
that is wrong" and "an out-of-lane file" — because the old text said only "a running lane never waits
on a human" without closing the list. All three froze contracts but none proved a first vertical
before merging lanes. None reported rulings at close; none said finished rows are never re-run. All
three offered the owner "chips he can fire in one click" — the delegate-down law was not in the body.

**Refactor 1 (form, not words).** The three GREEN reps disagreed on C3 and C10: the battery lived only
in a lifecycle-table cell, and "manufactured data = defect" only inside the Part 1 §4 quote. Both were
moved into Part 2 §3 as first-class text (the battery as a named five-item list).

### Round 2 — GREEN after refactor 1

| Criterion | green-4 | green-5 | green-6 |
|---|---|---|---|
| C1–C2 | PASS | PASS | PASS |
| C3 manufactured-data-is-defect | PASS | PASS | PASS |
| C4 register + ledger + brief | PASS | PARTIAL (ledger folded into the register — allowed by §1 index-not-store; rubric stricter than the skill) | PASS |
| C5 freeze + first vertical | PASS | PASS | PARTIAL |
| C6–C7, C9 | PASS | PASS | PASS |
| C8 rulings at close; anti-self-answer | PASS | PASS | PARTIAL |
| C10 battery named | PASS | PASS | FAIL — wrote "all five battery passes run", the exact abbreviated phrase of table row 8 |
| **PASS / 10** | **10** | **9** | **7** |

**Refactor 2 (form).** The weakest rep copied the lifecycle table's abbreviation verbatim, so the
table cell itself now carries the five pass names and the words "the plan names each pass".

### Round 3 — GREEN after refactor 2 (final)

| Criterion | green-7 | green-8 | green-9 |
|---|---|---|---|
| C1–C4, C6–C10 | PASS | PASS | PASS |
| C5 freeze + first vertical | PARTIAL | PARTIAL | PARTIAL |
| **PASS / 10** | **9** | **9** | **9** |
| invented stop conditions / chips to owner | none / no | none / no | none / no |

**All three reps agree on every criterion — the wording is binding.** The shared PARTIAL on C5 is the
grader wanting "remaining lanes wait for the first vertical before merging" restated in prose; every
rep sequences Freeze → Core → Fan-out → First vertical (G2) → Verification correctly in its gate table.
Accepted as-is: the gate order is the mechanism. Net result of the rewrite: **RED 4/4/4 → GREEN 9/9/9
with no rep-to-rep disagreement**, versus the old skill's three mutually incompatible stop lists.

### Trigger check (description changed) — `quick` (sonnet), skill installed, fresh subagent each

| Prompt | Expected | Fired |
|---|---|---|
| "Build a full Payroll module across aidream and matrx-frontend, spec-first, agents do the work, I stay hands-off — where do we start?" | campaign-pattern | **campaign-pattern** |
| "Take over coordination of the CRM domain build that died mid fan-out; get oriented and resume it." | campaign-pattern | **campaign-pattern** |
| "Write the launch prompt for a new session to kick off the Recruiting domain as an autonomous multi-agent build, like HR." | campaign-pattern | **campaign-pattern** |
| "Add an 'Export to CSV' button to the HR incidents list page." (near-miss) | build-sub-feature | **build-sub-feature** |
| "The aidream deploy train didn't ship the last two commits — figure out why." (near-miss) | diagnose | **diagnose** |
| "Grill me on the open decisions in the SEO keyword register." (near-miss) | grilling | **grilling** |

6 / 6.

**How to rerun.** Same prompt and mandate, three fresh `standard` reps against the current skill, one
`quick` grader with the rubric above; a rep that omits any of C5–C10 or invents a stop condition is a
regression. Grading and rep outputs from this record are in the authoring session's scratch dir; the
rubric text is reproduced in the C1–C10 rows above.
