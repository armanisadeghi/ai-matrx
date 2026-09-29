# Resource Picker

The "+" attach family for AI surfaces: pick a thing, attach it to the run. `ResourcePickerMenu` hosts one sub-picker per resource kind; each pick funnels through **one** callback — `onResourceSelected(resource: Resource): boolean | void | Promise<…>` (`ResourcePickerMenu.tsx`) — into `useAttachResource(conversationId)` (`../../agents/components/inputs/resources/attach-resource.ts`).

**This is NOT the reference picker, and the two must not be merged — see THE CONSOLIDATION DECISION below before proposing it (it has been proposed and declined).**

## What it attaches, and how (the load-bearing contract)

`Resource` is the tagged union at `features/agents/resources/types.ts` (`{ type, data }`). `attach-resource.ts` routes each kind by its OWN semantics — this is the whole point of the family:

- **Stored file** → a durable `platform.associations` `file → conversation` edge that persists across turns and reloads (the backend reads the edge at call time). NOT the ephemeral resources slice.
- **Pre-conversation file** → a `processed_document` instance resource.
- **Media / notes / tasks / webpages / …** → the per-turn `instanceResources` slice as a typed `ResourceBlockType`.
- **Conversation refs and Google files** → bypass the resource path entirely and write **context entries** (`referenced_conversations`, `__google_files`).

A pick therefore carries a full typed payload (`Note`, `DatabaseTask`, `FileSelection`, `TableReference`, …), not a bare id — the block builders read those payloads.

## Consumers (why the blast radius is large)

Twelve code consumers, not just chat: `cx-conversation/ConversationInput`, `smart-input/{PlusAttachMenu,RunControlsMenu,RunControlsTabPanel}`, `settings-management/AgentSettingMediaPicker`, `builder/AgentResourcesManager`, `window-panels/windows/ResourcePickerWindow`, `ai-work/compose/AiWorkComposer`, `chat-assistant/CompactAssistantInput`, `resources/{SmartAgentResourcePickerButton,SmartAgentResourceChips,attach-resource}`.

## THE CONSOLIDATION DECISION (2026-09-12) — do not merge onto the reference picker

Proposed: replace this family with the canonical registry picker stack (`RecordReferencePicker` / `ReferenceTypeAdder`, `useUniversalEntitySearch`, `entityRegistry.listableTokens`) for "one search path, one type registry." **Declined after a full per-picker audit.** The two families are different domains:

- **Reference picker** mints an identity *link* — a `matrx` reference fence (a chip in text, a scope-cell value, a directive item). It returns `{ id, label }`.
- **Resource picker** attaches *payload/context* to an AI run, with kind-specific attach side effects (durable edges, media bytes, context entries) and full typed payloads.

`AttachReferenceButton` (the canonical "generic +") emits `{ type, item }` and **has zero consumers today**; it is not the composer's contract, and bridging it needs an id→full-payload adapter per type.

Of ~16 sub-pickers:
- **~11 have no canonical equivalent at all** — the URL family (webpage, youtube, image_url, file_url: URL ingress + validation/scrape/preview), Google (external provider + connection flow), Audio/Voice Pad (live capture → synthesized text), Context Values (scope drill → `referenceFence`), Tools/Skills (run-state toggles, not pickers). Their tokens are absent from the entity registry by design; `useUniversalEntitySearch` structurally cannot serve them.
- **2 carry irreplaceable structure** — Conversations (own/standard/alive scope + mention-string-as-context-entry, plus `EntityDoorControls`) and Tables (full_table/row/column/**cell** references via a multi-level drill).
- **Files are ALREADY shared** — `AttachReferenceButton`/`ReferenceTypeAdder` mount this family's `FilePickerWindow`. That is the correct reuse, already done.
- **The record-type pickers (Notes, Tasks/Projects, Workbooks, Documents)** are `reference_pickable` in `platform.entity_types`, so the canonical search *could* list them — but each has UI the flat canonical picker lacks (Notes: recent notes + folder tree with database counts + preview via `useNotePicker`; Tasks: project→task hierarchy + completed toggle; multi-select on Files) and needs full payloads, not `{id,label}`. Swapping would *lose* function unless the canonical picker were first extended toward these — bloating a deliberately-minimal link-picker with a foreign concept, which the reuse-first doctrine's counterweight forbids ("never silently shoehorn a new concept into a primitive it doesn't fit").

**The real (narrow) duplication** is the per-picker search/list *data path* (Redux slices, `get_user_tables`, `listAccessibleDocuments`, own Supabase queries). Unifying only that onto `useUniversalEntitySearch` is possible for the record types but is a **behavior change** (folder grouping and scoping differ from a title-only ilike RPC), not a free win — so it is deferred, not done, and would be its own scoped task with live UX verification, never a blind swap.

## Certified canonical: what the Files picker must always do

- **Search and Recents reach the whole library, never only what Redux happens to hold.** The tree in state is a lazy, 20-second-bounded, 100k-row-capped projection (`loadUserFileTree`), so a picker that filters `selectAllFilesArray` silently shows a partial library the moment the tree is late, errored, or large. Search must query the server (`search_files` RPC / RLS `files` read); Recents must page the server too. Filtering state is only an instant first paint. Broke 2026-07-19 (`7269f63a3e`), found 2026-09-29. Test: a file that is not loaded into state must be findable by search.

## Change Log

- 2026-09-29 — **Notes opens without downloading every note** (Arman: "it took a long time … fetch the
  last 10 most active plus some counts"). `NotesResourcePicker` opens on the N most recently changed
  notes (knob `resource_picker.notes_recent_count`, default 10) and folders with counts from
  `workbench.note_folder_counts`; a folder loads its notes when opened; search runs in the database
  (knob `resource_picker.notes_search_limit`); the body is read only for a previewed or picked note, so
  a pick still hands the host the whole `Note`. Measured on admin@admin.com: open payload 1.3 MB → ~6.6 KB.
  Guard: `__tests__/notes-picker-opens-without-reading-bodies.test.tsx` (fails on the old picker).
  Census, not changed (different data paths): Tasks (`useProjectsWithTasks` — every project and task),
  Documents and Workbooks (`listAccessibleDocuments` / `listAccessibleWorkbooks` — `select *`, unbounded),
  Tables (`custom.table_list_everywhere` — metadata only), Conversations (already bounded + server search).

- 2026-09-29 — **The Files view lists the whole library, never a capped slice** (Arman, from the
  Source input's "Your files": "it isn't showing all of my files, the search clearly fails to get
  anything other than the ones in state"). `FilesResourcePicker` always read the person's WHOLE
  library (the `cloudFiles` tree, the same `get_user_file_tree` pages the Files app reads — search
  moved off a server query onto that tree deliberately on 2026-07-19, `7269f63a3e`), but since
  `7f11ed83a1` (2026-07-16) it cut Recents to the newest 20 and a search to the 20 newest matches:
  admin@admin.com saw 20 of 414 recent files and 20 of 752 "json" matches, and a search whose
  matches were all recent showed exactly what Recents already showed. Folders were never searched
  though the box says "Search files and folders…". The rule now lives in
  `filesPickerLists.ts` (`pickerRecentFiles`, `pickerSearch` over the files library's own
  `searchFiles`/`searchFolders`): every match, counted in the section header ("Recent · 414",
  "Files · 752", "Folders · 10"), rendered in pages by "Show more files (N more)"; Recents grows only
  on that click so the Folders below stay reachable; a folder matches by its own name and opens in
  place. The picker's own tree hydration read `state.user.id` (a slice gone since the userAuth
  split), so it never fired; it reads `selectUserId`. Every host gets this (chat "+", the Source
  input, `openFilePicker` windows) — nothing host-specific. Guard:
  `__tests__/the-file-picker-lists-the-whole-library.test.ts` (4/4 red against the capped logic,
  4/4 green). Also reviewed and kept `88b536cc77`'s filter row (12px text on a 36px row instead of
  10px; "PDF Extractor (processed)" → "Already read") — right for every host, not Source-input
  specific.

- 2026-09-27 — The main menu opens with **Search your knowledge… ⌘K**: the search steps hand off
  to the ⌘K bar (`features/knowledge/command-bar/`) with "Attach here" as the primary action,
  through the host's own `onResourceSelected` (a note is fetched in full first — never a bare id).
  A host that can re-open the picker (`onReopenAt`, today `PlusAttachMenu`) also gets its
  non-search views (Upload, URL entry, Voice, Tools…) as bar commands that re-open the picker at
  that view (`initialView`). The drill-in views all stay. The conversation-reference writer moved
  to `conversation-reference-context.ts` (shared with the bar).

- 2026-09-14 — The canonical top-level attach rows now keep a 44px touch
  target through tablet widths and return to the compact 24px desktop density
  at `lg`. This fixes the shared Smart Input mobile bottom sheet for every
  resource kind and consumer, including all Agent Battle modes.
- 2026-09-12 — FEATURE.md created to record the attach contract and the consolidation decision (family stays; not merged onto the reference picker). No code change.
