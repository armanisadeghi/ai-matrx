# FEATURE.md — `knowledge` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/STATE.md`
> — read it before touching this feature in ANY repo. The domain map, the honest built/missing
> capability picture, the guided-walkthrough vision, and every ruling live there. This file is the
> file map and the traps.

`/knowledge` is the **Knowledge hub** (plan: `common-docs/projects/knowledge-system/KNOWLEDGE-HUB.md`
§5.2, phase H3). The informational showcase moved to `/knowledge/about`; `/rag` redirects to the
hub (config redirect in `next.config.js`); `/rag/library` and `/knowledge/library` (the Sources page)
keep working until H6 and link to the hub.

## Files

- `app/(core)/knowledge/page.tsx` — the hub route (guest → `KnowledgeLanding`; layout cookie
  `panels:knowledge-hub:v1`).
- `features/knowledge/api/knowledgeSearch.ts` — THE client for `POST /knowledge/search` (shared with
  the ⌘K bar). Falls back, announced, to the platform title search only when the hub's service did
  not answer: 404/405, or a stream with no `search_started` event. A 422 is a real validation error
  and shows the server's sentence in every section (guard: `api/__tests__/searchFallback.test.ts`).
- `features/knowledge/api/knowledgeSearchFixture.ts` — sample data in the wire shape; the hub's
  "Sample data" toggle (`?data=sample`) uses it, banner on, every write refuses.
- `features/knowledge/api/knowledgeQueryText.ts` — operators ⇄ chips (`type:`, `@`, `#`, dates,
  `in:`, `by:`, `from:`, `sort:`), shared with ⌘K.
- `features/knowledge/hub/hubState.ts` — the whole hub state IS the URL (`view`, `q`, filters,
  `layout`, `peek`, `data`); `selectionQuery` = what a sidebar click does.
- `features/knowledge/hub/hubActions.ts` — File under (association door), Keep (Source keep door),
  Trash (`archiveRecord`); Archive is the registered promise `knowledge.hub-archive` until H5.
- `features/knowledge/hub/hooks/` — URL state, the per-section results runner, sidebar reads
  (saved views `surface_key='knowledge/hub'`, favorites `ues_list`, containers via the registry
  candidate reader; libraries read `media.source_library` directly — no title column).
- `features/knowledge/hub/components/` — page, sidebar, search box, filter menu (`f`), results
  (sections / list / table / board / gallery), peek, File-under dialog.
- `features/knowledge/components/KnowledgeShowcasePage.tsx` — the `/knowledge/about` page.
- `features/knowledge/components/KnowledgePipelineDiagram.tsx` — `"use client"` interactive,
  theme-aware rebuild of the source SVG (tap a phase to focus it).
- `app/(core)/knowledge/extractions/` — extraction dataset catalog; see
  `features/page-extraction/FEATURE.md`.

## ⌘K command bar (hub phase H2) — `features/knowledge/command-bar/`

Plan: `common-docs/projects/knowledge-system/KNOWLEDGE-HUB.md` §5.1.

- `CommandBarHotkey.tsx` — the ONE ⌘K / Ctrl+K listener, mounted once by `DeferredIslands` (AppShell).
  Respects `preventDefault()` from pages that own ⌘K (Markdown Studio, PDF Studio).
- `KnowledgeCommandBar.tsx` — the bar, rendered by the overlay controller (`knowledgeCommandBar`;
  opener `features/overlays/openers/knowledgeCommandBar.tsx`, callbacks
  `features/overlays/callbacks/knowledgeCommandBar.ts`). Chips come from the shared parser
  `features/knowledge/api/knowledgeQueryText.ts`; search from the one client
  `features/knowledge/api/knowledgeSearch.ts` (`searchKnowledge`).
- `useKnowledgeSearchStream.ts` — debounce (120 ms, `as_you_type`), submit, abort, per-section state.
- `commands.ts` — the window launcher (Tools grid `TOOLS_GRID_TILES`) as commands.
- `attachTarget.ts` + `useKnowledgeAttachTarget.ts` — "Attach to this chat": a chat on screen
  registers itself (`useRegisterChatAttachTarget`, in `ChatRoomClient`); a resource picker passes
  its own target when its search row hands off to the bar.
- `hitHref.ts` — ↵ opens a hit at the entity registry's door (`/agents/go/<id>` for agents).

## Traps

- **The bar's search runs on the title stand-in until `POST /knowledge/search` (H1) ships.** The
  old RAG route at the same path answers 422; `searchKnowledge` treats 404/405/422 as "not here
  yet", answers with the cross-type title search, and the bar says so in a banner. Delete
  `searchKnowledgeTitles` the day the service answers.
- **Never fill a lookup while rendering rows.** The React Compiler can reuse a memoized row
  subtree; the hit map is derived from state (a render-time `Map.set` left ⌘K finding nothing).

- **The search box must never overwrite what the person is typing** when its own commit lands in
  the URL (guard: `hub/__tests__/searchBox.test.tsx`, proven red on the old sync).
- **Tests:** `pnpm jest features/knowledge/hub` — URL round trip, selection → query, layouts from
  the fixture, peek open/close from the page, bulk file-under through the door with registry labels.

- **Do not confuse this with `KnowledgeLanding`**
  (`features/auth/components/module-landing/landings/KnowledgeLanding.tsx`) — that is the
  conversion-oriented sales landing shown to guests at `/knowledge/data-stores`. This page is
  informational and is not a sales pitch.
- **The diagram has two sources that must stay in sync.** The hand-authored original is
  `common-docs/projects/knowledge-system/vision/visuals/matrx_knowledge_system_full.svg`; the page
  rebuilds it in React/HTML for responsiveness and theming. **Change the system's phases → update
  both** the SVG and `KnowledgePipelineDiagram.tsx`.
- **Keep the capability grid honest.** It links real surfaces and must never imply a capability
  that does not exist. The verified built/missing table is in the common-docs STATE above — update
  it there first, then mirror the labels here.

## Change log

- **2026-09-27** — `/knowledge` became the Knowledge hub (H3): sidebar, search with chips, typed
  sections, four layouts, peek, bulk File under / Keep / Trash, phone one-pane. Showcase moved to
  `/knowledge/about`; `/rag` redirects.
