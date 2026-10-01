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
- **Tests:** after committing, run `node scripts/interface-text/tests-asserting-removed-text.mjs <your sha>`;
  every test it names is updated in the same batch (round 2: a skipped manual grep turned a test red).
- **Dead code:** a helper, prop, or variable that only fed the deleted text is removed.

## What the round-1 checkers caught fixers doing (2026-09-30 — don't)

| Miss | Do instead |
|---|---|
| A warning about what a control does (Apply refused while a red cell stands; the goal is frozen once set) moved to a code comment | Put it in **that control's tooltip** (`title=`) — it is behaviour the person hits |
| Shortening dropped the subject ("Updates the draft only") or narrowed a noun until false ("dates" where the form also holds key IDs) | The short line still says **what acts** and stays **true of everything it covers** |
| One branch of a `cond ? "a" : "b"` trimmed, the other left long | Both branches are siblings — same shape, similar length |
| Subtext removed from two of three switches | Remove it from every sibling, or give all a parallel line |
| Only the listed lines fixed; a long string beside them left | Run the detector on the **whole file** and fix neighbours in the same row, dialog or list |
| Review's replacement shipped still over budget | Count characters (code spans included) before applying; shorten to fit |
| A warning's remedy cut with the prose ("the ramp is paused" — by whom? until when?) | A warning keeps its remedy: who acts, or the control that fixes it |
| A new term nobody sees elsewhere ("Dig-here lines"), or ambiguous shorthand ("colour is off") | Use words already on the screen |
| `truncate` on a line that carries a formatted number | Let number lines wrap — truncation hides the value |
| A link to another page removed with the prose | Keep it as a plain link, or name the removal in the commit |
| Text deleted, its container kept (a lone icon row floating at the top of a page) | Remove the wrapper when the text was all it held |
| Commit list built from `git diff -- <folder>` swept another fixer's uncommitted files into your commit (round 2) | Stage exactly your batch's `files` list by path, nothing derived from the working tree |
| Shortening dropped one list item or the punctuation its siblings use; cut a joining dash so text runs into a variable | Keep every item and the siblings' punctuation; keep separators around `{values}` |
| The line left under a heading only repeats the heading | Merge them into one heading |
| Fixed the empty state in a window but not the identical one on its page | Grep the old text and fix every copy |
| zsh: a variable holding several paths is passed as ONE argument | Pass `$(git show --name-only --format= <sha>)` or an array |
| Shortening flipped a consequence ("archived together with it" → "are kept") or dropped its condition ("When on…") | Read the code path the warning describes; the short line must be true in every state |
| Code names kept in a rewrite because the original had them (`ctx_get`) | Rewrites never carry identifiers; the fact goes to a comment |
| A definition dropped into whatever slot a component offered (a right-aligned `actions` slot) | Put it beside the label it defines; add a prop to the component if needed |
| `truncate` added to a slot without checking the longest sibling at 390 | Measure the longest sibling at 390; shorten the text — truncation must never hide content |
| A definition hint repeated on every row of a `.map` | Once per list, beside the list or column label |
| A required prop's text deleted, leaving a type error and an empty element | Make the prop optional or remove it, and drop the empty element |
| A tooltip as a native `title=` on text | Use `components/official/InfoHint` (hover, keyboard **and** touch); `KpiTile`'s `title` renders through it |

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
# no per-batch type-check: the round owner runs ONE `pnpm type-check` after every batch lands
# (round 2: ~31 concurrent tsc runs on one Mac killed each other — exit 143)
```

Commit only your files by pathspec:
`git add <files> && git commit -m "fix(ui-text): <feature> — <what>" -- <files>`.

## Done when

Every finding in the batch is applied or reported as not applicable with the reason, the
detector shows no NOVEL finding on a line you touched, parse passes, and the commit contains
only your files. Report: files changed, findings applied, anything skipped and why.
