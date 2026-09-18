# Topical map UI — frozen contracts (Phase 0)

**Status: FROZEN 2026-09-18.** Every lane builds against this file. A change here is an amendment:
edit this file, add a dated line to its change log, and note it in the build register
(`common-docs/projects/table-provisioning/TOPICAL-MAP-UI-REGISTER.md`). Never a silent edit.
Plan and rulings R1–R18: the coordinator's plan (copied to `…/TOPICAL-MAP-UI-PLAN.md` at Phase 0
close). Local mechanics: `FEATURE.md`. Product truth:
`common-docs/inbox/topical-map-app-requirements.md`.

## 0. Laws every lane inherits (short form)

- Replace a branch of the workspace, never a read, a selector or a hook. `data.ts` has one wrapper
  per `seo.*` function; `hooks.ts` one hook per wrapper.
- RPC sentences reach the person unaltered: `TopicalMapFailed`, `topicalMapErrorText`.
- Absent is not zero: `selectMapLoadedIncludes`, `selectMapTopicCounts(...).loaded`.
- `current_topics: []` and an intent with no `topic` are real states (`pageTopicState`).
- Slugs address topics; ids are doors.
- Every taste is a knob (§7). No hard-coded colours, thresholds, column sets, modes.
- One dynamic import edge in this feature: `views/GraphView.tsx` → `GraphViewImpl`. Nothing else
  lazies (code-splitting law, fragmentation rule 3).
- No barrels. No new top-level features. No hand-typed mandate keys (`MANDATE_KEYS` only).
- Doors (R17): every record named opens — `EntityRef` (peek + new tab) for records; a window
  panel where one exists, else a new tab; never a plain dead label.
- Lucide only; `BrainCircuit` for AI; semantic tokens only; `ConfirmDialog`/`confirm()` never
  browser dialogs; `toast` from `@/lib/toast`.
- Commit your own files by path; log your change-log line in the register, not `FEATURE.md`.

## 1. Hosts and the body contract (R5)

```ts
export type MapHost = "page" | "window" | "drawer" | "canvas" | "peek";
export type MapWorkspaceScreen = MapViewKey | "pages" | "history";   // unchanged

export interface TopicalMapWorkspaceBodyProps {
  mapId: string;
  screen: MapWorkspaceScreen;
  /** `?site=` or the window's own choice. null = every site the caller may view. */
  siteId: string | null;
  host: MapHost;
  /** A record-only grantee, or a canvas viewer. Every write control is absent, not disabled. */
  readOnly?: boolean;
  /** Page host: navigates. Window/canvas host: the owner keeps the screen in its own state. */
  onScreenChange?: (screen: MapWorkspaceScreen) => void;
}
```

- `TopicalMapWorkspaceBody` renders NO page chrome: its root is `h-full min-h-0 flex flex-col`.
  It dispatches `mapOpened`, `setView`, `setSiteId`, reveals `?topic=` only when `host === "page"`
  (the route adapter passes `focusSlug` via a prop `revealSlug?: string | null`), mounts the
  `SurfaceRuntimeProvider` (§6) and branches to ONE view file:
  `views/OutlineView.tsx`, `views/TableView.tsx`, `views/GraphView.tsx`, `views/TextView.tsx`,
  `views/PagesWorkspace.tsx`, `views/HistoryView.tsx`.
- Every view has the same props: `{ mapId: string; siteId: string | null; host: MapHost;
  readOnly: boolean }`. A view reads everything else from the store and the hooks.
- Route files (`app/(core)/marketing/[brandId]/content/map/[mapId]/**`) are the ONLY place
  `useMapWorkspaceParams` and `useMarketingBrand` are read for the body. They own the page chrome
  (`h-full overflow-hidden bg-textured` + shell-header offset) and render
  `<MapLinkProvider brand={brand}><TopicalMapWorkspaceBody … host="page" /></MapLinkProvider>`
  through one client adapter component `components/TopicalMapRouteBody.tsx`.
- `TopicalMapHeader` (the shell header) stays as is; it is a route-host component.

## 2. Links — `links.tsx` (R7)

```ts
export interface MapLinks {
  brandSeg: string | null;                     // null = brand not readable / no brand host
  home: () => string | null;                   // brand maps home, or null
  mapView: (mapId: string, screen: MapWorkspaceScreen, siteId?: string | null) => string;
  topic: (mapId: string, slug: string) => string;       // brand route +?topic= or the id door
  topicById: (topicId: string) => string;               // /marketing/topical-maps/topics/{id}
  page: (pageId: string) => string;                     // /marketing/pages/{id}
  planNode: (nodeId: string) => string;                 // /marketing/content-plan/nodes/{id}
  site: (siteId: string) => string;                     // marketingRoutes.site(brandSeg|null, siteId)
  keywordWorkbench: (siteId: string, topicSlug?: string) => string | null; // null without a brand
}
export function MapLinkProvider({ brand, children }: { brand: MarketingBrandContextValue | null; children }): JSX.Element;
export function useMapLinks(): MapLinks;   // never throws; default provider = no brand
```
All hrefs come from `features/marketing/lib/routes.ts` builders. Never hand-build a map URL.

## 3. The store (frozen additions; `redux/types.ts`, `slice.ts`, `selectors.ts`)

Existing state and actions are unchanged. Added to `TopicalMapWorkspaceState`:

```ts
pageFilters: MapPageFilters;          // the pages workspace
checkedPageIds: string[];             // bulk selection of pages
graph: { focusSlug: string | null; encodingMode: "structure" | "convergence" };
table: { hierarchy: boolean; columns: string[] | null };   // null = the knob's default set
review: { cursorSlug: string | null; cursorPageId: string | null };
siblingSort: MapSiblingSort;          // "sort_order" | "name" | "pages" | "keywords" | "planned"

export interface MapPageFilters {
  text: string;
  topicSlug: string | null;
  regionSlug: string | null;
  traffic: "all" | "low" | "with_traffic";   // "low" = clicks <= pages_low_traffic_clicks_max
  disposition: PageIntentDisposition | null;
  state: PageIntentState | null;
  source: PageIntentSource | null;
  onNoTopic: boolean;                        // the list_pages_without_topic tab
}
```
Actions: `setPageFilters(Partial)`, `clearPageFilters`, `setCheckedPages(ids)`, `togglePageChecked(id)`,
`setGraphFocus(slug|null)`, `setGraphEncodingMode(mode)`, `setTableHierarchy(bool)`,
`setTableColumns(string[]|null)`, `setReviewCursor({slug?, pageId?})`, `setSiblingSort(sort)`.
Selectors (curried by mapId, `cached()`): `selectMapPageFilters`, `selectMapCheckedPageIds`,
`selectMapGraph`, `selectMapTable`, `selectMapReview`, `selectMapSiblingSort`.
`selectVisibleMapTopics` orders siblings by `siblingSort` (`sort_order` = the tree's own order).
The per-topic selector cache evicts its `topic:${mapId}:` keys on `mapClosed` (R16); no LRU.
Defaults live in `createWorkspaceState`.

## 4. Shared primitives (law 5) — built once, adapters everywhere (R11)

### 4.1 `components/official/topic-tree/TopicTree.tsx` — store-free
```ts
export interface TopicTreeRow {
  id: string; parentId: string | null; depth: number;
  label: string; description?: string | null; status?: string;
  hasChildren: boolean; expanded: boolean; selected: boolean; checked?: boolean;
  counts?: { pages?: number; planned?: number; keywords?: number };   // absent = not loaded
  /** Slot rendered after the label (marks, dots, chips). */
  trailing?: ReactNode;
  /** Slot rendered at the far right (row actions). */
  actions?: ReactNode;
}
export interface TopicTreeProps {
  rows: readonly TopicTreeRow[];                 // flattened, visible rows in order
  ariaLabel: string;
  density?: "compact" | "comfortable";           // default compact
  virtualize?: boolean;                          // default rows.length > 200
  onToggleExpand: (id: string) => void;
  onSelect: (id: string, e: { shiftKey: boolean; metaKey: boolean }) => void;
  onActivate?: (id: string) => void;             // Enter / double-click / click on the selected label
  onCheck?: (id: string) => void;                // Space; shows checkboxes when present
  onMove?: (id: string, newParentId: string | null) => void;   // enables dnd-kit drag-to-reparent
  onRenameCommit?: (id: string, name: string) => void;         // F2 / activate → inline editor
  renderHover?: (row: TopicTreeRow) => ReactNode;              // hover card content, when set
  emptyState?: ReactNode;
  className?: string;
}
```
Keyboard: ↑/↓ select, ←/→ collapse/expand (→ on a leaf selects the next), Enter activate, F2 rename,
Space check, type-ahead by label, Home/End. Built from `features/files/components/core/FileTree`'s
virtualisation + keyboard model and `content-plan/components/PlanTree.tsx`'s reparent contract
(drop on a row = one reparent; a cycle is refused before the call; root drop strip when `onMove`).

### 4.2 `components/official/review-deck/ReviewDeck.tsx` — one review grammar
```ts
export type ReviewMode = "one_by_one" | "accept_all" | "reject_all" | "batch";
export interface ReviewItem { id: string; title: string; subtitle?: string; body?: ReactNode; meta?: ReactNode }
export interface ReviewDeckProps {
  items: readonly ReviewItem[];
  mode: ReviewMode;                               // from the knob; a mode switcher is rendered
  onModeChange: (mode: ReviewMode) => void;
  cursorId: string | null; onCursorChange: (id: string | null) => void;
  onAccept: (ids: string[]) => Promise<void> | void;
  onReject: (ids: string[]) => Promise<void> | void;
  onSkip?: (id: string) => void;
  acceptLabel?: string; rejectLabel?: string;      // default "Accept" / "Reject"
  /** Rendered beside the reject control (e.g. the reject policy picker). */
  rejectOptions?: ReactNode;
  /** A consequence sentence shown before accept_all / reject_all / batch runs (law: destructive clicks state their consequence). */
  consequence: (ids: string[], verb: "accept" | "reject") => string;
  emptyState?: ReactNode;
}
```
Keyboard in one_by_one: A accept, R reject, S skip, ↑/↓ cursor. `accept_all`/`reject_all` show one
button with the consequence sentence in a `ConfirmDialog`; `batch` = checkboxes + a bulk bar.

### 4.3 The map UI kit — `features/marketing/seo/topical-map/ui/`
- `TopicStatusMark.tsx` `{ status: MapTopicStatus | string; compact?: boolean }` — proposed /
  retired / rejected marks; active renders nothing.
- `IntentDot.tsx` `{ tone: PageIntentTone | PageTopicState; colors: MapIntentColors; label?: string }`
  — `on_no_topic` / `intent_topic_hidden` use `colors.missing`. Colour names → token classes via
  `intentColorClasses.ts` (`green | amber | blue | red | gray_dashed | purple_dashed`; an unknown
  name renders the `missing` treatment AND captures an error — never silently blank).
- `TopicPath.tsx` `{ mapId: string; slug: string; onNavigate?: (slug) => void }` — root-first
  crumbs from `selectMapTopicPath`.
- `TopicCounts.tsx` `{ counts: MapTopicCounts; compact?: boolean }` — renders nothing when
  `!counts.loaded` (title "counts not loaded for this view").
- `FacetChip.tsx` `{ facetKey: string; valueSlug: string; inherited?: boolean; fromSlug?: string; onClear?: () => void }`.
- `TopicLabelEditor.tsx` `{ value: string; onCommit: (v: string) => void; onCancel: () => void; maxLength?: number }`.
- `topicMenuSection.tsx` `buildTopicMenuSection({ mapId, slug, links, actions })` → the
  `extraSections` entry for `NonEditableContextMenu` (open panel, open in window, copy slug,
  rename, move, retire/reject, ask the topic agent).

## 5. The topic panel (R13) and the map window

- Overlay id **`topicalMapTopicPanel`** (`features/overlays/catalogue.ts`): `{ label: "Topic",
  instanceMode: "multi", isWindow: true }`. Metadata slug `topical-map-topic-panel`,
  `mobilePresentation: "drawer"`, `defaultData: { mapId: "", slug: "", siteId: null }`,
  `preservation.dataKeys: ["mapId","slug","siteId"]`, `urlSync: { key: "topic" }`.
- Component `features/window-panels/windows/marketing/TopicalMapTopicPanel.tsx`: reads
  `detail_panel` through `useTopicalMapKnobs`; `window` → `<WindowPanel>`; `drawer` →
  `<SidePanelSurface>`; both around ONE `<TopicDetailBody host=… />`. While knobs load it renders
  the component-library loading state; on knob error it renders `TopicalMapFailed`.
- Opener `features/overlays/openers/topicalMapTopicPanel.tsx`: `useOpenTopicPanel()` →
  `(args: { mapId: string; slug: string; siteId?: string | null }) => void`.
- `panel/TopicDetailBody.tsx`: `{ mapId: string; slug: string; siteId: string | null; host: MapHost; readOnly?: boolean }`.
  Phase 0 ships a typed stub that says "The topic panel is being built" with the topic's name and
  path (honest, never dead). Lane D fills it.
- Peek kind `seo_map_topic` (`features/organizations/peek/kinds-list.ts` + `registry.ts`,
  `kinds/SeoMapTopicPeek.tsx`): resolves the topic id → `{ map_id, slug }` via `useMapTopicRow` and
  renders `<TopicDetailBody host="peek" />`.
- RESERVED for Lane G (not registered in Phase 0): overlay id `topicalMapWindow`, slug
  `topical-map-window`, `defaultData: { mapId: "", screen: "outline", siteId: null }`, opener
  `useOpenTopicalMapWindow()` → `({ mapId, screen?, siteId? }) => void`, component
  `windows/marketing/TopicalMapWindow.tsx` hosting `TopicalMapWorkspaceBody host="window"` with the
  view switcher in the title bar. Canvas pointer type `topical_map` (R12) is also Lane G's.

## 6. Surface runtime

The body mounts `<SurfaceRuntimeProvider surfaceName="matrx-user/marketing-topical-map"
getScope={…createMarketingTopicalMapScope(values)} />` with the live store values. Manifest
readiness → `partial` in Phase 0. `agentRoles` are added ONLY by the lane that ships the control
running that mandate (E: `seo.map_author`; F: `seo.page_mapper`, `seo.page_intent_proposer`;
D: `seo.topic_curation`; G: `seo.map_curation`) — never ahead of the control (agent-disclosure law).

**The two in-map agents are `seo.map_curation` ("Topical Map Agent") and `seo.topic_curation`
("Topical Map Topic Agent")** — aidream `df5603a3`/`d2b14cee` on this branch; `declare_mandate`
refuses a key ending in `_agent`, so the plan's `seo.map_agent`/`seo.topic_agent` names do not
exist. Their published client keys are `seo__map_curation` / `seo__topic_curation`, regenerated in
aidream's `apps/shared/matrx-agents/mandates/keys.generated.ts` but NOT yet on npm (publishing
needs an `npm/*/v*` tag, a release action). Until `@ai-matrx/agents` republishes, a lane that
launches either key adds it to `scripts/mandate-keys-allowlist.json` WITH the reason "declared in
aidream d2b14cee; package republish pending" and uses the string literal; the coordinator removes
the allowlist rows on adoption. Same for `seo__page_mapper` / `seo__page_intent_proposer`, which
that regeneration added for the first time. Change mode is a GATE on the server: in `propose`,
`upsert`/`replace_section`/`split` write `status='proposed'` and every other writing action is
converted to a rolled-back dry run whose result carries a note — a screen shows that note.

## 7. Knobs — `knobs.ts`

All 53 live `seo.topical_map` keys are read by ONE TanStack-cached reader
(`useTopicalMapKnobs()`, query key `topicalMapKeys.knobs`, staleTime 60s) returning
`{ knobs: TopicalMapKnobs | null; loading; error }` exactly as today. Enum unions derive from
`knobEnumVocabularies.generated.ts`. `table_default_columns` is read with `knobStringList`.
`TOPICAL_MAP_KNOB_KEYS` lists every key; a lane that needs a knob this file lacks escalates to the
coordinator (one migration, one edit here) — it never reads `platform.feature_knob` itself.

Keys by owner: outline `default_view outline_detail outline_hover_popover
outline_description_max_chars outline_max_chars outline_intent_dots`; graph `graph_band_card_max
graph_band_compact_max graph_band_line_max graph_encoding graph_auto_layout`; table
`table_default_columns`; panel `detail_panel description_regeneration_mode
topic_agent_change_mode`; home `home_single_map_opens_workspace map_agent_change_mode proposal_mode
overview_* neighborhood_* topic_description_max_chars page_summary_max_words
geography_branch_policy`; pages `intent_review_mode bulk_action_confirm
bulk_action_confirm_threshold intent_colors performance_window_days pages_low_traffic_clicks_max
mapping_* intent_* region_*`; proposals `proposal_review_mode`.

## 8. Server run clients (mirror `map-author.ts` + `useAuthorTopicalMap.ts`)

| File | Path | Hook | Input |
|---|---|---|---|
| `map-pages.ts` | `POST /seo/sites/{site_id}/map/pages` | `useMapPagesRun({ siteId, mapId, organizationId?, onResult? })` → `{ …command, run(input) }` | `{ refresh?, limit?, batchSize?, dryRun? }` |
| `map-regions.ts` | `POST /seo/sites/{site_id}/map/regions` | `useMapRegionsRun(...)` | `{ deriveValues?, bindPages?, limit?, dryRun? }` (exact fields from the generated schema) |
| `map-intents.ts` | `POST /seo/sites/{site_id}/map/intents` | `useProposeIntentsRun(...)` | `{ refresh?, limit?, batchSize?, topicSlugs?, dryRun? }` |

Each: typed body from `components["schemas"]`, the server's own stage kinds → sentences, a
`parse…Result` that refuses a malformed document loudly, `live: { label }` so the run floats in
`LiveRunWindow`, invalidation of `topicalMapKeys.map(mapId)` and the status readers on result.
Readers in `data.ts` + `hooks.ts`: `pageMappingStatus(siteId)` / `usePageMappingStatus`,
`pageMappingWantedTopics(siteId, limit)` / `usePageMappingWantedTopics`,
`pageMappingWantedTopicsHeldBack(siteId, limit)` / `usePageMappingWantedTopicsHeldBack`,
`listPagesWithoutTopic(siteId, limit, offset)` / `usePagesWithoutTopic`. Query keys under
`topicalMapKeys`.

## 9. File ownership (Phase 1)

| Lane | Owns exclusively |
|---|---|
| A | `views/OutlineView.tsx`, `views/TextView.tsx`, `views/outline/**` |
| B | `views/TableView.tsx`, `views/table/**` |
| C | `views/GraphView.tsx`, `views/GraphViewImpl.tsx`, `views/graph/**` |
| D | `panel/**`, `windows/marketing/TopicalMapTopicPanel.tsx` (body only), `peek/kinds/SeoMapTopicPeek.tsx` |
| E | `components/TopicalMapHome.tsx`, `components/TopicalMapHomeHeader.tsx`, `start/**`, `app/(core)/marketing/topical-maps/[mapId]/page.tsx`, the seven link-in screens, `features/research/components/outputs/outputDefinitions.ts`, the manifest's `agentRoles` (author) |
| F | `views/PagesWorkspace.tsx`, `views/pages/**`, the manifest's `agentRoles` (mapper, proposer) |
| G | `views/HistoryView.tsx`, `proposals/**`, `features/content-ir/kinds/map-topic-proposal.ts` + dispatch entry, `features/tool-call-visualization/renderers/topical-map/**` + registry entry, canvas pointer type files, `windows/marketing/TopicalMapWindow.tsx`, its catalogue/metadata/opener/controller block, tools-grid tile, hydrator |
| coordinator | `CONTRACTS.md`, `FEATURE.md`, `knobs.ts`, `redux/**`, `ui/**`, `links.tsx`, `components/TopicalMapWorkspaceBody.tsx`, `components/TopicalMapRouteBody.tsx`, `components/TopicalMapHeader.tsx`, `data.ts`, `hooks.ts`, `types.ts`, the route files, `TopicTree`, `ReviewDeck` |

A lane needing a change in a coordinator-owned file files it in the register and continues on a
local adapter; the coordinator lands it.

## Change log

- 2026-09-18 — Frozen at Phase 0.
- 2026-09-18 — Amendment: the in-map mandate keys are `seo.map_curation` / `seo.topic_curation` (Lane S); allowlist rule until the package republishes; propose mode is a server gate.
