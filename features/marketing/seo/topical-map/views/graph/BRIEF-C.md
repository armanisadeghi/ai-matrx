# BRIEF-C — follow-up builder brief for the Graph view (Lane C)

LANE: standard, model `claude-opus-5`, medium effort. The coordinator dispatches this in-process.
You are the BUILDER; the Lane C owner (Fable) reviewed the first landing (`ea8b7994e4`,
"Topical map Lane C: the graph view — zoom bands, facet axis, convergence") and found the
defects below. Fix each BY CLASS, in the files this lane owns and nowhere else:
`features/marketing/seo/topical-map/views/GraphView.tsx`, `views/GraphViewImpl.tsx`,
`views/graph/**`. Read `CONTRACTS.md` §0/§3/§9, `FEATURE.md`, `/CLAUDE.md`, and the whole of
`views/GraphViewImpl.tsx` + `views/graph/*.ts(x)` before touching anything.

Rules that bind you: no `any`; Lucide only; semantic tokens only, light AND dark; every taste
from `useTopicalMapKnobs()`; RPC sentences verbatim; absent ≠ zero; React Compiler on (no
`useMemo`/`useCallback`/`memo`); no new lazy edge (GraphView is the only one); no barrels; commit
by path with a "Topical map Lane C:" subject and push `claude/tender-gates-5qcxnd`; never
`git add -A`, never tree-wide stash/reset/checkout. No dev server. Supabase MCP reads are allowed
if you need a live shape (`map_graph` on All Green `e9df6779-8e0e-45e9-a664-375e7d1ecffd`),
never a write.

## The defects (each a class, each with the test that proves it failing-then-passing)

### C-1 — Convergence fills are SOLID (Tailwind 4 removed `bg-opacity-*`)
`views/graph/nodes.tsx` `fillClasses()` composes `intentColorClasses(name).dot` ("bg-success
border-success") with `bg-opacity-10 dark:bg-opacity-20`. Tailwind 4 has no `bg-opacity-*`
utilities (opacity is the `/` modifier), so every convergence-coloured card paints a SOLID
success/warning/info/destructive block with `text-foreground` on it — unreadable in both
themes. The class: this lane must never derive a FILL from the dot classes. Fix: a local table in
`nodes.tsx` keyed on `MapIntentColorName` (guarded by `isMapIntentColorName` from
`ui/intentColorClasses.ts`) giving `{ fill: "bg-success/15 border-success", … }` for the four
filled tones, dashed-border transparent fills for `gray_dashed` / `purple_dashed`, and the
`missing` treatment (plus the existing `captureError` path, by calling `intentColorClasses` for
its side effect) for an unknown name. Test (`nodes.test.tsx`, jsdom, no xy-flow): render
`TopicCardBody` with `convergenceColor: "green"` and assert the class list contains
`bg-success/15` and does NOT contain `bg-opacity`; with `"bogus"` assert the missing treatment.
Sweep the lane for any other `bg-opacity`/`text-opacity`/`border-opacity` (grep) — zero must remain.

### C-2 — A band change keeps positions computed for the old geometry
`GraphViewImpl.tsx` `buildFlowNodes` uses `kept?.position ?? positions.get(id)`. When the band
changes (focus a branch: line → card, or back), every node still on screen keeps the position
dagre computed for the PREVIOUS band's width/height, so cards land on top of each other. The
class: a live position is worth keeping only within the geometry it was computed in. Fix: store
the band on the flow node's data (already `data.band`); when `kept.data.band !== band`, take the
recomputed position for topics whose `auto_layout` is true, and keep `kept.position` only for
topics the person placed (stored layout) or dragged this session (C-3). Test (`layout.test.ts`
or a new `reconcile.test.ts` over a pure helper you extract — `reconcilePosition({kept, band,
computed, placed})`): a kept position from band "line" is replaced when the band is "card" for
an unplaced topic and kept for a placed one.

### C-3 — A dragged node snaps back on the next reconcile after a refetch
`useSetMapTopicLayout` (coordinator-owned `hooks.ts`) invalidates `topicRows`, not the graph
query, so `query.data` keeps `auto_layout: true` and the old `position` for a topic the person
just dragged; any later recompute (C-2, a regroup, an auto-arrange) puts it back where the server
last saw it. Local fix in this lane: keep a `useRef<Set<string>>` of topic ids dragged this
session (added in `onNodeDragStop` on success) and treat them as PLACED in every reconcile. The
coordinator request (write it in your report, do not edit `hooks.ts`): `useSetMapTopicLayout`
should also invalidate `topicalMapKeys.graph(mapId, *)` on success — then this ref becomes
belt-and-braces. Test: the same pure helper as C-2 with `placed: true` for a dragged id.

### C-4 — Clicking a LEAF re-frames the drawing on one node
`onNodeClick` always dispatches `setGraphFocus`. Vision §2.2: "Clicking a BRANCH re-frames on
it". A leaf has no branch; focusing on it draws one card in an empty canvas and loses the
person's place. Fix: set the focus only when `model.childrenByParentId.get(node.id)` is
non-empty; a leaf click still selects (`selectTopic`) and opens the panel. Test
(`model.test.ts`): a helper `isBranch(model, id)` true for a parent, false for a leaf.

### C-5 — Hue is unreadable: 255 values hashed onto six chart tokens, and the legend names none
`hueBar()` hashes the value slug onto `bg-chart-1..6`; the legend line says only "Hue — which
value of the grouped facet the topic belongs to". A legend the user can READ (vision §2.2) must
let them find the value. Fix: the facet-value pill on the axis carries the SAME hue bar as the
topics that belong to it (compute `hueBar(value.slug)` in `FacetValueBody`), and the hue legend
line says "Hue — the bar on a topic matches the bar on its {facet} value in the column on the
left". Collisions among six tokens are stated honestly in the legend when the axis shows more
than six values ("six colours repeat across N values; the column, not the colour, is the
key"). Test: `hueBar` is deterministic (same slug → same class) and the pill and its topics
agree.

### C-6 — Zoom label hiding only applies to the line and shape bands
`TopicCompactBody` and `TopicCardBody` ignore `showLabel`. Vision: "xy-flow zoom also hides
labels below a threshold". Fix: below the floor the compact row keeps its box and count and
hides the title; the card keeps its frame and hides title + counts. (The floor is the one
constant, `GRAPH_LABEL_MIN_PX = 9`, unchanged.) Test: render the compact body with
`showLabel: false` and assert the title is not in the DOM.

### C-7 — `usePageIntents` from the graph rewrites the slice's page listing
Not yours to fix — the convergence walk calls `usePageIntents`, whose effect dispatches
`pageIntentsLoaded({ replace: offset === 0 })`, so a graph in convergence mode replaces whatever
the pages workspace listed (both can be mounted at once in a window host). Write it in your
report as a coordinator request: a `feed: false` option on `usePageIntents` (or a sibling
read-only hook) for callers that keep their own rollup. Do not work around it.

### C-8 — Tests must exercise the REAL band label the toolbar prints
`graphBandLabel` is untested; the toolbar prints "cards · 14 topics on screen". Add the four
labels to `bands.test.ts`.

## Gates before you report (paste every result verbatim)
`pnpm jest features/marketing/seo/topical-map/views/graph --no-coverage` ·
`pnpm eslint features/marketing/seo/topical-map/views eslint.config.mjs` ·
`pnpm type-check` (0 in the lane's files; report the repo total, baseline 148) ·
`pnpm check:parse` · `pnpm check:dead-ends` (report the lane's rows) · `grep -rn "bg-opacity\|text-opacity\|border-opacity" features/marketing/seo/topical-map/views` (must be empty).

## Report shape
One status line; commits (short SHA + subject); each gate verbatim; what is verified and what is
NOT (nothing here is browser-verified — say so); each ruling with its cost; the two coordinator
requests (C-3 hook invalidation, C-7 feed option). Never end with unpushed work.
