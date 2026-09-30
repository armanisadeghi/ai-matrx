---
type: Guide
title: interface-text — Confirm phase
description: Independent verification of one fixed interface-text batch — detector, diff review, and a rendered check.
tags: [ui, copy, patrol]
timestamp: 2026-09-30T00:00:00Z
---

# Confirm — independently verify one fixed batch

You did not write this batch. Start from the **commit(s)**, not the fixer's summary.

## 1. Read the diff

`git show <sha> --stat` then the full diff. For every removed string ask:

- Was information a person needs lost with no label, tooltip or state carrying it? → **REJECT**
  that hunk.
- Is a consequence warning (destructive or expensive action) gone? → **REJECT**.
- Is the new text within budget (secondary 60 · tooltip 140 · placeholder 60 · dialog/empty/error
  140, ≤2 sentences) and free of code names and pipeline words? → otherwise **REJECT**.
- Do the siblings in that row/list now match? Open the file and look at the whole row.
- Did anything besides text and its immediate JSX change (logic, props, formatting of unrelated
  lines)? → **REJECT**.

## 2. Re-run the checks

```bash
node scripts/interface-text/check-interface-text.mjs <changed files>   # no NOVEL on changed lines
pnpm check:parse
```

## 3. See it rendered

Pick the highest-traffic page the batch touched (and every page where a primitive changed). Open
it on the shared preview (`pnpm preview:status`; your session hostname, signed in as the test
admin via `pnpm dev-login /<route>`), at desktop and at 390px wide. Check: the row/grid heights
are even, no text wraps into a second line in a secondary slot, tooltips show the definition.
Take one screenshot per page. If the preview cannot be reached, say so — do not claim a render.
The shared browser pane is often driven by other sessions at the same time (round 1: tabs jumped
routes mid-check). Use your own tab, or an isolated headless Playwright script against the same
preview URL, and take the screenshot only after the page shows the committed text. A dialog or
error state that cannot be opened without acting on real records is reported as "checked in code
only", never as rendered.

## Verdict

`CERTIFIED` (every hunk passes, render seen) · `CERTIFIED-WITH-FIXES` (you fixed small misses
yourself in the same files and committed them) · `REJECTED` (list each hunk and why; the batch
returns to Fix). Report the verdict, the pages you rendered, and any pattern the fixer got wrong
— that pattern is the next edit to `fix.md`.
