---
type: Guide
title: interface-text — Discover phase
description: Run the interface-text detector on one slice and classify every candidate into one verdict with a proposed replacement.
tags: [ui, copy, patrol]
timestamp: 2026-09-30T00:00:00Z
---

# Discover — classify every unit in your slice

You were given a **units file** (or a slice to build one from) and an **output path**. You do
not edit any source file. Your output is one JSON line per unit, and you are done only when
the validator passes.

## 1. Get your units

```bash
# matrx-frontend (another repo: node ../matrx-frontend/scripts/interface-text/check-interface-text.mjs --root=. …)
node scripts/interface-text/check-interface-text.mjs <slice paths...> --units > <run>/units.json
```

A **unit** is one rendered string (file + line) with every rule that fired on it: `id`, `file`,
`line`, `severity` (1 = NOVEL, 2 = long), `rules`, `slot` (its budget kind), `chars`, `text`.
`…` inside `text` marks a dynamic value. A batch is at most ~45 units.

## 2. Open the file at every unit — this is the job

Read about 30 lines around `line`. You need three facts: **what slot** the text renders in (tile
hint, card description, dialog description, table cell, tooltip, page header…), **what its
siblings carry** (the other tiles/rows/fields next to it), and **who the sentence is for**. The
validator checks that you did: every line carries a verbatim `context` snippet from within 20
lines of the unit. Mapping the detector's rule name to a verdict without reading is the known
failure of this phase (round 1, 2026-09-30: 3 of 3 agents did it).

## 3. Pick exactly one verdict
| Verdict | When | Proposed fix |
|---|---|---|
| `author-facing` | Explains provenance, a formula, code/table/function names, what changed, what is not built, or points to another page for justification | Delete from UI; the fact moves to a code comment |
| `restates-obvious` | Repeats the label or title, or says what any user can see ("Manage your settings here") | Delete |
| `page-description` | A sentence directly under a page, section or card title | Delete |
| `too-long` | Useful to the user, but over its budget or more than one sentence | Rewrite inside the budget (give the exact new text) |
| `definition-to-tooltip` | A definition some users need, sitting inline | Move to the tooltip slot, one sentence ≤140 chars (give it) |
| `asymmetric` | One sibling has text the others lack, or lengths differ wildly | Remove the outlier, or give the exact parallel text for every sibling |
| `primitive` | The component itself lets secondary text grow (no `truncate`/`line-clamp`), or it hand-rolls a copy of a `components/official/*` primitive | Name the primitive to adopt or the one-line clamp to add |
| `legit` | Confirm-dialog consequence ≤2 sentences, empty/error state ≤2 sentences, the product's own content (lesson, help article, legal text, AI output, user data), `(public)` marketing | None |
| `unsure` | You cannot tell which of the above | None — say what you could not tell |

Budgets: secondary 60 · tooltip 140 · placeholder 60 · dialog/empty/error 140 (≤2 sentences).
Count your proposed text; a proposal over budget is itself a defect.

## 4. Write the output

One line per unit, to the output path:

```json
{"id":"features/x/Y.tsx:279","verdict":"author-facing","slot":"KpiTile hint","siblings":"6 tiles, 1 other has a hint","context":"label=\"Batch savings (7d)\"","proposed":"(delete; formula → code comment)","tooltip":"Live-rate cost of the same tokens, minus the batch bill.","why":"commit message pasted into the tile"}
```

- `proposed` is the **exact new string**, `(delete)`, `(delete; <where the fact goes>)`, or
  `(none)` for `legit`/`unsure`. Never an instruction ("rewrite shorter"). A rewrite fits the
  unit's `slot` budget; count it.
- `tooltip` only when the verdict moves text there, and only a definition the code proves.
- `context` is ≥20 characters copied verbatim from the file near the unit.
- `why` ≤ 12 words.

## 5. Validate — loop until it passes

```bash
node scripts/interface-text/validate-discover.mjs <run>/units.json <output.jsonl>
```

Fix every line it names and run it again.

## Done when

The validator exits 0. Your final message reports the counts per verdict and the three worst
examples (id + text). Nothing else.
