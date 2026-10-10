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
- `features/knowledge/hub/hubActions.ts` — File under (association door), Trash (`archiveRecord`).
- `features/knowledge/hub/triage/` — personal triage (H5, Readwise Reader): sidebar Inbox / Kept /
  Archived read `platform.triage_items` with live counts (exact to 200, then "200+"); Keep / Archive /
  Back to Inbox write `platform.set_triage_state` (a Source's Keep also calls its keep door, which
  starts processing). Keys: `s` keep · `e` archive · `i` back to Inbox · `m` file under · `t` tag ·
  `?` the shortcut sheet — `k`/`f` stay Linear's move-up / filter. The toast's Undo puts each item back.
- `features/knowledge/hub/tags/` — tags are filing (§4): `t` / Tag calls `platform.file_under_tag`
  (a `platform.tag` row by slug in the item's org; a tag is a platform table, never a scope — Arman 2026-10-02). `#tag` resolves client-side in `withMentionResolution`
  (hub and ⌘K): tags by slug first, else a scope of that exact name, else every section says
  no tag has the name. Container refs go out as `{type, id}` (the service's `EntityRef` forbids
  `name`). Sidebar Tags group counts live associations per tag; rows and the peek show `#tag` chips
  (click = filter); the filter menu has a Tags facet.
- `features/knowledge/hub/hooks/` — URL state, the per-section results runner, sidebar reads
  (saved views `surface_key='knowledge/hub'`, favorites `ues_list`, containers via the registry
  candidate reader; libraries read `media.source_library` directly — no title column).
- `features/knowledge/hub/components/` — page, sidebar, search box, filter menu (`f`), results
  (sections / list / table / board / gallery), peek, File-under dialog.
  The table keeps the canonical footer over all loaded rows. Browse mode uses
  counted item sections for its source total; text search leaves the total
  unknown because passage matches can add deduplicated source rows. Section
  cursors stay with the hub's Load more control.
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

## Ask (hub phase H4) — `features/knowledge/ask/`

- `AskPanel.tsx` — docked-right Ask over the current filter (NotebookLM is the champion). Props:
  `query` (the filter; `text` pre-fills the question), `sources` (the filter's `sources` section —
  omitted → the panel reads it through `searchKnowledge`), `onOpenCitation` (the hub's peek; omitted →
  the citation link opens `/knowledge/sources/<id>?chunk=<segment>` in a new tab), `onClose`.
  **The hub docks it** as a right panel whenever the URL carries `mode=ask` (⌘↵ in the bar lands
  there; its results keep listing the same filter in `find` mode). `/knowledge/ask?<hub params>`
  redirects to `/knowledge?<same>&mode=ask`.
- `askKnowledge.ts` — the one client + wire adapter for `POST /knowledge/search` `mode: "ask"`:
  `ask_started → answer_delta… (answer_reset) → citations → sources_used → ask_done`, or `ask_refused`
  (org monthly cap / no organization). Not a body-carried read: Ask spends against the selected
  organization, so `postNdjson` refuses before sending when none is selected.
- Contexts are labelled `[S1]…` by the server; `[1]` and `[S1]` both cite context 1.
- Tests: `ask/__tests__/askPanel.test.tsx` (citation links + click target, uncited sentence badge,
  per-Source on/off reaching `sources_used`, no-Sources and cap states, wire adapter).

## Traps

- `KnowledgeHubPage` renders the same secondary controls in the desktop toolbar or
  the mobile **View options** sheet. Do not add permanent phone toolbar rows for
  organization, transcript facets, saved-view actions, or layout; they squeeze the
  virtualized results. Page keyboard shortcuts pause while this sheet is open.


- **The bar's search runs on the title stand-in until `POST /knowledge/search` (H1) ships.** The
  old RAG route at the same path answers 422; `searchKnowledge` treats 404/405/422 as "not here
  yet", answers with the cross-type title search, and the bar says so in a banner. Delete
  `searchKnowledgeTitles` the day the service answers.
- **Never fill a lookup while rendering rows.** The React Compiler can reuse a memoized row
  subtree; the hit map is derived from state (a render-time `Map.set` left ⌘K finding nothing).

- **The search box must never overwrite what the person is typing** when its own commit lands in
  the URL (guard: `hub/__tests__/searchBox.test.tsx`, proven red on the old sync).
- **The hub's organization filter (`?org_filter=`, `EntityOrgFilter`) is the ONLY organization that narrows a read**
  (policy `active-org-is-never-a-list-filter`); the header's active org only feeds writes (`ensureOrgId`). In the
  Transcripts view `p_org_id` rides on EVERY lane of `trx_list_scoped` / `trx_list_facets` and the Scope counts. The
  per-organization numbers in the menu (`hooks/useHubOrgCounts.ts`) are the list's own count per organization,
  fetched on the menu's first open: Transcripts = one `trx_list_scope_counts` read (Organizations lane; never one
  `trx_list_scoped` per org — measured HTTP 500s), every other view = the search with `limit: 0` per organization.
  Guard: `hub/__tests__/hubActiveOrgIsInert.test.tsx` (mounted; header switch changes nothing) + `transcriptOrgFilter.test.tsx`.
- **Unsorted recordings are designed-absent from Trash** (`isTrashable`): a capture segment is a component with no
  `user_artifact_kind`, so Trash could neither list nor restore it; they leave through Scribe's Unsorted pool.
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

- `2026-10-09` — Scopes cutover (lane SCOPES-WEB-CONSUMERS): favorites and association results use `isAssociationsRpcErr` from `@ai-matrx/associations` (was `isScopesRpcErr`).

- **2026-09-30** — V5-B: the Sources page (`/knowledge/library`) archives and restores through the one archive — each row's menu (Open · Archive / Restore), bulk Archive / Restore, and THE ARCHIVED-ITEMS LAW filter (`?archived=`, every read and count honours it; `applySourcesArchiveAxis`). The Source page has Archive with Undo. "Attached to" also reads decks made from a Source's file or transcript, and a web page a person adds now is listed now, not at its cached fetch time (DB: `docproc.source_list_facts`, `docproc._source_captured_at_of`). Test: `features/sources/__tests__/sourcesArchiveAxis.test.ts`.

- **2026-09-30** — Showcase headline uses separate source-flow and system lines, balanced paragraph wrapping, and a compact phone subtitle. Verified on localhost at desktop and phone widths with an independent visual review.

- **2026-09-30** — Hub org filter finished: Transcripts sends `p_org_id` on every lane, per-organization counts in the menu, empty state names the organization with Clear filters (also in Everything), unsorted recordings not trashable by design, trash/restore refreshes Inbox/Kept/Archived, mounted active-org-inert test.

- **2026-09-29** — Knowledge table layout retains the canonical footer and source-coverage notice; browse totals exclude passage counts, while text search never invents a distinct-item total. The existing Load more advances section cursors.

- **2026-09-27** — H6b lists: container groups (`view=group:<token>`, filters as `g.*`; `containerGroups/`) —
  Data stores (member counts, New data store), Libraries (paste box, four lanes with counts, adapter filter,
  Rulebook handoff, Blocked, Bring up to date), Library catalog (type chips, show-everything, Curate, and the
  `catalog_filters` agent target). A container view links its own record page (registry `hrefFor`; `data_store`
  gained one). `/knowledge/data-stores`, `/knowledge/library-catalog` and `/libraries` redirect to their group
  keeping filters when no record is named (`legacyRoutes.ts`); record pages stay. Transcripts and Research
  sources lists are NOT retired (HUB-PARITY-CHECKLISTS).

- **2026-09-27** — H6a: the hub absorbed the Sources page — Trash view (restore / delete forever), Stage facet
  (`hubStage.ts`, `stage=` in the URL, narrows loaded items), Name/Kind/Captured by/Stage/When columns that sort,
  bulk Attach… and Process now, the processing-jobs sheet, the Add menu (`features/sources/components/SourceCapture.tsx`),
  getting-started tips as the Everything empty state, a Library catalog link, search reach in an Advanced menu, and the
  `matrx-user/knowledge-library` agent surface (`hubAgentSurface.ts`). Retired routes land here via `legacyRoutes.ts`.

- **2026-09-27** — `/knowledge` became the Knowledge hub (H3): sidebar, search with chips, typed
  sections, four layouts, peek, bulk File under / Keep / Trash, phone one-pane. Showcase moved to
  `/knowledge/about`; `/rag` redirects.
