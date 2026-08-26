# Canonical Keyword Primitive — KeywordInput + Keyword Intelligence window

Status: **live primitive; dossier convergence in progress (2026-08-14).** Home:
`features/marketing/seo/keyword/`.

**THE RULE:** a keyword is never a bare string. Wherever one is entered,
displayed, or handed to an agent, it travels with everything the platform
knows about it (`seo.keyword` + `keyword_market` + edges + site performance +
rank evidence), condensed for the consumer. **Never render a plain
`<Input>` for a keyword field — wrap `KeywordInput`. Never hand-build a
keyword payload for AI — call `buildKeywordBrief`.**

## Parts

| Part                    | File                                                                                                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeywordInput`          | `KeywordInput.tsx`                                                                                     | THE canonical keyword input: live library resolution, data chips underneath, contextual + library suggestion dropdown (source-tagged: GSC / Analyzer / Library), Keyword Intelligence launcher. Controlled; callers own save. Repeat-entry surfaces use `onSubmit` + `showDetails={false}` for type→Enter batching without a second-line lookup jump.                                                                                                                                                                   |
| `KeywordIntelPanel`     | `KeywordIntelPanel.tsx`                                                                                | **THE canonical per-keyword dossier.** It owns pipeline status, first-run/rerun UX, result tabs, provider evidence, and drill-down navigation. The live six-tab build is transitional; the contract below is authoritative.                                                                                                                                                                                                                                                                                             |
| `keywordWindow` overlay | `features/window-panels/windows/seo/KeywordWindow.tsx` + `features/overlays/openers/keywordWindow.tsx` | The panel as a floating window. Open from anywhere: `useOpenKeywordWindow({ phrase, organizationId, siteId, pageId, brandId, tab })`. A site binding always travels with its owning organization; site-scoped compute tabs stay off without both. `?panels=keyword`.                                                                                                                                                                                                                                                    |
| `KeywordMeaningPanel`   | `KeywordMeaningPanel.tsx` + `keyword-meaning.ts`                                                       | **THE MEANING HALF of the dossier.** What THIS site says the keyword is — Class (+source), Offering (+lineage and where its worth comes from), Score + Level (+whether a person ruled it), the full receipt, every dimension stamp with provenance, and the count of dimensions with no answer. `useKeywordMeaning` composes `gsc_keyword_value_for` + `gsc_keyword_topics_for` + `gsc_keyword_stamps_for` + `facet_dimension_catalog`, scoped to the one keyword. Replaced the 13 retired mirror facets on 2026-08-24. |
| Keyword row actions     | `keyword-actions.tsx`                                                                                  | **ONE definition of what you can do to a keyword row**, shared by every surface that shows one: `useKeywordAssignSurfaces` (the AssignPanel / OfferingAssignPanel / RulingDialog trio, so no second write path) + `useKeywordMenuSection` (the v3 `extraSections` entry). A surface adds the whole set — set the class · which service · answer a dimension · pin a level · why this score · pages for this keyword · open the dossier — in two hook calls.                                                             |
| `buildKeywordBrief`     | `keyword-brief.ts`                                                                                     | The condensed keyword+data payload (`{ data, lines }`) for Copy-for-AI envelopes and agent payloads.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `KeywordDataChips`      | `KeywordDataChips.tsx`                                                                                 | Inline condensed data row (volume, trend, competition, CPC, site position).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `KeywordUsageChips`     | `KeywordUsageChips.tsx` + `keywordUsedIn`                                                              | Presence checks of a phrase across observed fields (title/description/H1/URL).                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Reads + identity        | `data.ts`, `hooks.ts`                                                                                  | Direct-Supabase `seo` reads. Page-level GSC evidence uses the set-based `seo.gsc_perf_breakdown` RPC with `site_id + page_id`; browser reads never scan `seo.search_performance_daily`. `ensureKeywordId` is the canonical explicit-entry path: it upserts an arbitrary phrase through `seo.fn_upsert_keyword` and restores archived matches. `useKeywordVolumeRefresh` enriches the saved phrase through aidream; it is not required before selection. Query keys: `seoKeywordKeys`.                                   |

## Canonical dossier contract

**Keyword Intelligence is the only floating dossier for one keyword.** It
orchestrates the canonical research, market, classification, site-performance,
rank, and SERP systems; it never forks their storage, fetchers, streams, or
shape renderers. `KeywordResearchWindow` is transitional: consolidate its
launcher/live-run capability into Keyword Intelligence's Run Details result and
retire the competing per-keyword window after consumer migration. The
Keyword Research Workbench remains the batch/library surface.

### Pipeline stages are not result tabs

A persistent pipeline strip reports `not_started`, `running`, `complete`,
`stale`, or `failed`, plus last completion, evidence count, and the exact next
action. Tabs expose results; tab order never implies execution order. The
canonical result inventory is:

1. **Summary** — true highlights, freshness, and pipeline status; no unique data
   marooned here.
2. **Keywords** — every discovered phrase, relationship type, market metrics,
   classification status, provenance, and a drill-down door.
3. **Classification** — the ONE registered keyword-classification component.
4. **Site Performance** — an explicit row for each supported source, with
   `not configured | needs sync | observed zero | has data | failed` and its
   Connect/Sync/Retry/Open action.
5. **Search Visibility** — Positions and Result Pages are two views of the same
   persisted Google/Brave evidence, never competing tabs.
6. **Pipeline** — canonical live Redux stream, saved provenance, failures,
   and completed-run history.

Optional provider capabilities join this inventory as visible capability tabs;
an unavailable tab names its missing prerequisite and action instead of showing
blank data or disappearing.

### First run, rerun, and baseline

- **A never-researched keyword gets an honest first-run state, not an empty
  dossier.** Pipeline becomes a focused, full-body baseline invitation and
  Summary routes the user there. The
  submit/click is the spend-authorizing gesture and starts every missing
  automatic stage.
- **The run stays live across tabs.** Summary narrates stage progress; Pipeline
  Details renders the exact adopted Redux stream already received. Switching
  tabs never restarts a stage or loses partial output.
- **Opening an existing keyword never spends.** Restore durable results and
  freshness first.
- **Rerunning a completed baseline is deliberate.** Use a clearly secondary
  “Rerun entire baseline” action plus confirmation that the active dossier
  results will be replaced. Preserve provenance/history where the platform
  retains it; never claim physical deletion unless the pipeline performs it.
- **Baseline sequence:** keyword identity → Keyword Relationship Researcher
  (parents, children, natural LSIs, related phrases) → deterministic artifact
  storage and relationship ingestion → batched keyword market metrics → two
  independent automatic branches: intrinsic classification and primary-keyword
  Google+Brave search visibility → completed summary. This is the ratified
  target sequence; today the research/market/classification branch is live and
  primary Google+Brave collection still requires the explicit tracking/check
  actions named under Deferred convergence work.
- **Automatic scope:** Google and Brave SERP/rank collection runs for the
  primary keyword only. Expanded phrases receive relationships, market metrics,
  and intrinsic classification. The user may explicitly opt additional phrases
  into search visibility.
- **Explicit-cost actions remain explicit:** rerun a completed baseline, refresh
  fresh evidence, track extra phrases/providers/locations, optional expansion
  capabilities, and SERP-informed reclassification. Every action states what it
  will run; tab activation alone never spends.

### Persistent drill-down sidebar

**Every keyword identity is a door into a complete dossier.** Clicking the
keyword name or its explicit Drill down action adds that phrase to the existing
WindowPanel sidebar, deduplicated, and selects it. Double-click or right-click
may be accelerators, never the only door. The opening keyword stays pinned;
subsequent discoveries retain their order and their per-keyword dossier state.
Selecting a sidebar item swaps the entire inner dossier—including first-run,
scope, tabs, stream, freshness, and failures—without opening a second window.
A secondary/recommended phrase starts from its own evidence; it never borrows
the parent keyword's completion state. Opening any keyword door elsewhere while
the singleton window is already mounted performs the same deduplicated add and
select action; it never leaves the previous dossier pinned on screen.

### Optional expansion and enhanced classification

DataForSEO Labs exposes more than volume. Add these user-facing capability tabs
without exposing the provider name:

- **Keyword Ideas** — broad provider-derived discovery.
- **Keyword Suggestions** — close query suggestions for the selected phrase.
- **Related Searches** — adjacent measured query relationships.

These are **future explicit-click capabilities**, not baseline work. Each tab is
visible but locked until its prerequisites exist. Before wiring one, normalize
its provider payload into the canonical keyword/market/edge plane with durable
provenance and freshness; never render raw provider rows or create a parallel
keyword store.

**SERP-informed reclassification is a separate live action.** Once compatible
persisted Google and Brave results exist, Result Pages offers “Enhance
classification.” It sends the two selected snapshots plus the intrinsic
classification to the pinned `seo.keyword_serp_intent_analyst` slot without
running another search. The adopted agent stream opens in `LiveRunWindow`; the
registered `keyword_serp_intent_analysis_v1` component renders it there and in
the Classification tab. The server verifies every cited provider position and
domain, then atomically stores the result under
`classification_detail.serp_intent_analysis`. It never silently overwrites the
intrinsic universal columns. A deliberate rerun requires confirmation and row
version history retains the prior enhancement.

## Current agent inventory

All agent execution resolves through DB-managed slots; IDs in code are
first-sync seeds, never direct runtime calls. Live defaults verified 2026-08-14
match the seeds, use the live agent definition, and have no enabled overrides:

| Stage                    | Slot                              | Live agent                                                                                                                                                                                                                          | Batch behavior                                                                                                   |
| ------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Relationship research    | `seo.keyword_researcher`          | [Keyword Relationship Researcher](https://www.aimatrx.com/administration/system-agents/agents/c4b999a2-629d-4a00-a23f-25c63b2054d9) — `c4b999a2-629d-4a00-a23f-25c63b2054d9`                                                        | One call per fresh baseline; four lists × the default 10 phrases.                                                |
| Intrinsic classification | `seo.keyword_classifier`          | [Keyword Classifier](https://www.aimatrx.com/administration/system-agents/agents/5ca54dd9-6de6-4364-842f-2ec4a0274ce0) — `5ca54dd9-6de6-4364-842f-2ec4a0274ce0`                                                                     | Only stale/unclassified rows, chunks of at most 40; a full 40-related-plus-primary result may require two calls. |
| SERP intent enhancement  | `seo.keyword_serp_intent_analyst` | [SERP-Informed Keyword Intent Analyst](https://www.aimatrx.com/administration/system-agents/agents/f0cb38e5-5de8-44de-bb7b-a22d9675f098) — `f0cb38e5-5de8-44de-bb7b-a22d9675f098`; pinned v3 `99cb84db-245d-4290-a5c2-a751ea7c3262` | One explicit call for one keyword after compatible stored Google + Brave snapshots exist; no search tools.       |

Artifact storage, `fn_ingest_keyword_research`, keyword-market provider calls,
Google/Brave collection, evidence validation, and Supabase reads/writes are
**deterministic non-agent stages**. Topic Assigner, Page Analyzer, Site
Strategist, Page-Keyword Mapper, and Site Intake agents are not invoked by the
per-keyword baseline.

## Deferred convergence work

- Replace artifact-exists heuristics with one durable per-stage dossier status
  facade; an artifact stored before metrics/classification finish is not a
  completed baseline.
- Add primary-only automatic visibility and explicit extra-keyword tracking.
- Preserve each sidebar keyword's transient selected tab and live-stage UI when
  moving among several dossiers; durable results and Redux execution state are
  already phrase/request keyed.
- Build normalized persistence for Ideas/Suggestions/Related Searches before
  exposing their optional actions.
- Browser-certify the deployed SERP-informed action with real compatible Google
  and Brave targets after the aidream endpoint reaches production.
- Consolidate and remove the standalone `KeywordResearchWindow` only after all
  launchers and preserved-state consumers use Keyword Intelligence.

## The window IS a surface

`matrx-user/keyword-intelligence` (manifest
`features/surfaces/manifests/keyword-intelligence.manifest.ts`, overlay twin of
`keywordWindow`): 17 values (read `keyword_brief` first, then `keyword_meaning`) + 3 agent roles
(`keyword_strategist`, `content_brief_writer`, `serp_analyst`, unbound).
Emitter: `SurfaceRuntimeProvider` inside `KeywordIntelPanel` — user-created
agents bound to the window receive the full dossier. The marketing-page
surface separately emits `target_keyword_data` (the brief for the SAVED
target keyword) via `buildMarketingPageScope`. Adding a value → declare in
the manifest, emit in `getScope`, re-sync (surface-authoring skill).

## Invariants

- 🚨 **THE 13 MIRROR FACETS ARE RETIRED FROM THIS DOSSIER.** `seo.keyword`'s
  intent_class / funnel_stage / specificity / query_form / local_intent /
  urgency / audience_type / brand_presence / comparison_intent /
  price_sensitivity / transaction_direction / fulfillment_mode /
  compliance_framing columns MIRROR the fact store (`seo.keyword_facet`).
  Meaning renders from the stamp system through `KeywordMeaningPanel`; the
  surface value is `keyword_meaning`, never `keyword_classification`. A brief
  built WITH meaning drops the mirror fields so one payload never answers
  "what is this keyword" twice. Do not reintroduce a facet-column reader.
- 🚨 **THE WINDOW MOUNTS ITS OWN MENU.** An overlay with no
  `NonEditableContextMenu` hands the right-click to the page underneath —
  THAT page's surface, values and agents, silently wrong and looking like it
  worked. The panel wraps itself, passes `surfaceName`, `contentSource` and
  (for a library keyword) `entity: { type: "seo_keyword" }`, and puts the
  surface emitter's payload in `contextData` so the value-mapping guard stays
  quiet. Adding a `surfaceName` without the emitter's values is the mistake
  that guard exists to catch.
- **Every keyword surface gets the same actions through `keyword-actions.tsx`.**
  Never re-implement "set the class" / "which service" / "pin a level" beside
  a new table — call `useKeywordAssignSurfaces` + `useKeywordMenuSection`, and
  render `surfaces.node` ABOVE the table (never inside a Dialog: the value
  picker portals its own popover and a Dialog closes itself mid-assignment).

- **Reads direct to Supabase, compute to aidream** (two-lane rule). Research
  streaming REUSES `useKeywordResearch` and renders through the ONE canonical
  pipeline (`<MarkdownStream requestId />` over the adopted pipeline stream).
  Reuse it rather than forking it; never add a parallel research surface or
  model a new surface on it.
  Selection travels the surface seams, not props: this tab publishes
  `keyword_selection` UI state and registers the `keyword_selection` write
  handler its manifest declares. Rank data REUSES
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

- 2026-08-25 — Repeated external opens of the singleton Keyword Intelligence
  window now add/select the requested phrase in its existing workspace while
  preserving the original pinned target and deduplicated history.

- 2026-08-24 — Codex: cut all page-level keyword/GSC readers over from broad
  browser scans of `seo.search_performance_daily` to the canonical set-based
  `seo.gsc_perf_breakdown` RPC, carrying both site and page identity and a
  server-side result cap.
- 2026-08-24 — Claude: `keyword-actions.tsx` became the ONLY keyword menu in
  the platform. The Keyword Workbench's inline copy is gone; it now consumes
  `useKeywordMenuSection` like everyone else. Two seams made that possible
  without a second assign panel or a poorer drill-down: `delegate`
  (`openDimension` / `openService`) on `useKeywordAssignSurfaces`, for a
  surface that already owns a bulk-aware panel, and `openPages` on
  `useKeywordMenuSection`, for a surface whose drill must carry its live range
  and filters. Everything not delegated still comes from here — including the
  ruling dialog, which the Workbench never had.
- 2026-08-24 — Claude: the dossier carries the NEW system. Retired the 13
  mirror facets; added `KeywordMeaningPanel` + `keyword-meaning.ts` (Class,
  Service, Score, Level, receipt, every stamp with provenance, all settable in
  place); added `keyword-actions.tsx` as the ONE keyword-row action set and
  wired it into the window, the Value Workbench and the Performance tab; the
  window now mounts its own v3 menu with `contentSource` + `entity`; surface
  value `keyword_classification` → `keyword_meaning` (manifest + the
  `ui.ui_surface_value` row). Measured gap: keyword-intelligence-convergence
  ADOPTION-SWEEP.md #1, #2, #4, #8, #9, #19.
- 2026-08-14 — Codex: shipped the optional SERP-informed intent pass end to
  end: pinned AI Dream agent/slot, stored-snapshot-only streaming endpoint,
  server evidence validation, non-destructive JSONB writer, adopted Redux live
  run, Result Pages action with prerequisite/rerun states, Classification-tab
  review, and the single registered Shape component.
- 2026-08-14 — Codex: ratified the canonical dossier contract—honest first-run
  baseline, stage strip vs result tabs, persistent keyword drill-down, explicit
  spend rules, primary-only Google+Brave automation, optional normalized
  expansion tabs, future SERP-enhanced classification, exact live agent
  inventory, standalone-window consolidation, and deferred convergence work.
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
