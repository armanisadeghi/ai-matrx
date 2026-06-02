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
  modes. Owns the fetch, toolbar (fit / kind-filter / node-count + truncated
  indicator), empty/error/loading states, and the side panel. Loads the
  cytoscape render surface via `next/dynamic({ ssr: false })`.
- `KgGraphCytoscape` (`components/KgGraphCytoscape.tsx`) — the actual
  `<CytoscapeComponent>` render surface. CLIENT-ONLY (imports `cytoscape` /
  `react-cytoscapejs` / `cytoscape-fcose`, which touch `window` at import). Never
  import directly — only `KgGraphCanvas` loads it dynamically.
- `KgGraphSidePanel` (`components/KgGraphSidePanel.tsx`) — clicked-entity drill
  down: stats + source mentions. Reuses `citationHrefFor()` from
  `features/rag/api/search.ts` (not redeclared) to deep-link each mention.

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
- **Per-user visibility is enforced server-side**, two layers: entity nodes are
  scoped to NULL-org + member orgs; mention snippets are scoped to chunks the
  caller owns. The FE never assumes it can see everything — it renders whatever
  the backend returns and shows the "capped" indicator.
- Color/size styling lives in `constants.ts` as raw hex (cytoscape can't read
  Tailwind classes). Chrome around the canvas uses semantic classes + Lucide.
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

- 2026-06-02 — Phase G: initial cytoscape KG canvas (org-wide + per-scope),
  side-panel drill-down, `/kg` backend router, nav links from ScopesHub +
  ScopeDetailView.
