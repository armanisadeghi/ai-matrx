# Character Counter

Public route: `/free/character-counter`. Authenticated users can also open the same client-only workspace as the **Character Counter Window** from Utilities.

## Invariants

- All counting, keyword analysis, cleanup, clipboard work, and downloads happen in the browser. Text is never sent to a service or persisted.
- Use `computeTextCounterMetrics` for standalone counter analytics. It uses `Intl.Segmenter` when available so grapheme clusters (including emoji) are not miscounted.
- SEO presets are the exception: they import the canonical limits and Python-compatible Unicode code-point counter from `features/marketing/seo/serp/metrics.ts`.
- The compact and public experiences share `CharacterCounter`; do not fork their measurements or editing behavior.

## Change Log

- 2026-07-29 — SEO title/description presets now consume the canonical SERP
  character limits and code-point counter instead of redeclaring 60/160.
- 2026-07-16 — Added the public Character Counter and matching WindowPanel workspace.
