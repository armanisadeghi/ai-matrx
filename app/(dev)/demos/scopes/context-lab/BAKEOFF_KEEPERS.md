# Context Lab bakeoff — Arman's verdicts (2026-07-11)

Running ledger of the four-posture bakeoff (`sharp` / `reimagine` / `refine` / `dense`).
**KEEPERS are locked:** regardless of which set "wins", every item marked KEEP below gets
captured exactly as it existed at the snapshot commit and becomes part of the future
retained component set. The consolidation pass MUST read this file.

## dense

| Piece | Verdict |
|---|---|
| Heat strip trigger | **KEEP** — "cool" |
| Flat-structure-everywhere thesis | REJECTED — presenting everything flat, everywhere, makes none of it work |
| Quick pick (flat, full paths, 612 items incl. projects/tasks) | REJECTED — VS Code shows a beautiful TREE, not a flat full-path dump |
| Eager fetch of 40 projects + 501 tasks on every render | DEFECT — must be lazy; chance of needing them is near zero |
| Tree ledger (blotter) | POTENTIAL — missing collapse-all/expand-all; too wide; redo as a small VS Code-sidebar-style component to show how small it can get |
| Miller columns | **KEEP** — love the concept; not for every page; also want a top-to-bottom mobile version |
| Type-tab matrix | **KEEP (concept)** — great, almost really good, something is missing |
| Selection cockpit | POTENTIAL — pick-left/show-right is good; the strange menu makes it impossible; fix and re-review. General note to dense: stop taking up so much space |

## reimagine

| Piece | Verdict |
|---|---|
| The full trigger set (all 7) | **KEEP — near perfect and complete set, keep regardless** · T2 Lens Chip **promoted** 2026-07-16 → `features/scopes/components/active-context/{LensChip,ActiveContextLensChip}.tsx` (chat header + Block 1.6) |
| Drill Deck | **KEEP** — "PERFECT for so many things, AMAZING" |
| Command Quick-Pick | **promoted** 2026-07-16 with Lens Chip host → `active-context/quick-pick/` (interaction law: row = forward, checkbox = select). Demo files re-export the canonical modules. |
| Token Composer | **KEEP** — "Mind blown. Keeper for sure" — and should probably become a canonical component for many OTHER things beyond context |
| Miller Columns | **KEEP after fix** — bug: doesn't handle both click and checkmark; any click should check/uncheck like Drill Deck, AND multi-selection in a column must OR-merge — next column shows the union of children of all selected |
| Context Matrix | **KEEP — repurposed.** Not right for the picker, but an amazing VISUALIZATION view: user's landing page for all organizations (show everything) → one org → one scope type → one scope. Great for seeing what you have and what's missing. (Fix "Context Matrx" spelling in the demo… although the typo admittedly knows its audience) |

## sharp

_(feedback pending)_

## refine

_(feedback pending)_
