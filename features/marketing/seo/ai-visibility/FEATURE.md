# AI Visibility

**Status:** live · verified against code 2026-09-27

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

- **Panels:** `/…/ai-visibility/panels` (`panels/AiVisibilityPanelsView.tsx`)
  lists a site's saved panels. Each shows the six named metrics from
  `GET /ai-visibility/panels/{id}/metrics` (`PanelMetricsSection`), its
  **Design** section from `GET …/{id}/design` (steps, notices, files, review
  history, and the open review as `GateReviewCard`), and the page offers
  **Design a panel** (`DesignPanelForm` → `POST /ai-visibility/panels/design`).
  Contract types live only in `panels/types.ts`; server doors only in
  `panels/panel-api.ts`; code → display-name mapping only in `panels/format.ts`.
  Spec: `common-docs/projects/outside-skill-packs/BRIEFS-AI-VISIBILITY.md`.

## Invariants

- **The live window is the progress surface.** Public runs adopt the foreign
  stream through `adoptForeignStream` and pass one `LiveRunProgressState` to the
  canonical window. The four engine rows update in place from waiting → running
  → completed/failed, show answer evidence when received, and never append
  implementation narration. Internal agent output still uses Content IR.
- **The durable run is the report.** `seo.collection_run.result` is the only
  report payload. Do not add a public report table or a second token system.
- **Empty failures are not reports.** The public parser requires at least one
  completed provider with a nonblank answer. A legacy or malformed all-failed
  payload renders an unavailable state with no report metrics or share action.
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
- **The site header owns view navigation.** The root analyzer is Overview;
  Claims, Sources, Decision signals, and History are real path children. Never
  add an in-workspace tab bar over the same destinations.

- **No pooled headline.** Never render "named in X% of answers" or "up N
  points": metrics are per stratum from the server, "unprompted" and "we're
  named" side by side, each with sample size, method and its does-not-prove
  line on screen. Too few question slots → counts; `campaign_response` with no
  design → "Not set up"; null → "Not measured yet". Never 0% for either.
- **Display names only** in human text (`panels/format.ts`): tracked set,
  discovery set, tripwire, false-positive check, prompted set; no web access,
  with web search, the real app, campaign test; never `core`/`B3`/`closed_model`.
- **Reviews offer, never block.** Every review card has Approve · Edit ·
  Continue without approving inline (no modal); continuing leaves the panel
  provisional. The gate-3 card is blind: it renders only whitelisted question
  fields, and the panel's measurements fold while it is open (a "Show anyway"
  button, never a lock).
- **The one-question report says what it is:** "One question, one moment. Not a
  measurement." (`ONE_QUESTION_NOT_A_MEASUREMENT`).

## Change log

- 2026-09-27 — Panels: removed the pooled "Named in answers / Cited as a
  source" cells, headline sentence and weekly bars; added the six named
  metrics, the evidence ladder, paired comparisons, unclassified-question
  count, per-panel Design section with the four review cards, the Design a
  panel form, and the report's not-a-measurement line.

- 2026-08-15 — Registered Overview plus the four evidence routes as path-style
  site-header views and removed both duplicate in-workspace switchers.
- 2026-08-12 — Added canonical row/view/window/field Copy, JSON, export, and
  Copy-for-AI controls to Claims, Sources, Signals, and History through
  `MatrxDataTable.copy`.
- 2026-08-12 — Made public rendering fail closed for empty/all-failed provider
  payloads so authorization failures cannot appear as zero-result reports.
- 2026-08-12 — Replaced the public run's append-only Content IR status transcript
  with four stable, actively updating engine rows in `LiveRunWindow`.
- 2026-08-12 — Fixed the internal share action’s generic status probe: a
  link-only `seo.collection_run` has no public-state column, so it now skips the
  row query and relies on the canonical link-sharing capability.
- 2026-08-12 — Added the public analyzer, canonical shared report renderer,
  social card, internal share action, alias-aware position display, and native
  share hook integration.
