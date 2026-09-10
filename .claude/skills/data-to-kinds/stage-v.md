---
type: Reference
title: "data-to-kinds — Stage V (Verify)"
description: "The Stage V (Verify) four-leg proof that stamps maturity verified; read it when you are Stage V of a run. Companion to the data-to-kinds skill."
tags: [data-to-kinds, skills, stage-v]
timestamp: 2026-09-10T00:00:00Z
---

# Stage V — Verify (the four legs; stamps `verified`)

Per kind, prove: **registered** (row active, example `validation_status='passed'`, edges
present) · **typed** (`.gen.ts` exists, `pnpm check:kind-types` clean) · **rendered** (component
resolves via the production route path; admin preview renders the canonical example) ·
**exercised** (a REAL payload from the live endpoint rendered end-to-end — the demo, in the
browser). Only when all four hold, set `metadata.maturity='verified'` (SQL; the decorator cannot)
and record the evidence (URL, SQL, date) in the ledger. Board:
`select coalesce(metadata->>'maturity','(untiered)'), count(*) from content_ir.kind_definition
where deleted_at is null group by 1;`.
