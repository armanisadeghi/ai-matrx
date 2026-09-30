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
(tooltips state only verified facts); a rationalization row and a red flag. Rerun of E1 after
that edit: pending — next editor runs it.

## Detector self-test

`pnpm check:interface-text:self-test` (matrx-frontend) — all five rules fire on the kg-cost
shape and the fixed shape is clean. Verified 2026-09-30.
