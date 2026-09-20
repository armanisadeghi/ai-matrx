# Topical map — local mechanics

The brand's tree of subjects, and the plan for getting its website there. Product truth,
rulings and build units live in `common-docs` (`inbox/topical-map-app-requirements.md`,
`operations/for-arman/2026-09-16/topical-map-placement.md`); this file is only what an agent
touching THIS code must not get wrong.

## Where it lives

The map is the **Content section's home**: `/marketing/[brandId]/content` and the identical
`/content/map`. One map's workspace is `/content/map/[mapId]`, whose six screens are **routes,
not tabs** — outline (the index), `table`, `graph`, `text`, `pages`, `history`. The flat id door
is `/marketing/topical-maps/[mapId]` (and `/topics/[topicId]` for one topic).

⚠️ `/content` was a `permanentRedirect` (HTTP 308) into the content plan until 2026-09-17, and
browsers cache a 308 forever. **Every in-app link points at `/content/map`**
(`marketingRoutes.brandTopicalMapHome`) so a stale cached redirect is never exercised.

## The layers

| File | What it owns |
|---|---|
| `data.ts` / `types.ts` | The typed wrappers over `seo.*`. Already existed; do not fork them. |
| `errors.ts` | `withTopicalMapErrors` + `TopicalMapError`. |
| `hooks.ts` | ONE hook per wrapper in `data.ts`, TanStack query/mutation. `usePageIntents(…, { feed: false })` reads without replacing the slice's page listing (the graph's rollup uses it). |
| `redux/slice.ts` | One workspace per map id: tree, selection, expansion, view, filters, page filters, checked pages, graph/table/review state, sibling sort, intents, optimistic edits. `loadedIncludes` is derived from the rows the response carried, never the request. |
| `redux/selectors.ts` | `selectVisibleMapTopics` and friends — what every view consumes; `evictMapSelectorCache(mapId)` beside `mapClosed`. |
| `knobs.ts` | All 53 `seo.topical_map` knobs, typed, one cached reader. Enum unions are DERIVED, never retyped (see Knobs). |
| `map-author.ts`, `map-pages.ts`, `map-regions.ts`, `map-intents.ts` + `useAuthorTopicalMap`, `useMapPagesRun`, `useMapRegionsRun`, `useProposeIntentsRun` | The four server entries as durable SEO commands (float into `LiveRunWindow`, rejoin on reload). Their server bodies inherit `AcceptsInjectedScope` (aidream `cf63bebe80`) — the frontend injects `organization_id` on every body. |
| `mandateKeys.ts` | The one literal for `seo.map_curation` until `@ai-matrx/agents` republishes the key (allowlisted); `panel/topicCuration.ts` carries `seo.topic_curation` the same way. |
| `links.tsx` / `useMapWorkspaceParams.ts` | `MapLinkProvider` / `useMapLinks()` — every door, brand-aware or flat; the `?site=` contract. Never a hand-built URL: `marketingRoutes.topicalMapStart` is the brand-free start door. |
| `components/` | `TopicalMapWorkspaceBody` (host-agnostic, props per `CONTRACTS.md` §1), `TopicalMapRouteBody` (the ONE route adapter), the header, the Content home (`TopicalMapHome*`, `BrandTopicalMapCard`), states. |
| `views/OutlineView.tsx` + `views/outline/**` | The outline on `TopicTree`: rows from the selector, rename/move/retire/reject through the hooks, hover card, expand-to-pages rows with `IntentDot`, the v3 menu, the move dialog, diagnostics. `views/outline/text/` holds the Text view's pieces: `mapMarkdown.ts` (the markdown tree, pure), the focus picker, the sizing overrides. |
| `views/TableView.tsx` + `views/table/**` | The platform table (`MatrxDataTable` in `MatrxDataTableHost`): hierarchy mode from the selector, the honest flat mode on a data sort/filter (R10), the column chooser over `table_default_columns`, inline edit, drag, leaving/arriving rollups, "Open pages". |
| `views/GraphView.tsx` → `views/GraphViewImpl.tsx` + `views/graph/**` | The feature's ONE dynamic import edge → xy-flow: bands by visible topic count (`bands.ts`), the facet axis (`facetAxis.ts`), encoding + legend (`encoding.ts`, `hue.ts` — the one hue palette topics and facet pills share), positions across rebuilds (`reconcile.ts`), saved layout via `useSetMapTopicLayout`. |
| `views/TextView.tsx` | The map as a MARKDOWN TREE a person reads (built from the same store tree, rendered through `MarkdownStream`); Copy hands a person the markdown, Copy for AI hands an agent `seo.map_outline`'s own bytes. |
| `views/PagesWorkspace.tsx` + `views/pages/**` | The convergence screen: the table, filters (+ URL contract `?disposition=&state=&onNoTopic=&topic=` when hosted as a page), the bare-pages tab, the progress strip, `bulk/` (two-click flows with dry-run preview and consequence sentence; kept/set/failed outcomes), `review/` (ReviewDeck in `intent_review_mode`), `runs/` (the three header run controls + their disclosed mandates). |
| `views/HistoryView.tsx` + `proposals/**` | History with filters and restore; `ProposalReview` (ReviewDeck in `proposal_review_mode`, reject policy picker); `MapTopicProposalView` — the ONE component for `map_topic_proposal_v1`, used by chat, the start result and the tool renderer. |
| `panel/` | `TopicDetailBody` + `panel/sections/**` — the one topic panel body in the vision's order (identity, path, facets, counts, pages, planned pages, keywords, generic associations with add/remove through the registered RPC path, history, the topic agent's two controls, changes rehearsed through `seo.map_dry_run`); hosted by overlay `topicalMapTopicPanel` (window or `SidePanelSurface` by the `detail_panel` knob) and by peek kind `seo_map_topic`. |
| `start/` | The start-a-map screen (`START_MAP_SOURCES` over `MAP_AUTHOR_SOURCE_KINDS`, a consequence-stating `ConfirmDialog`, `ask` handled on the screen, streams via `useAuthorTopicalMap`) and its result. |
| `door/` | The brand-free doors: the id door body and the start door (a research topic has no brand). |
| `linkins/` | The seven link-in points (Keyword Workbench `map_topic` column, insights "map these pages", site quick work, brand card, plan node Topic field + site list Map column, CMS nav, coverage topic-gaps tile). |
| `canvas/` | The chat canvas pointer `topical_map` (non-persistable): content, opener, the body in `host="canvas"`. |
| `ui/` | The map UI kit: `TopicStatusMark`, `IntentDot` (+ `intentColorClasses`), `TopicPath`, `TopicCounts`, `FacetChip`, `TopicLabelEditor`, `buildTopicMenuSection`. |
| Outside the feature | Window `TopicalMapWindow` + opener + tools-grid tile + url sync (`features/window-panels`, `features/overlays`); the kind `features/content-ir/kinds/map-topic-proposal.ts` + `MapTopicProposalBlock` in the block dispatch; the `topical_map` tool renderer (`features/tool-call-visualization/renderers/topical-map/`); the surface manifest `marketing-topical-map.manifest.ts` with the five disclosed jobs; the research output card (`features/research/components/outputs/outputDefinitions.ts`). |
| `CONTRACTS.md` | The frozen Phase 0 contracts every lane builds against (props, store, primitives, file ownership). `VERIFY-<lane>.md` beside each lane's code is its browser walk; `VERIFIER-<lane>.md` its zero-authorship brief. |
| Shared (law 5) | `components/official/topic-tree/TopicTree` (store-free tree: virtualised, keyboard, dnd reparent contract; row actions visible wherever hover does not exist) and `components/official/review-deck/ReviewDeck` (one review grammar for proposals and intents). |

## Four things that are easy to get wrong

1. **Absent is not zero.** Every optional field on a topic mirrors a `map_tree` `include` key.
   A tree loaded without `counts` has no `pages` — printing `pages ?? 0` is a confident lie.
   `selectMapLoadedIncludes` / `selectMapTopicCounts.loaded` are how a view tells them apart.
2. **Selection and expansion belong to the slice, never to a component.** Views are routes, so
   a view switch unmounts the body. Anything the user chose that lives in component state dies
   with it. This is U1's done-criterion and the reason the slice exists.
3. **RPC messages reach the person unaltered.** The `seo.*` functions write their refusals FOR
   the caller (22023 argument rules, 23514 attachment policies, 42501 `<fn>_denied`, P0002
   unknown slug). `TopicalMapError.displayMessage` is the function's own sentence;
   `.message` stays the calm generic one for anywhere that must not leak a code. Never reword,
   never swallow — `withTopicalMapErrors` also captures every failure for the Error Inspector
   (`source: "topical-map-rpc"`).
4. **Slugs are the key, ids are addresses.** Topics are addressed by slug everywhere the map
   reasons; the id door exists only to translate a platform UUID back into one.

## Round 22 — a page never vanishes, and a dead topic is never a destination

Migration `seo_topical_map_22_a_page_never_vanishes` (live 2026-09-17, ledger `7d5d82ea834f…`)
changed **meanings, not signatures**. Nothing in `data.ts` moved; several things it returns now
mean something else.

- **A `covers` edge into a topic that is not live is not coverage.** `map_diagnostics.pages_on_no_topic`
  and its sample now count pages with no live coverage **of this map** — rejected and retired
  topics, and other maps' topics, no longer hide a page. The number can RISE when somebody
  rejects a proposal; that is the truth arriving.
- **`current_topics: []` is a real, expected state.** `list_page_intents` lists any page with a
  `covers`/`intent` edge to a topic of this map at ANY status, so a page is never lost with its
  topic; `current_topics` reads live topics only.
- **`intent.topic` is OPTIONAL.** The intent survives its topic being hidden — the decision is
  still true — but the key is omitted while the topic is not live. **Narrow before use.**
- **A retired or rejected topic is never a destination.** `set_page_intents`, `move_map_topic`,
  `merge_map_topics` and every `merge_into:<slug>` policy answer the same `P0002` an invented
  slug gets; `set_page_map_topics` returns the slug in `unknown_slugs`, byte-identical to an
  invented one. Nothing distinguishes the two cases, on purpose.

**What a view uses.** `pageTopicState(view)` in `redux/selectors.ts` answers where ONE page
stands — `in_place` · `leaving` · `arriving` · `on_no_topic` · `intent_topic_hidden`. The first
three are the `intent_colors` knob's own keys (§5); the last two have no colour entry and take
§5's `missing` gray-dashed treatment. `selectPagesOnNoTopic(mapId)` is the client-side twin of
`pages_on_no_topic` over the pages this workspace has listed — the slice stores an EMPTY
coverage array rather than skipping it, so "covers nothing" can never be confused with "never
listed". `pageIntentTone(view, topicSlug)` is unchanged and answers a different question: how
one TOPIC's row should draw one page.

The test is `redux/pageTopicState.test.ts`, run against **recorded server bytes**
(`redux/__fixtures__/listPageIntentsRound22.ts`) — planted and read inside one rolled-back
transaction on the live database, the way the shipped door contract does it. A hand-made
fixture would only prove the selector agrees with whoever wrote it.

## Knobs

`platform.feature_knob`, feature `seo.topical_map`, 53 keys, all overridable by organization,
brand, site and user. Enum vocabularies derive from `features/settings/universal/knobEnumVocabularies.generated.ts`, never hand-typed. A missing row RAISES by design — there is no code fallback, and
`useTopicalMapKnobs` returns `knobs: null` with the error rather than a guessed default.

🚨 **An enum knob's vocabulary is NEVER retyped here.** Every union comes from
`features/settings/universal/knobEnumVocabularies.generated.ts`, which is the live
`allowed_values` of each row (`pnpm generate:knob-enum-vocabularies`; staleness guard
`pnpm check:knob-enum-vocabularies`, with `:self-test`). Until 2026-09-17 they were hand-written
and three had drifted — `proposal_mode`, `description_regeneration_mode`, and `bulk_action_confirm`
missing `never`. Only the defaults overlapped, so nothing looked broken; the moment an admin
picked a value the settings picker legitimately offers, the reader threw and **every map screen
went blank**. An unknown value now degrades: it is captured for the Error Inspector
(`source: "feature-knob-vocabulary"`, carrying the knob address and the offending value) and the
reader falls back to that row's own `default_value`.

## Change log

- **2026-09-20** — Research integration rebuilt server-side (aidream `134d180ed9`): `existing_research`
  reads the `research-topical-map` bundle (named offerings per page with URLs, keyword syntheses, the
  report; the company's own domains named; coverage gaps appended) instead of the assembled document;
  `new_research` now seeds the intent, proposes keywords from the company's own site and runs the pass —
  the result carries `research_keywords`, `research_run_started`, `research_run_note` (additive; the
  start screen's tile copy updated). Migration 0891 (the bundle row) still to be applied from a
  credentialed machine.
- **2026-09-18 (evening)** — Functionality pass after the first browser walk (report:
  `common-docs/projects/table-provisioning/TOPICAL-MAP-UI-WALK-REPORT.md`): the four run
  controls' 422 (`body.organization_id: Extra inputs are not permitted`) fixed on the server —
  the four request models now inherit `AcceptsInjectedScope`; the 2,272-page root's timeout fixed
  on the server (round 29: a topic's pages are measured in ONE performance aggregate); the Text
  view rebuilt as a human-readable markdown tree; `loadedIncludes` derived from the response;
  `marketingRoutes.topicalMapStart`; the graph's saved layout invalidates its reads and its rollup
  no longer replaces the pages listing; touch devices see the tree's row actions; the verifiers'
  tests and recorded All Green fixtures committed. The visual design of every screen is to be
  redone (Arman, 2026-09-18) — this pass is functionality only.
- **2026-09-18** — Phase 1: all seven lanes landed (outline + text, table, graph, topic panel,
  home/start/link-ins/door, pages workspace + runs, proposals/history/kind/canvas/window); six
  zero-authorship verifiers reported PASS-WITH-FINDINGS; the coordinator-owned slice defect
  (`snapshot()` cloned an Immer draft, so every rename and drag failed) fixed with Lane A's witness.

- **2026-09-18** — Phase 0 of the UI build (register: `common-docs/projects/table-provisioning/TOPICAL-MAP-UI-REGISTER.md`): round-22 work re-landed after `7d65a1c41d` removed it; 53-knob cached reader; the three run clients + four ledger readers; the body made host-agnostic behind `TopicalMapRouteBody` and `MapLinkProvider`; the topic panel overlay + peek; `TopicTree`, `ReviewDeck`, the UI kit, the store additions for every view; `CONTRACTS.md` frozen. Owed: `api-types.ts` regeneration (contract pin `62fa56114` is not on aidream `main`).

- **2026-09-17** — Round 22 reflected in the data layer: `intent.topic` optional,
  `pageTopicState` / `selectPagesOnNoTopic` added with a recorded-payload test, and the `/pages`
  list now names the no-topic and hidden-destination states instead of printing blanks. Added
  `map-author.ts` + `useAuthorTopicalMap` for `POST /seo/brands/{brand_id}/map/author` (no
  screen — U4's). Enum knob vocabularies are now derived from the live rows and degrade instead
  of raising.
- **2026-09-17** — U1 (slice, 50 hooks, selectors, knobs, verbatim error surfacing) and the
  route scaffold shipped, with the eleven placement registrations except the topic detail
  window and peek, which wait on U3's panel body.
