# Canonical Keyword Primitive — KeywordInput + Keyword Intelligence window

Status: **live (2026-07-26).** Home: `features/marketing/seo/keyword/`.

**THE RULE:** a keyword is never a bare string. Wherever one is entered,
displayed, or handed to an agent, it travels with everything the platform
knows about it (`seo.keyword` + `keyword_market` + edges + site performance +
rank evidence), condensed for the consumer. **Never render a plain
`<Input>` for a keyword field — wrap `KeywordInput`. Never hand-build a
keyword payload for AI — call `buildKeywordBrief`.**

## Parts

| Part | File | What it is |
|---|---|---|
| `KeywordInput` | `KeywordInput.tsx` | THE canonical keyword input: live library resolution, data chips underneath, contextual + library suggestion dropdown (source-tagged: GSC / Analyzer / Library), Keyword Intelligence launcher. Controlled; callers own save. |
| `KeywordIntelPanel` | `KeywordIntelPanel.tsx` | The full dossier: Overview (market + 13-column classification), Relationships (edge navigation re-targets the panel), Site (v_site_keyword_performance), Rankings (rank targets + live check + track), SERP (stored landscape as a Google-style results page, own site highlighted), Research (full pipeline, live kind components). |
| `keywordWindow` overlay | `features/window-panels/windows/seo/KeywordWindow.tsx` + `features/overlays/openers/keywordWindow.tsx` | The panel as a floating window. Open from anywhere: `useOpenKeywordWindow({ phrase, organizationId, siteId, pageId, brandId, tab })`. A site binding always travels with its owning organization; site-scoped compute tabs stay off without both. `?panels=keyword`. |
| `buildKeywordBrief` | `keyword-brief.ts` | The condensed keyword+data payload (`{ data, lines }`) for Copy-for-AI envelopes and agent payloads. |
| `KeywordDataChips` | `KeywordDataChips.tsx` | Inline condensed data row (volume, trend, competition, CPC, site position). |
| `KeywordUsageChips` | `KeywordUsageChips.tsx` + `keywordUsedIn` | Presence checks of a phrase across observed fields (title/description/H1/URL). |
| Reads | `data.ts`, `hooks.ts` | Direct-Supabase `seo` reads + `useKeywordVolumeRefresh` (the ONE sanctioned way the UI adds an unknown phrase to the library — the aidream volume-refresh command upserts it server-side). Query keys: `seoKeywordKeys`. |

## The window IS a surface

`matrx-user/keyword-intelligence` (manifest
`features/surfaces/manifests/keyword-intelligence.manifest.ts`, overlay twin of
`keywordWindow`): 17 values (read `keyword_brief` first) + 3 agent roles
(`keyword_strategist`, `content_brief_writer`, `serp_analyst`, unbound).
Emitter: `SurfaceRuntimeProvider` inside `KeywordIntelPanel` — user-created
agents bound to the window receive the full dossier. The marketing-page
surface separately emits `target_keyword_data` (the brief for the SAVED
target keyword) via `buildMarketingPageScope`. Adding a value → declare in
the manifest, emit in `getScope`, re-sync (surface-authoring skill).

## Invariants

- **Reads direct to Supabase, compute to aidream** (two-lane rule). Research
  streaming REUSES `useKeywordResearch` + `LiveResearchFeed`; rank data REUSES
  `features/marketing/components/ranks/useRanks.ts`; display atoms REUSE
  `keyword-research/components/KeywordMetrics.tsx`. No forked fetchers or
  visuals.
- **Every stream lands on a terminal state** — in-band `error` events captured,
  post-stream forced done/error (the rank-check 429 class).
- **Entity scope beats ambient scope.** Site/page-bound compute passes the
  entity's `organization_id` through `scopeOverrides` (or the typed raw body);
  global keyword tools intentionally inherit the active organization.
- `normalizeKeywordPhrase` is a LOOKUP mirror of `seo.fn_normalize_phrase`;
  persisted normalization stays server-owned.
- Consumers today: page-workspace intent form (scope-bound input, GSC/analyzer
  suggestions, usage chips, brief in the `web-page-intent` copy payload,
  unknown-keyword save nudge), `PageQueriesCard` (adopt-as-target + launcher),
  ranks add-target form + row launchers, site-keywords row launchers,
  content-plan `KeywordPicker` (market chips + launcher; still id-based).

## Change Log

- 2026-07-27 — Codex: made site-bound keyword operations organization-safe
  end to end (window persistence, research, volume refresh, rank mutations,
  content-plan/page/site launchers).
- 2026-07-27 — Claude: the window became a registered SURFACE
  (`matrx-user/keyword-intelligence`, DB-synced live); `target_keyword_data`
  added to the marketing-page surface; adoption sweep (ranks, site keywords,
  content-plan picker); page evidence cards (queries/findings/links/backlinks)
  + snapshot compare landed on the page workspace; save nudge for unknown
  keywords; edge-confidence display fix.
- 2026-07-26 — Claude: initial build — canonical KeywordInput, Keyword
  Intelligence window (6 tabs), keyword brief, usage chips; adopted by the
  page-workspace intent form.
