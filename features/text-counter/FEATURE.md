# Character Counter

Public route: `/free/character-counter`. Authenticated users can also open the same client-only workspace as the **Character Counter Window** from Utilities.

## Invariants

- All counting, keyword analysis, cleanup, clipboard work, and downloads happen in the browser. Text is never sent to a service or persisted.
- Use `computeTextCounterMetrics` for standalone counter analytics. It uses `Intl.Segmenter` when available so grapheme clusters (including emoji) are not miscounted.
- The compact and public experiences share `CharacterCounter`; do not fork their measurements or editing behavior.

## Change Log

- 2026-07-16 — Added the public Character Counter and matching WindowPanel workspace.
