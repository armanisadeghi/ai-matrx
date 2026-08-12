# AI Visibility

**Status:** live · verified against code 2026-08-12

## One analysis, three surfaces

- **Internal:** `AiVisibilityWorkspace.tsx` analyzes a saved `web.site` and
  exposes `ShareButton` for its latest `seo.collection_run`.
- **Public input:** `/seo/ai-visibility` renders `AiVisibilityTool.tsx`. Brand,
  website, aliases, buyer question, and optional city stream through
  `POST /seo/public/ai-visibility`.
- **Public report:** `/s/[token]` dispatches `seo_collection_run` to
  `AiVisibilityReport.tsx`. The report renders complete provider answers,
  recommendation positions, mentions, citations, recommendations, claims,
  decision signals, source doors, native sharing, and the AI Matrx acquisition
  CTA.

## Invariants

- **The live window is the progress surface.** Public runs adopt the foreign
  stream through `adoptForeignStream` and pass one `LiveRunProgressState` to the
  canonical window. The four engine rows update in place from waiting → running
  → completed/failed, show answer evidence when received, and never append
  implementation narration. Internal agent output still uses Content IR.
- **The durable run is the report.** `seo.collection_run.result` is the only
  report payload. Do not add a public report table or a second token system.
- **Aliases are identity data.** Mention and recommendation position come from
  brand/site names plus `web.brand.profile.brand_aliases`, never a frontend text
  match.
- **Every truncated answer has a door.** Internal cards open the full answer in
  `SidePanelSurface`; public report answers are fully readable in expandable
  provider sections.
- **Social previews are data-specific.** `/s/[token]/opengraph-image.tsx`
  renders brand, buyer question, provider coverage, mentions, and best position
  at 1200×630. Metadata uses `summary_large_image` and remains `noindex` because
  the opaque token is the authorization.

## Change log

- 2026-08-12 — Replaced the public run's append-only Content IR status transcript
  with four stable, actively updating engine rows in `LiveRunWindow`.
- 2026-08-12 — Fixed the internal share action’s generic status probe: a
  link-only `seo.collection_run` has no public-state column, so it now skips the
  row query and relies on the canonical link-sharing capability.
- 2026-08-12 — Added the public analyzer, canonical shared report renderer,
  social card, internal share action, alias-aware position display, and native
  share hook integration.
