# FEATURE.md — `kg-graph` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/knowledge-graph/STATE.md`
> — read it before touching this feature in ANY repo. Purpose, product direction, the measured
> state of the graph data, the rulings, and the roadmap all live there. This file is the file map
> and the traps.

The cytoscape knowledge-graph canvas. Two modes, one component: org-wide at `/knowledge-graph`
and `/knowledge/graph`, per-scope neighbourhood at `/scopes/[scopeId]/graph`. Read-only.

## Files

**Routes** — `app/(core)/knowledge-graph/page.tsx`, `app/(core)/knowledge/graph/page.tsx`,
`app/(core)/scopes/[scopeId]/graph/page.tsx`.

**Components** — `KgGraphCanvas` (the single surface for both modes: fetch, toolbar, legend,
empty/error/loading, side panel) · `KgGraphCytoscape` (presentational render surface, client-only)
· `KgGraphLegend` · `KgGraphSidePanel` (evidence drill-down; reuses `citationHrefFor()` from
`features/rag/api/search.ts`) · `KgGraphCard` (lazy mini preview) · `KgOrgFilter` / `KgScopeFilter`.

**Cytoscape engine** (`cytoscape/`, direct integration, no React wrapper) — `useKgCytoscape.ts`
(instance lifecycle only) · `ops.ts` (imperative ops) · `analysis.ts` (`buildElements`,
`annotateGraph` PageRank + Markov, `applyEncoding`) · `style.ts` · `layouts.ts` · `register.ts`
(the one place `cytoscape.use()` runs) · `extensions.d.ts`, `minimap.css`.

**Service** — `service/kgGraphService.ts` (`fetchKgGraph`, `fetchEntityMentions` over the aidream
`/kg` router via `@/lib/python-client`) · `service/graphPreview.ts` (card cache/dedupe).

**Types** — `types.ts` mirrors the backend Pydantic models; the backend is the source of truth.

**Redux** — none, by design. Read-mostly single-fetch-per-view → local component state.

## Traps

- **`KgGraphCytoscape` MUST stay behind `next/dynamic({ ssr: false })`.** cytoscape touches
  `window`/DOM at import; a static import in a server-rendered page breaks the build. Never import
  it directly — only `KgGraphCanvas` loads it.
- **Never reintroduce `react-cytoscapejs`.** Unmaintained, uses React-15-era `findDOMNode` removed
  in React 19, no extension API.
- **`packComponents` needs `cytoscape-layout-utilities`** registered AND `cy.layoutUtilities(...)`
  called on the instance, or fcose silently skips packing and disconnected clusters scatter across
  empty canvas. `useKgCytoscape` does that init.
- **Extensions register exactly once** via `register.ts` (globalThis-guarded, so Turbopack HMR and
  StrictMode do not double-register and throw).
- **cytoscape cannot read Tailwind classes** — every colour is a literal. Per-kind hues are raw hex
  in `constants.ts`; theme-dependent chrome is per-`ThemeMode` in `KG_CHROME` and swapped live with
  `cy.style().fromJson(...).update()` (no re-layout, positions preserved).
- **`cytoscape-navigator` overwrites the minimap container's className** → style it via
  `cytoscape/minimap.css` (a `body .cytoscape-navigator` override using HSL design tokens).
- **Per-user visibility is enforced server-side**, two layers: entity nodes scoped to NULL-org +
  member orgs, mention snippets scoped to chunks the caller owns. The FE renders whatever the
  backend returns and shows the "capped" indicator; it never assumes it can see everything.
- **The engine is reused outside this feature** — `features/marketing/components/inspection/link-graph/`
  consumes `useKgCytoscape`, `ops`, `layouts`, `style`/`KG_CLASS` and the chrome/tier constants.
  Keep their signatures stable.
- **Ranking must NOT use `confidence`** — it is an undecided trust placeholder, not a quality
  signal (knowledge-graph DECISIONS D7).
- **Agent-writable targets:** `graph_search`, `graph_kind_filter`, `graph_layout` (`applyPolicy:
  "auto"`) and `graph_detail_level` (`"ask"` — it re-REQUESTS the graph at up to a 1000-node budget,
  which is real backend work the user should get to decline). Every handler calls the SAME setter
  the toolbar control's `onChange` calls and validates against the vocabulary the UI renders from
  (`KG_DETAIL_LEVELS`, `KG_LAYOUTS`, the payload's own `kinds`) — never a re-typed literal.
  Deliberately NOT writable and not worth re-litigating: the org / scope / scope-type selectors
  (they choose *whose* knowledge is drawn — identity, not view state), the colour-by / size-by
  encodings (`KgColorBy` / `KgSizeBy` are types with no runtime vocabulary constant), hide-noise,
  and the entity payload itself. There is no entity-authoring editor on this canvas at all.
- No emojis. Lucide icons only for chrome.

## Endpoints consumed

`GET /api/kg/graph?organization_id=&scope_id=&kind=&depth=&limit=` → `GraphPayload`
(default limit 500, max 2000, `truncated=true` when capped; scope walks are hard-capped at 3 hops).
`GET /api/kg/graph/entity/{id}/mentions?limit=&offset=` → `MentionsPage`.
