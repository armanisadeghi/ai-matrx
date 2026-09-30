---
type: Guide
title: interface-text — Review phase
description: Accept or correct Discover's verdicts, find primitive-level fixes, cut the work into fix batches, and decide what goes to Arman.
tags: [ui, copy, patrol]
timestamp: 2026-09-30T00:00:00Z
---

# Review — turn classifications into fix batches

Input: one or more Discover output files (JSONL). Output: fix batches plus a short list for
Arman (usually empty). You do not edit source files.

## 1. Spot-check Discover before trusting it

Open at least 1 in 5 findings (all `unsure`, all `legit` on NOVEL severity, every `primitive`).
If more than 1 in 5 of your checks overturn Discover's verdict, re-run that slice's Discover
with the corrections as examples; do not patch around it. Record every overturn pattern — it is
the next edit to `discover.md`.

Common Discover mistakes to look for:
- `legit` on a dialog description that is really a page description in a dialog.
- `too-long` where the text is author-facing (a rewrite would keep a formula on screen).
- A proposal that is still over budget, or that keeps a pipeline word ("server", "backend").
- `asymmetric` fixed by adding text to every sibling when deleting the outlier is cleaner.

## 2. Fix the class before the instances

Group by component. When one component carries many findings (a local `KpiTile`, `SettingRow`,
`Field`, `SectionHeader`…), the batch is **the component**: clamp its secondary slot to one line
with a tooltip, or replace it with the `components/official/*` primitive, then fix the strings.
A primitive change is a `standard`-lane batch and names every caller it affects.

## 3. Cut batches

- ≤ 15 files per batch, grouped by feature so one fixer sees whole rows and pages.
- Each batch lists its findings with the reviewed verdict and exact replacement text.
- Mechanical batches (deletes, page descriptions, pure shortenings) → `quick` lane.
  Batches with primitive swaps, tooltips needing new props, or sibling re-balancing → `standard`.

## 4. What goes to Arman — almost nothing

Only a finding where deleting the text would remove information a person needs **and** no
label, tooltip, or state design can carry it. State it as a decision with your recommendation
(`ask-arman` skill). Taste questions ("is this sentence nice?") are yours — the doctrine decides.

## Done when

Every Discover line is in exactly one batch or marked `legit`/`no-fix` with a reason, and your
final message lists the batches (id, lane, files, finding count) and any overturn patterns.
