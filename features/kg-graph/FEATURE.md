# FEATURE.md — `kg-graph`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-06-02`

---

## Purpose

Interactive cytoscape visualization of the knowledge graph (`rag.kg_entities` +
`rag.kg_edges`). Two surfaces: an org-wide canvas at `/knowledge-graph` and a
per-scope neighborhood canvas at `/scopes/[scopeId]/graph`. Clicking a node opens
a side panel showing that entity's source mentions, deep-linked to their source.
Lets the product owner spot clusters, gaps, and weaknesses in their own data.

This is Phase G of the Knowledge Graph plan. It is read-only and consumes the
existing corpus (677 entities / 1,494 edges from code-graph work, growing with
NER entities once backfill runs).

---

## Entry points

**Routes**
- `app/(core)/knowledge-graph/page.tsx` — org-wide graph. Server page wraps the
  `KnowledgeGraphClient` shell, which reads the active org from
  `useActiveContext()` and renders `<KgGraphCanvas mode="org" />`.
- `app/(core)/scopes/[scopeId]/graph/page.tsx` — one scope's neighborhood.
  Renders `<KgGraphCanvas mode="scope" scopeId={...} />`.

**Components**
- `KgGraphCanvas` (`components/KgGraphCanvas.tsx`) — the single surface for both
  modes. Owns the fetch and the chrome: toolbar (search / layout switcher /
  colour + size encoding / kind-filter / node-count + truncated indicator),
  legend, empty/error/loading states, and the side panel. Loads the cytoscape
  render surface via `next/dynamic({ ssr: false })`.
- `KgGraphCytoscape` (`components/KgGraphCytoscape.tsx`) — PRESENTATIONAL render
  surface: renders the graph container + minimap + on-canvas zoom controls, then
  wires reactive inputs (data / theme / encoding / layout / selection / search) to
  imperative `cytoscape/ops` through thin effects. CLIENT-ONLY (imports cytoscape
  + extensions, which touch `window` at import). Never import directly — only
  `KgGraphCanvas` loads it dynamically.
- `KgGraphLegend` (`components/KgGraphLegend.tsx`) — overlay key for the active
  colour encoding (kind swatches, or detected-community count).
- `KgGraphSidePanel` (`components/KgGraphSidePanel.tsx`) — clicked-entity drill
  down: stats + source mentions. Reuses `citationHrefFor()` from
  `features/rag/api/search.ts` (not redeclared) to deep-link each mention.

**Cytoscape engine** (`cytoscape/` — direct integration, no React wrapper)
- `useKgCytoscape.ts` — instance LIFECYCLE only: create once, register extensions,
  init layout-utilities + minimap, bind events once (latest-callback refs), observe
  resize, `cy.destroy()` on unmount (StrictMode/HMR-safe). Returns `{ containerRef,
  getCy }`.
- `ops.ts` — imperative operations: `loadGraph` (swap elements → analyse → encode →
  layout), `applyTheme` (live stylesheet swap, no re-layout), `runLayout`,
  `focusNeighborhood`/`clearFocus`, `applySearch`, `selectNode`, animated
  `fitAll`/`fitTo`/`zoomByFactor`.
- `analysis.ts` — `buildElements`; `annotateGraph` (PageRank importance + Markov
  communities, cached into element data); `applyEncoding` (point colour/size at the
  chosen dimension). All algorithms ship in cytoscape core 3.x.
- `style.ts` — theme-aware stylesheet (`buildStylesheet`) + interaction-class names.
- `layouts.ts` — layout presets (`fcose` default, `cola` live, `concentric` by
  importance, `grid`) + `KG_LAYOUTS` switcher metadata.
- `register.ts` — the one place `cytoscape.use(...)` runs (globalThis-guarded);
  imports the navigator CSS + `minimap.css` override.
- `extensions.d.ts` / `minimap.css` — ambient types for the untyped extensions
  (cola, layout-utilities) and the docked/themed minimap chrome.

**Services**
- `service/kgGraphService.ts` — typed client over the aidream `/kg` router via
  `@/lib/python-client` (React → Python direct, JWT attached). `fetchKgGraph`,
  `fetchEntityMentions`.

**API endpoints** (aidream — bare prefix `/kg`, public URL `/api/kg/*`)
- `GET /api/kg/graph?organization_id=&scope_id=&kind=&depth=&limit=` →
  `GraphPayload`.
- `GET /api/kg/graph/entity/{id}/mentions?limit=&offset=` → `MentionsPage`.

**Redux slice(s)**
- None. Read-mostly single-fetch-per-view → local component state (per the
  "no parallel slice for a single-fetch view" guidance). KG suggestions own the
  first KG slice; this view doesn't need one.

---

## Data model

**Database tables** (Supabase, schema `rag`, read-only)
- `kg_entities` — graph nodes. Org-shared; `organization_id IS NULL` = global
  code-graph data visible to all authenticated users.
- `kg_edges` — typed edges between entities (`src_id`/`dst_id`).
- `kg_chunk_entities` + `kg_chunks` — mentions. `kg_chunks.owner_id` is NOT NULL;
  mention drill-down is filtered to chunks the caller owns or in an org they
  belong to.
- `ctx_scope_assignments` + `ctx_scopes` — scope tagging; the neighborhood seed.

**Key types** (`features/kg-graph/types.ts`, mirror the Pydantic models)
- `GraphNode`, `GraphEdge`, `GraphPayload`
- `MentionRow`, `MentionsPage`
- `GraphQueryParams`, `KgGraphMode`

---

## Key flows

1. **Org-wide:** canvas fetches `GET /kg/graph?organization_id=<active>`. Backend
   returns the most-connected visible entities (NULL-org global + member orgs),
   degree-ranked, capped at `limit` (default 500, max 2000); `truncated=true` when
   capped. Edges returned are only those whose both endpoints are in the node set.
2. **Scope neighborhood:** canvas fetches `GET /kg/graph?scope_id=<id>`. Backend
   verifies scope access (404 otherwise), seeds from entities mentioned in the
   scope's tagged sources, walks `depth` hops (hard-capped at 3) along edges.
3. **Node click → side panel:** `fetchEntityMentions(id)` → mentions the caller
   can access; each deep-links via `citationHrefFor()`.
4. **Kind filter:** client-side narrowing of the already-fetched node/edge set.

---

## Invariants / gotchas

- `KgGraphCytoscape` is **client-only** — it MUST stay behind
  `next/dynamic({ ssr: false })`. cytoscape touches `window`/DOM at import; a
  static import in a server-rendered page breaks the build.
- **Direct integration, no React wrapper.** `react-cytoscapejs` was dropped (it's
  unmaintained, uses React-15-era `findDOMNode` removed in React 19, and offers no
  extension API). The instance is owned by `useKgCytoscape` via `useRef` +
  `useEffect`; every later change is imperative through `ops` against `getCy()`.
- **`packComponents` needs `cytoscape-layout-utilities`.** fcose silently skips
  component packing unless the extension is registered AND `cy.layoutUtilities(...)`
  was called on the instance. Without it, disconnected clusters scatter across empty
  canvas — the original "flung-apart" bug. The hook does that init.
- **Extensions register exactly once** via `register.ts` (globalThis-guarded so
  Turbopack HMR / StrictMode don't double-register and throw).
- **Per-user visibility is enforced server-side**, two layers: entity nodes are
  scoped to NULL-org + member orgs; mention snippets are scoped to chunks the
  caller owns. The FE never assumes it can see everything — it renders whatever
  the backend returns and shows the "capped" indicator.
- Per-kind hues are raw hex in `constants.ts` (read fine on either theme); the
  theme-dependent chrome (label/halo/edge/selection) is per-`ThemeMode` in
  `KG_CHROME` and swapped live with `cy.style().fromJson(...).update()` (no
  re-layout). cytoscape can't read Tailwind classes, so all values are literals.
- `cytoscape-navigator` overwrites the minimap container's className → its chrome
  is styled via `cytoscape/minimap.css` (a `body .cytoscape-navigator` override
  using HSL design tokens, so it themes for free).
- No emojis. Lucide icons only for chrome.

---

## Doctrine compliance

- **No local types that belong elsewhere:** `types.ts` mirrors the backend
  contract (the source of truth is the Pydantic model); reused `RagSearchHit` +
  `citationHrefFor` from `features/rag` rather than redeclaring.
- **No recreated components:** reused `Select`, `Skeleton`, `ScrollArea`,
  `Badge`, `useIsMobile`, `citationHrefFor`.
- **No parallel Redux slice:** read-mostly single fetch → local state, by design.
- **No duplicated hook logic:** active-org via the existing `useActiveContext()`.
- If deleted, this feature rebuilds in minutes from `KgGraphCanvas` +
  `kgGraphService` + the `/kg` router — all generic, named, documented.

---

## Change log

- 2026-06-04 — Phase 1: de-noise + evidence drill-down (see
  `docs/PRODUCT_DIRECTION.md` + `docs/knowledge/04_CURRENT_STATE_AND_PATH.md`).
  Co-occurrence edges recede to a faint baseline (they're noise until typed); the
  low-value scaffolding kinds (phone/email/url/address) are hidden by default with
  a "Noise hidden (N)" toggle. The side panel is rebuilt as an **Evidence panel**:
  dedupes inflated mentions by `(chunk_id, span_start)`, groups passages by source,
  highlights the entity in each passage, supports copy, forward-wires a `?find=`
  note anchor. **Fixed a real bug surfaced by verification:** the drill-down panel
  rendered off-screen (canvas flex item lacked `min-w-0`, so a fixed-width
  cytoscape `<canvas>` blocked it from shrinking) — the panel was never visible.
  Ranking deliberately does NOT use confidence (undecided trust placeholder).
  Verified live against the legal corpus.
- 2026-06-03 — Performance: fast first paint, never load the whole graph.
  Toolbar **Detail** budget (Overview 75 / Standard 150 / Detailed 350 / Maximum
  1000) — fetch only the top-N most-connected nodes; "top N — raise Detail" when
  capped. **Lazy analysis** — PageRank (importance) and Markov (community) now run
  only when the chosen encoding needs them, cached per-instance in a WeakMap, so
  the default kind/connections view runs none. **Adaptive layout** — fcose drops
  to draft quality + fewer iterations above 150 nodes. cytoscape perf flags
  (`hideEdgesOnViewport`, `textureOnViewport`). Measured first-paint compute at
  345 nodes / 5.6k edges: ~9.2s → ~0.26s (layout 1900→120ms; analysis ~325ms→0
  on default). NOTE: the remaining latency at scale is the backend `/kg/graph`
  handler (the DB query itself is ~3ms) and ultimately needs server-side
  pagination / a neighbour-expansion endpoint for 100×+ corpora.
- 2026-06-03 — Interaction fixes: select-trigger icon alignment (inline flex over
  shadcn's `[&>span]:line-clamp-1`), click-to-pin focus (persist via selectedId,
  hover suppressed while pinned), Ctrl/Cmd-click multi-select (`additive`).
- 2026-06-03 — Pro rebuild of the render surface. Dropped `react-cytoscapejs`
  (unmaintained / React-19-incompatible) for a direct `useRef`+`useEffect`
  integration (`cytoscape/` engine: `useKgCytoscape`, `ops`, `analysis`, `style`,
  `layouts`, `register`). Added: `cytoscape-layout-utilities` (fixes flung-apart
  disconnected clusters via fcose `packComponents`), `cytoscape-navigator` minimap,
  `cytoscape-cola` live layout. New features — layout switcher (force / live /
  by-importance / grid), colour-by kind **or** detected community (Markov
  clustering), size-by connections **or** importance (PageRank), hover neighbour
  highlight, box-select + native group-drag, node search, animated zoom/fit
  controls, legend. Rich theme-aware stylesheet with focus/faded/selected states.
- 2026-06-03 — Theme-aware canvas chrome. Per-`ThemeMode` label/halo/edge/
  selection palette (`KG_CHROME` + `kgChrome()` in `constants.ts`); `text-outline`
  label halo so labels stay legible over nodes, edge mats, or the bare canvas in
  either theme; live re-skin on theme toggle via `cy.style().fromJson(...).update()`
  (no re-layout, positions preserved); `nodeDimensionsIncludeLabels` to cut label
  overlap. Fixes washed-out/illegible labels in light mode.
- 2026-06-02 — Phase G: initial cytoscape KG canvas (org-wide + per-scope),
  side-panel drill-down, `/kg` backend router, nav links from ScopesHub +
  ScopeDetailView.
