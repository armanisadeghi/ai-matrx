---
type: Reference
title: interface-text — proof record
description: RED/GREEN runs proving the interface-text skill changes agent behavior on the real 2026-09-30 kg-cost incident; rerun on every edit.
tags: [ui, copy, evals]
timestamp: 2026-09-30T00:00:00Z
---

# interface-text — proof record

## Scenario E1 — the kg-cost Batch savings tile (real incident)

Source: matrx-frontend commit `c35e1f946e` (2026-09-14) put its own commit message into the
"Batch savings (7d)" hint on `/administration/knowledge/kg-cost`; Arman flagged it 2026-09-30.
Prompt: the pre-change tile code (`git show c35e1f946e^:features/administration/kg-cost/components/KgCostDashboard.tsx`,
lines 160–290) plus the commit's intent — "make the tile honest about what it now shows; fix
anything else a reviewer would flag" — answer-only, no repo edits. Pressures: "a screen never
lies" review comment, mid-commit, consistency with Platform Spend. Lane: `standard` (opus), 3 reps.

### RED — current guidance, no skill (2026-09-30)

| Rep | Transcript | Primitive | Visible hint text | Row parity |
|---|---|---|---|---|
| 1 | agent `aefb3629438ea8a01` | kept hand-rolled tile | "{pct} below live price · {n} items · last 7 days"; "Not reported by the server." | 2 of 6 tiles hinted |
| 2 | agent `a97a44610eafe8370` | kept hand-rolled tile ("would make one page look two ways") | "48.7% below live price · 1,204 completed items · actual tokens at live rate minus the batch bill" (~95 chars, formula on screen); "Not reported by the backend" | 2 of 6 |
| 3 | agent `a9365e4735de85f2f` | kept hand-rolled tile ("the shared tile cuts off long hints") | "Same tokens at live price, minus the batch bill · 50% below live price · 1,204 completed items"; kept "…Backfill brings this up to 100%."; "Not reported by the backend yet." | 2 of 6 |

**RED = 3/3 fail**: all three refused the budget-enforcing primitive, two put the formula on
screen, all used pipeline words, none considered row parity. Rationalizations harvested
verbatim into SKILL.md § Rationalizations.

### GREEN — with SKILL.md (2026-09-30)

| Rep | Transcript | Primitive | Visible text | Row parity | Cited skill |
|---|---|---|---|---|---|
| 1 | agent `aad465a94cba61712` | official `KpiTile`/`KpiGrid` | none; definitions in tooltips | even | yes (ran detector: 0) |
| 2 | agent `a3460fabe013d84ee` | official | none; two tooltips | even | yes (ran detector: 0) |
| 3 | agent `a89571c3ce0ee9186` | official | none; tooltips on all six | even | yes (ran detector: 0) |

**GREEN = 3/3 comply** on the visible-text rules. **REFACTOR:** reps 1 and 3 added a tooltip
to every tile "so the row matches" and invented two definitions ("since midnight", "today's
budget") the code does not prove. Fix: card rule 4 limits parity to visible slots; new rule 6
(tooltips state only verified facts); a rationalization row and a red flag.

**Rerun after the edit — 3/3 comply, no invented definitions:** agent `a16d3730cb70b3314`
checked every tooltip against `fn_kg_cost_summary` and found "Spend today" is a rolling 24h
window (label fixed in the product); `aa12f0433634a8dd4` tooltips only on the two tiles that
needed them; `a6c4d1dc30c1f46af` sourced its tooltip from the field's doc comment.

## Scenario E2 — Discover phase on real admin code (P14 rounds 1–2, 2026-09-30)

Slice: `app/(admin)`, `features/admin`, `features/administration` (855 candidates → 536 units).

| Run | Lane | Transcript | Result |
|---|---|---|---|
| R1 slices 1–6 (~143 candidates each) | `quick` haiku | agents `abcd8aaeab5f689e7`, `a8a1ecef59d8ead03`, `a74fef81edc4f9a09`, `aeb955c7efa7c2a1b`, `aef6167881ce2c5aa`, `a498a391b5464d4b3` | **FAIL 6/6** — 10–15 tool calls for ~143 candidates: rule names copied as verdicts (an invented `implementation-leak` verdict), `proposed` placeholders ("rewrite shorter – target ≤60 chars"), duplicate lines per string. → units (`--units`), `validate-discover.mjs` (proof-of-reading `context`, exact text, budgets). |
| R2 pilot batches 01, 07 (45 units) | `quick` haiku + validator | agents `a1dceea56d8e0e029`, `a8f474b69cbcfca08` | **FAIL** — 01 stopped with 17 validator problems; 07 passed the validator by cutting originals at 60 chars mid-sentence (36/45). → validator rejects prefixes and mid-phrase endings; Discover lane moved to sonnet. |

| R2 batches 01–13 (536 units) | `quick` sonnet + validator | agents `a264af32600e9f707` (07 pilot), `a1a388554f398adb6`, `a346a561da343d97e`, `a63ce00bc39aa798d`, `abf7e05db2a19e89b`, `add110e771f8065de`, `a37b0756cf33cb60b`, `ae2a1fabfd3393afb`, `a92f29ea64b39f0c9`, `a7564615ce64c42b1`, `a1bbd2423ee78fc84`, `a510ce6151b481eea`, `a516e667c5d6617d1` | **PASS 13/13** validator exit 0; rewrites keep the point. Flagged by the agents themselves: dialog text scored against the 60 budget (→ detector `consequence` hosts), component-gallery docs (→ exempt). |

## Detector self-test

`pnpm check:interface-text:self-test` (matrx-frontend) — all five rules fire on the kg-cost
shape and the fixed shape is clean. Verified 2026-09-30.
