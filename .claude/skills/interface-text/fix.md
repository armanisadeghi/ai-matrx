---
type: Guide
title: interface-text — Fix phase
description: Apply one reviewed batch of interface-text fixes safely in a shared checkout.
tags: [ui, copy, patrol]
timestamp: 2026-09-30T00:00:00Z
---

# Fix — apply one reviewed batch

You were given one batch: files, findings, and the exact replacement for each. You change
**interface text and the minimum JSX around it** — nothing else.

## Rules

- **Shared checkout.** Edit only your batch's files. Never stash, reset, checkout, or reformat a
  whole file. Re-read a file right before editing it; another agent may have changed it.
- **Meaning moves, it is not lost.** An `author-facing` fact that is not already in a code
  comment or `FEATURE.md` becomes a one-line code comment beside the element. Deleting it
  outright is fine only when it is already recorded or merely restates the label.
- **Keep logic identical.** No renamed props, no changed handlers, no new state. A conditional
  that only chose between two hint strings may collapse when both become the same or empty.
- **Tooltips** go in the component's tooltip slot (`title=` on `KpiTile`) or an existing
  info-icon/tooltip primitive — never a new tooltip component.
- **Siblings:** after your change, every sibling in that row/list fills the same slots at
  similar length, or none do.
- **Tests:** `grep -rn "<old text fragment>" <feature dir> **/__tests__` — a test that asserts
  the old string is updated to assert the new one (or its absence) in the same batch.
- **Dead code:** a helper, prop, or variable that only fed the deleted text is removed.

## Recipes

| Verdict | Do |
|---|---|
| `author-facing` | Delete the rendered text; add a code comment if the fact is not recorded; add a tooltip only if Review gave one |
| `restates-obvious`, `page-description` | Delete the element (and its wrapper if the wrapper only existed for it) |
| `too-long` | Replace with Review's text; count it against the budget |
| `definition-to-tooltip` | Remove inline text; put Review's sentence in the tooltip slot |
| `asymmetric` | Apply Review's choice to every sibling |
| `primitive` | Swap to the official primitive or add `truncate`/`line-clamp-1` + tooltip to the slot, as Review specified |

## Verify before you report

```bash
node scripts/interface-text/check-interface-text.mjs <your files>      # no NOVEL on your lines
pnpm check:parse                                                        # matrx-frontend
pnpm tsc --noEmit -p tsconfig.typecheck.json  # only if you changed props/components; use the queue
```

Commit only your files by pathspec:
`git add <files> && git commit -m "fix(ui-text): <feature> — <what>" -- <files>`.

## Done when

Every finding in the batch is applied or reported as not applicable with the reason, the
detector shows no NOVEL finding on a line you touched, parse passes, and the commit contains
only your files. Report: files changed, findings applied, anything skipped and why.
