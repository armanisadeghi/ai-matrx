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
- A rewrite of a unit marked `owner_words` (forbidden — see §4).
- `legit` on a dialog description that is really a page description in a dialog.
- `too-long` where the text is author-facing (a rewrite would keep a formula on screen).
- A proposal that is still over budget, or that keeps a pipeline word ("server", "backend").
- `asymmetric` fixed by adding text to every sibling when deleting the outlier is cleaner.
- A warning, drift, or error banner deleted as "author-facing". It is **state**: keep one short
  line naming the problem, with its remedy as a control (or a short command when the audience is
  operators). Delete only the explanation around it.
- A rewrite that met a 60-char budget by dropping a needed fact ("can be set once", "saving the
  same key restores it") when the text is dialog/confirm copy with a 140-char consequence budget.
- Descriptions on documentation surfaces (the component gallery, the feature-docs viewer) — their
  text is the content; the detector exempts them.

## 2. Fix the class before the instances

Group by component. When one component carries many findings (a local `KpiTile`, `SettingRow`,
`Field`, `SectionHeader`…), the batch is **the component**: clamp its secondary slot to one line
with a tooltip, or replace it with the `components/official/*` primitive, then fix the strings.
A primitive change is a `standard`-lane batch and names every caller it affects.

## 3. Cut batches

Write the batches as JSON the Fix agents consume directly:

```json
{"batches":[{"id":"r1-b1","lane":"quick","files":["…"],"items":[{"id":"file:line","file":"…","line":123,"action":"replace|delete|tooltip|replace+tooltip|keep","new_text":"…","tooltip":"…","comment":"…","note":"≤15 words"}]}],"overturns":["…"],"for_arman":[]}
```


- ≤ 15 files per batch, grouped by feature so one fixer sees whole rows and pages.
- Each batch lists its findings with the reviewed verdict and exact replacement text.
- Mechanical batches (deletes, page descriptions, pure shortenings) → `quick` lane.
  Batches with primitive swaps, tooltips needing new props, or sibling re-balancing → `standard`.

## 4. Arman's own words — never yours to judge

Arman, 2026-09-30: AI judges the value of text badly and "anything written by ai will always sound
'better' than the real, human guidance". Round 1 shortened his own ruling in a placeholder and it
was restored. So:
- A unit with `owner_words`: read its `context`. If it is his guidance → add it to
  `scripts/interface-text/keep.json` (text, file, reason, `by: "check-owner-words"`) and change
  nothing. If he pasted it only to complain about it → it rejoins the sweep; cite the context.
- Every deletion and rewrite reaches his **review page** (page link, before → after, keep /
  restore / note). His `restore` and `keep` verdicts go into `keep.json` and the code is reverted;
  his notes become rows in this file's mistake list. That page is how the patterns are learned.

## 5. What else goes to Arman — almost nothing

Only a finding where deleting the text would remove information a person needs **and** no
label, tooltip, or state design can carry it. State it as a decision with your recommendation
(`ask-arman` skill). Taste questions ("is this sentence nice?") are yours — the doctrine decides.

## Done when

`node scripts/interface-text/validate-discover.mjs <units.json> <review-out.json>` exits 0 (round 2:
all three reviewers shipped over-budget replacements — 31 — that the fixers then applied). Every
Discover line is in exactly one batch or marked `legit`/`no-fix` with a reason, and your
final message lists the batches (id, lane, files, finding count) and any overturn patterns.
