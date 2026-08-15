# FEATURE.md — Maps (user-authored visual maps)

**Status:** `active`
**Tier:** `2` — a surface on the existing artifacts/canvas + diagram stack, not a new system
**Last updated:** `2026-08-14`

> **What this is:** `/maps` lets a user create and edit a visual map — boxes and
> arrows — from the UI, with no code and no JSON. It is the authoring half of a
> capability the platform already had rendering and emitting.

---

## The question this answers

Arman, 2026-08-09, after seeing the Growth Loop map at
`/administration/knowledge/growth-loop`: _we already let agents make diagrams in
chat — should users be able to CREATE maps like this from a UI? And should that
be a new feature, or part of the workflow package (which already has a node
graph editor)?_

**Decision: neither. Extend what exists.** A map is a **canvas item of type
`diagram`** whose content is the canonical `DiagramData`, edited by the ONE
existing diagram renderer running in authoring mode.

### What already existed (the inventory that forced this answer)

| Piece                                        | Where it already lives                                                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The data shape                               | `DiagramData` (`components/mardown-display/blocks/diagram/parseDiagramJSON.ts`)                                                                                                                                                                                  |
| The AI-emittable form of that shape          | `diagram_spec` content-IR kind (`features/content-ir/kinds/diagram-spec.ts`) — an agent already emits maps in chat                                                                                                                                               |
| The renderer                                 | `InteractiveDiagramBlock` — XYFlow 12, resizable boxes and visual sections, six shapes, chosen colors/icons/borders, dagre/radial/org/pedigree layouts, configurable arrows, snapping/background/minimap controls, PNG + JSON export, print/PDF, canvas hand-off |
| Persistence, versioning, favourites, sharing | `canvas.canvas_items` + `canvasItemsService` (+ `canvas_save_user_version`, `canvas_publish`, `canvas_get_version_history` RPCs)                                                                                                                                 |
| The list shell                               | `lib/entity-list` (`/agents/all`, `/transcripts`)                                                                                                                                                                                                                |

Four of the five pieces of "let users make maps" were already built. The only
missing piece was **authoring**: nothing let a person rename a box, add one,
draw an arrow, or save the result.

### Alternatives considered, and why not

**A new top-level feature (`features/maps/`).** Rejected. CLAUDE.md sets a high
bar for inventing a top-level feature, and this clears none of it: it introduces
no new entity, no new table, no new data shape, no new renderer. Everything it
needs is owned by `features/canvas` already. A `features/maps/` with its own
store and its own canvas would have been a second implementation of the diagram
system — a defect even if it worked.

**Extend the workflow package (`aidream/apps/workflow-studio`, XYFlow +
`matrx-graph`).** Rejected, and it is the most tempting wrong answer because it
already draws node graphs. Three reasons it fails:

1. **A workflow is executable; a map is not.** The workflow DAG model carries
   node types, typed ports, `input_kind`/`output_kind`, and run semantics. A map
   of "how a new patient gets seen" has none of that, and forcing one to satisfy
   an execution contract makes the user answer questions about a program they
   are not writing.
2. **Wrong repo, wrong app.** workflow-studio is a separate Vite app in
   `aidream`. Putting a user-facing library surface there means a second auth
   session, a second shell, and a cross-repo deploy for every change.
3. **Wrong user.** The workflow builder is a builder surface with builder
   concepts. Our user is a subject-matter expert who does not code
   (`common-docs/systems/ai-dream-platform/USER.md`). "Nodes and edges" is
   exactly the vocabulary they must never meet.

**A new content-IR kind.** Rejected as a _no-op_: `diagram_spec` already is that
kind. Adding `map_spec` would fork the shape agents emit and the shape we render
for no gain.

**Extend artifacts/canvas — chosen.** Canvas is literally "the database for
interactive renderable blocks", it already stores type `diagram`, and it already
carries version history, favourites, archive and share tokens.

### The consequence that matters

The loop is now closed in both directions:

```
ask an agent in chat  →  diagram_spec  →  InteractiveDiagramBlock  →  Save to canvas
                                                    ↑                        ↓
                                          edit it visually  ←──────────  /maps
```

AI drafts, the person refines. Neither half needed a new system.

---

## Entry points

**Routes**

- `app/(core)/maps/page.tsx` → `MapsListPage` — the library (list first; a
  feature entry page is never a forced editor).
- `app/(core)/maps/[id]/page.tsx` → `MapEditor` — one map, open, autosaving.

**Feature code — `features/canvas/maps/`**

- `types.ts` — `MapListRow`, `starterMap`, `draftMapFromLines`,
  `diagramFromCanvasContent`. The decoder accepts both current object data and
  historical model-direct string data; both become the same `DiagramData`.
- `service.ts` — the entity-list read triple (direct `canvas.canvas_items`
  select) + `createMap` / `getMap` / `saveMap` / `deleteMap` / `duplicateMap` /
  `saveMapRowEdit`, all of which delegate writes to `canvasItemsService`.
- `columns.tsx`, `listConfig.tsx`, `useMapRowActions.tsx` — the entity-list
  config triple.
- `MapsListPage.tsx`, `NewMapDialog.tsx`, `MapEditor.tsx`, `MapCanvas.tsx`.
- `features/surfaces/manifests/maps.manifest.ts` — the live read/write Surface
  contract (`matrx-user/maps`): full map JSON in, confirmed full-map replacement
  out.

**Extended, not copied**

- `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx` gained
  opt-in authoring (`onDiagramChange`) plus a `presentation` choice. The default
  `card` presentation preserves chat and artifact embeds. The dedicated
  `workspace` presentation uses the whole host surface, removes the repeated
  title card and turns the authoring controls into a persistent inspector rail.

---

## Invariants

1. **A map is a canvas item.** `canvas.canvas_items`, `type = "diagram"`,
   `content = { type: "diagram", data: DiagramData }`. There is no maps table
   and no maps RPC family; adding one would be a second store for one shape.
2. **All writes go through `canvasItemsService`.** `service.ts` adds verbs, not
   a write path. It never issues its own insert/update against `canvas_items`.
3. **One React Flow canvas.** Authoring is a MODE on `InteractiveDiagramBlock`.
   A second editor component is forbidden — it would immediately drift from the
   node kinds, layouts, export, and print the renderer owns.
4. **One dynamic front door.** `MapCanvas.tsx` is the only `next/dynamic({ssr:false})`
   on this surface; React Flow stays statically imported inside the block
   (code-splitting skill, rule 3). No new entry is needed in
   `reactFlowStaticImportBan` — this surface adds no new static React Flow
   importer, which is itself the sign the decision was right.
5. **The name lives in two data fields on purpose** — `canvas_items.title` (what
   the library lists) and `DiagramData.title` (portable diagram identity). Every
   rename path writes both; `saveMapRowEdit` exists for exactly this reason. The
   dedicated editor renders that identity once, in the shell header — never a
   second time in a body card.
6. **Zero jargon.** "Box", "arrow", "map". Never node, edge, graph, vertex,
   DAG, or schema — in labels, placeholders, empty states or toasts.
7. **Authored positions are the document.** In authoring mode the block does not
   re-run auto-layout when the diagram changes, and skips the initial auto-layout
   entirely when every box already has a position. Otherwise reopening a map
   would silently discard the arrangement the user made.
8. **Sections are visual, never executable.** A section is a React Flow v12
   sub-flow parent (`isGroup`, `parentId`, relative child positions), persisted
   in the same `DiagramData`. Removing one keeps its boxes and their visible
   positions.
9. **Agent edits use the Surface write seam.** The mounted
   `SurfaceRuntimeProvider` exposes the complete current map through `map_json`;
   agents may only propose `replace_map`, which is user-confirmed, strictly
   parsed, relationship-validated, and saved through `saveMap`.
10. **The editor is a workspace, not a card.** Its route wrapper is
    `h-full overflow-hidden`, offsets its body with `var(--shell-header-h)` so content
    starts below the glass shell header, and gives XYFlow every remaining pixel.
    The renderer's embeddable card stays capped; only `presentation="workspace"`
    removes the width/height cap and repeated metadata.
11. **Automatic appearance becomes explicit document data.** Every accepted or
    newly drafted diagram passes through `materializeDiagramDefaults` before it
    renders or persists. It fills missing box color, icon, shape, border,
    alignment and size; arrow color, width, path, line, direction and motion;
    layout; and workspace background/minimap/snap/control hints. Explicit values
    always win. Thus old and terse agent output keeps the same automatic look,
    while a person's overrides survive save, reload, chat, and future agents.
12. **Historical model-direct diagrams remain first-class.** A canvas item whose
    `content.data` is a valid JSON string is parsed, defaulted, and listed using
    its embedded title and real object counts. It is never hidden or deleted.
    Its next ordinary save canonicalizes it to object data through the same save
    path as every new map.

---

## Key flows

**Make a map from nothing.** `/maps` → New map → name it → optionally type the
steps one per line → `draftMapFromLines` turns the lines into boxes joined in
order → the editor opens with a real draft to drag around. Typing `A -> B` is
understood but never required.

**Make a map with AI.** Ask an agent in chat for the diagram (it emits
`diagram_spec`), open it in canvas, save it — it appears in `/maps`, where it
can be edited box by box. This path predates this feature; what is new is that
the result is now editable and re-savable rather than frozen.

**Edit.** Open a map — the dedicated full-screen workspace starts ready to edit.
The canvas fills the route below the glass header; its right inspector reports
box/section/arrow counts and changes with the current selection. Click a box to
rename it or add notes, drag it to move it, drag from a box's dot onto another
box to draw an arrow, click an arrow to label or remove it, or add boxes and
sections from the inspector. Autosave runs 1.2s after the last change; the shell
header states `Unsaved changes` / `Saving…` / `All changes saved` / `Not saved`
and never claims a failed save succeeded.

**Organize without turning it into a workflow.** Add a resizable visual section,
choose solid/dashed/dotted framing, and place boxes inside it. Arrows may be
curved, rounded, stepped, or straight; solid, dashed, or dotted; animated or
still; and point forward, backward, both ways, or nowhere. Boxes may use any of
six shapes, a chosen semantic or custom color, an explicit icon, border style,
alignment, and size. The map may use dots, lines, or crosses; snapping and the
minimap are optional. These are presentation choices only.

**Work with an agent.** The open editor is the declared `matrx-user/maps`
surface. Its agent context includes `map_json`, convenient box/arrow lists,
counts, and the user's current selection. A bound agent reads the complete
document and proposes a complete replacement through `replace_map`; the user
sees the standard in-place confirmation before the canonical save path runs.

---

## Known gaps

- **Scopes:** only `mine`. `canvas_items` is a per-user table with no org/shared
  RPC surface, so shared/org tabs would render counts we cannot compute
  truthfully. Adding them means the `canvas_list_scoped` RPC family first.
- **No cards view** yet — the table is the only view. `views.cards` on the
  config is where it goes.
- **No facets.** A personal map library has no finite dimension worth faceting;
  a section fed by an empty facet is a control that does nothing.
- **Version history is not surfaced.** `canvas_get_version_history` /
  `canvas_save_user_version` exist and this data is stored where they can see
  it, but the editor does not yet offer them.
- **Sharing is not surfaced.** `canvasItemsService.share()` already mints
  `/canvas/shared/<token>`; `/maps` shows the Shared badge but offers no
  share action yet.

---

## Change Log

- **2026-08-14** — Made automatic diagram styling an explicit, overrideable part
  of the canonical document before render/persistence: colors, icons, shapes,
  borders, alignment, dimensions, arrow markers/weight/style/motion, layout,
  background, minimap, snapping and controls. Added the matching workspace
  inspector controls while retaining identical automatic behavior for terse
  agent diagrams and the default chat card. Added compatibility decoding for
  historical model-direct canvas rows whose `content.data` is JSON text, so
  their embedded names and counts list correctly and all valid rows open.
- **2026-08-14** — Promoted the dedicated editor from an embedded diagram card
  to a true route workspace after live comparison with Growth Loop: full
  available height and width below the glass shell header, a persistent right
  inspector, visible object counts, centered JSON/print actions, accessible
  layout/background/minimap/image controls, and no duplicated map title. The
  compact `card` presentation remains the default for every existing consumer.
- **2026-08-14** — Finished the previously unwired product surface: placed
  Visual Maps under Docs navigation; migrated the canonical renderer from
  legacy React Flow 11 to `@xyflow/react` 12.11.3; added resizable visual
  sections/sub-flows, box styles, richer arrow paths/lines/motion/arrowheads;
  declared and live-synced `matrx-user/maps` with complete JSON read context
  and a confirmed, validated `replace_map` agent write target.
- **2026-08-10** — Created. Decision recorded (extend canvas + the one diagram
  renderer; not a new feature, not the workflow package). Added `/maps` list +
  editor, `draftMapFromLines` plain-language drafting, and authoring mode on
  `InteractiveDiagramBlock` (`onDiagramChange`).
