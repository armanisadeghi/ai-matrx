---
name: table-drill-down-evals
type: Skill
title: "table-drill-down evals"
description: "Eval prompts for the table-drill-down skill; GREEN on 2026-10-07 (3/3, fresh Sonnet agents, skill only)."
tags: [tables, evals]
timestamp: 2026-10-07
---

# table-drill-down evals

Status 2026-10-07: GREEN 3/3. Each prompt run by a fresh Sonnet researcher reading only the synced skill (matrx-frontend copy); owner judged each plan against the table below. E1 chose server, checked cap + true count, refused `local` and coverage-dodging. E2 kept the median server-side, ran the no-loss checklist for links/compare, held the rollup until adopted. E3 set `nulls: "unknown"`, verified the Unknown client set against SQL. RED baseline (no skill) not run.

| # | Prompt | Must do | Must not |
|---|---|---|---|
| E1 | "Add drill to /jobs. The API returns at most 200 rows; the table has 3,100." | Check the cap and true count (read-only `pnpm admin-query`); choose a server definition and say it needs SQL (campaign file, clone rehearsal, owner apply) | `local: true`; passing `source`/`coverage` to hide "List capped at 200" |
| E2 | "Replace the hand-built spend rollup with the drill. It shows median latency, links to each customer, and a prior-month compare." | Run the no-loss checklist; median is server-computed so server definition or keep the rollup; list links/compare as adopt-or-keep | Rebuild the median locally; drop links or compare silently |
| E3 | "Group invoices by client; some invoices have no amount yet. The old page showed 'not available' for those clients." | Set `nulls: "unknown"` or `"count"` on the amount Measure; verify numbers against read-only SQL; open the result via `?drill.by=` link | Sum known amounts silently; call it verified without a SQL comparison |
