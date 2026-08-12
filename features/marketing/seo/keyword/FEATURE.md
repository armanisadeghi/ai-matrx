# Canonical Keyword Primitive — KeywordInput + Keyword Intelligence window

Status: **live (2026-07-26).** Home: `features/marketing/seo/keyword/`.

**THE RULE:** a keyword is never a bare string. Wherever one is entered,
displayed, or handed to an agent, it travels with everything the platform
knows about it (`seo.keyword` + `keyword_market` + edges + site performance +
rank evidence), condensed for the consumer. **Never render a plain
`<Input>` for a keyword field — wrap `KeywordInput`. Never hand-build a
keyword payload for AI — call `buildKeywordBrief`.**

## Parts

| Part                    | File                                                                                                   | What it is                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeywordInput`          | `KeywordInput.tsx`                                                                                     | THE canonical keyword input: live library resolution, data chips underneath, contextual + library suggestion dropdown (source-tagged: GSC / Analyzer / Library), Keyword Intelligence launcher. Controlled; callers own save. Repeat-entry surfaces use `onSubmit` + `showDetails={false}` for type→Enter batching without a second-line lookup jump. |
| `KeywordIntelPanel`     | `KeywordIntelPanel.tsx`                                                                                | The full dossier: Overview (market + 13-column classification), Relationships (edge navigation re-targets the panel), Site (v_site_keyword_performance), Rankings (rank targets + live check + track), SERP (stored landscape as a Google-style results page, own site highlighted), Research (full pipeline, live kind components).                  |
| `keywordWindow` overlay | `features/window-panels/windows/seo/KeywordWindow.tsx` + `features/overlays/openers/keywordWindow.tsx` | The panel as a floating window. Open from anywhere: `useOpenKeywordWindow({ phrase, organizationId, siteId, pageId, brandId, tab })`. A site binding always travels with its owning organization; site-scoped compute tabs stay off without both. `?panels=keyword`.                                                                                  |
| `buildKeywordBrief`     | `keyword-brief.ts`                                                                                     | The condensed keyword+data payload (`{ data, lines }`) for Copy-for-AI envelopes and agent payloads.                                                                                                                                                                                                                                                  |
| `KeywordDataChips`      | `KeywordDataChips.tsx`                                                                                 | Inline condensed data row (volume, trend, competition, CPC, site position).                                                                                                                                                                                                                                                                           |
| `KeywordUsageChips`     | `KeywordUsageChips.tsx` + `keywordUsedIn`                                                              | Presence checks of a phrase across observed fields (title/description/H1/URL).                                                                                                                                                                                                                                                                        |
| Reads + identity        | `data.ts`, `hooks.ts`                                                                                  | Direct-Supabase `seo` reads. `ensureKeywordId` is the canonical explicit-entry path: it upserts an arbitrary phrase through `seo.fn_upsert_keyword` and restores archived matches. `useKeywordVolumeRefresh` enriches the saved phrase through aidream; it is not required before selection. Query keys: `seoKeywordKeys`.                            |

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
  streaming REUSES `useKeywordResearch` and renders through the ONE canonical
  pipeline (`<MarkdownStream requestId />` over the adopted pipeline stream).
  Selection travels the surface seams, not props: this tab publishes
  `keyword_selection` UI state and registers the `keyword_selection` write
  handler its manifest declares.
  rather than forking it, add nothing to it, and never model a new surface on it.
  Rank data REUSES
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
- Consumers today: page-workspace intent/supporting-keyword forms, content-plan
  page intent (primary + supporting), ranks add-target, keyword-research launch,
  SEO change-target selection, the intelligence self-selector, and keyword row
  launchers. ID-backed consumers adapt at their save boundary with
  `ensureKeywordId`; they never limit entry to the existing library.
- The 2026-08-12 marketing audit deliberately keeps simple text controls for
  text that is not a keyword identity: AI-answer prompts, search/filter/rule
  patterns, brand aliases, narrative strategy prose, and a multiline brand
  vocabulary used only as agent context. Keyword tables and cards that do not
  edit an assignment remain display-only, but each named keyword is a door to
  the Intelligence window. Any new keyword assignment or research seed uses
  `KeywordInput`; exceptions must explain which non-identity text concept they
  actually represent.
- Page-bound Research results are selection surfaces: hierarchy chips and
  intent-classification cards share one checkbox state and attach through
  `addPageSupportingKeywords`. The primary phrase is never selectable.
- Research opens saved org-visible `content_ir.kind_instance` data in place
  before offering a rerun. Do not replace this with creator-private run-ledger
  state or a link to another page.
- **Library removal is soft-archive via `seo.fn_archive_keywords` only**
  (panel header button; wrappers + doctrine in
  `keyword-research/FEATURE.md` § Autosave + library management). Archive is
  durable against research re-runs; explicit hand-entry restores
  (`ensureKeywordId` → `fn_restore_keywords`). Every archive confirms first
  and toasts an Undo.

## Change Log

- 2026-08-12 — Codex: consolidated content-plan primary/supporting selection,
  ranks, research launch, and SEO change-target entry onto `KeywordInput`;
  promoted arbitrary phrase persistence to `data.ts#ensureKeywordId`; added
  immediate dropdown selection for ID adapters; and recorded the marketing
  audit's non-keyword text exceptions above.
- 2026-07-29 — Codex: Keyword Intelligence now uses the existing WindowPanel
  sidebar for a persistent research path: the opening target stays pinned,
  related/researched phrases are deduplicated beneath it, and selecting any
  entry swaps the existing dossier back to its durable saved research. No new
  store, query, or persistence system was added.
- 2026-07-29 — Claude: library management (Arman "autosave + easy removal"
  ruling) — panel header Archive button (`fn_archive_keywords`, confirm +
  Undo), explicit-entry restore in `ensureKeywordId`; research autosave
  confirmed already server-side (`fn_ingest_keyword_research`).
- 2026-07-29 — Claude: both keyword windows now preserve/restore across
  reload — `keywordWindow` (phrase + activeTab + org/site/page/brand scope)
  and `keywordResearchWindow` (primaryKeyword; never autoRun) gained registry
  `preservation` entries, and their collectors re-stage on change (debounced
  state, not ref) so the restored phrase keys the saved org-visible
  `content_ir.kind_instance` research restore on every reopen.
- 2026-07-28 — Codex: page-bound research now restores saved hierarchy +
  persisted keyword classification in place, keeps both live phases mounted,
  and adds shared checkbox → supporting-keyword attachment. `KeywordInput`
  gained compact Enter-submit mode for rapid supporting-keyword entry.
- 2026-07-27 — Codex: made site-bound keyword operations organization-safe
  end to end (window persistence, research, volume refresh, rank mutations,
  content-plan/page/site launchers).
- 2026-07-27 — Claude: the window became a registered SURFACE
  (`matrx-user/keyword-intelligence`, DB-synced live); `target_keyword_data`
  added to the marketing-page surface; adoption sweep (ranks, site keywords,
  content-plan picker); page evidence cards (queries/findings/links/backlinks)
  - snapshot compare landed on the page workspace; save nudge for unknown
    keywords; edge-confidence display fix.
- 2026-07-26 — Claude: initial build — canonical KeywordInput, Keyword
  Intelligence window (6 tabs), keyword brief, usage chips; adopted by the
  page-workspace intent form.
