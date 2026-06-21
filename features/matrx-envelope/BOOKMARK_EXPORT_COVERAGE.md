# Bookmark Export Coverage — what gets a "copy reference," and at what granularity

**Status:** in progress — FE surfaces built; aidream backend pending — see **[AIDREAM_REFERENCE_IMPLEMENTATION.md](./AIDREAM_REFERENCE_IMPLEMENTATION.md)** (single handoff doc) and [Implementation progress](#implementation-progress) below.

## What an "export bookmark" is

A small UI affordance ("copy reference" / bookmark button) on an entity that copies the **canonical `matrx` reference fence** for it. Pasted into chat it resolves to a **live reference chip** the agent reads — the backend re-fetches the live value each turn from the ids, never the value. The artifact is always built with `buildBookmarkReferenceFence(...)` (`features/matrx-envelope/bookmarkToReference.ts`) for UDT bookmarks (tables/lists) or `buildRecordReferenceFence(...)` / `buildFileReferenceFence(...)` for RecordRef / FileRef entities. Never hand-roll JSON. See `docs/protocol/MATRX_REFERENCES.md` and `features/matrx-envelope/REFERENCE_OUTPUT_MIGRATION.md`.

The goal of this doc: decide **which entities qualify** for an export bookmark, and **how many "dimensions"** (granularities) each one needs.

---

## The core idea: dimensions

Some entities are **atomic** — there's one thing to point at (a note, a task). One bookmark = one dimension.

Some entities are **compound** — they contain addressable sub-parts, and the user may want the agent focused on the whole *or* on a specific part. Each level the user could reasonably mean is a **dimension**, and **a compound entity needs a bookmark for every dimension or it's broken** — if you can't point at the row you mean, the feature half-works and confuses everyone.

The table is the worked example: it has **4 data dimensions** today and is **missing a 5th** (see below).

---

## Simple rules

1. **Qualifies?** An item gets an export bookmark only if it is a **persistent Matrx entity with a stable id the backend can re-resolve live.** Ephemeral / external things (a pasted URL, a YouTube link, an uploaded raw file with no record) do not — those are *attachments*, not references.
2. **How many dimensions?** Provide one bookmark per level a user would meaningfully ask the agent to focus on:
   - Atomic entity → 1 (the whole thing).
   - Container → the whole **plus every addressable sub-part** (row/column/cell, group/item, sheet/section, segment…).
3. **Completeness rule.** For a compound entity, ship **all** its dimensions together or none — a partial set (e.g. table without `table_cell`) is a defect, not a milestone.
4. **Add the "definition/schema" dimension** for any entity whose *structure* is itself useful context independent of its data (tables; arguably workbooks). The agent often needs the shape to act, not the rows.
5. **When in doubt, look at the facts and decide.** Most entities below have at least one judgment call (does a note need section-level? does a transcript need segment-level?). Default to the **whole-entity** bookmark first; add sub-dimensions only where there's a concrete "I want the agent on *just this part*" use case. Record the decision in this doc.
6. **New dimension = cross-repo work.** Any new reference type needs aidream: Pydantic item model + resolver, `BOOKMARK_TYPE_TO_REFERENCE` when applicable, and type sync. Frontend adds: `envelope.ts`, `referenceResolvers.ts` (preview), `registry.tsx`, producer UI, and an entry in **AIDREAM_REFERENCE_IMPLEMENTATION.md**. FE ships fences **assuming BE exists**; authoritative resolution is aidream.

---

## The table — 4 dimensions today, needs a 5th

Reference/bookmark types that exist now (`features/matrx-envelope/envelope.ts` + generated wire bookmarks):

| Dimension | bookmark `type` | reference `type` | required ids |
|---|---|---|---|
| Whole table (data) | `full_table` | `table` | `table_id` |
| One column | `table_column` | `table_column` | `table_id`, `column_name` |
| One row | `table_row` | `table_row` | `table_id`, `row_id` |
| One cell | `table_cell` | `table_cell` | `table_id`, `row_id`, `column_name` |

**Missing 5th dimension — the table definition / schema.** `full_table` resolves to *data* (rows). There is no way to reference the table's **structure**: column names, data types, required flags, order, descriptions — with no row data. The agent frequently needs the shape (to write rows, validate input, transform, or explain the table) without dragging the data.

**Proposed:** `table_schema` bookmark + reference type — **FE wired**; aidream resolver pending (see handoff doc).

So the table becomes **5 dimensions**: schema + full + column + row + cell.

---

## The list / picklist — 3 dimensions (complete today)

| Dimension | bookmark `type` | reference `type` | required ids |
|---|---|---|---|
| Whole list | `full_list` | `picklist` | `list_id` |
| One group | `list_group` | `picklist_group` | `list_id`, group key |
| One item | `list_item` | `picklist_item` | `list_id`, `item_id` |

Export via `BookmarkCopyButton` → `buildBookmarkReferenceFence`. Wired in **`features/user-lists/**`** (legacy). **Prod `/lists/v2` (`PicklistManagerV2`) — UI not modified yet**; full/group/item options documented in [AIDREAM_REFERENCE_IMPLEMENTATION.md](./AIDREAM_REFERENCE_IMPLEMENTATION.md#picklist-v2--options-documented-ui-not-modified).

---

## Coverage catalog — every candidate entity

Source of truth for the entity set is the `Resource` union (`features/prompts/types/resources.ts`). "Today" = does an export-bookmark (copy-fence) affordance exist now.

| Entity | Class | Proposed dimensions | Today | Notes / judgment |
|---|---|---|---|---|
| **Table** (user data table) | compound | schema, full, column, row, cell (**5**) | FE 5/5 ✅ (BE schema pending) | `TableReferenceOverlay` + `TableReferenceModal`. |
| **List / picklist** | compound | full, group, item (**3**) | legacy ✅; V2 UI pending | Options in [aidream handoff](./AIDREAM_REFERENCE_IMPLEMENTATION.md#picklist-v2--options-documented-ui-not-modified). |
| **Task** | atomic | whole task (**1**) | ✅ | `ReferenceCopyButton` on all primary task surfaces. |
| **Project** | atomic | whole project (**1**) | ✅ | Workspace hero + bulk copy on `/projects` hub. |
| **Note** | atomic | whole note (**1**); section later | ✅ | Desktop header + mobile editor. Section-level = fast follow. |
| **Agent** | atomic | whole agent (**1**) | ✅ | Header button + options menu item. |
| **Agent app** | atomic | whole app (**1**) | FE ✅ (BE pending) | `AgentAppHeaderActions`. |
| **Transcript** | compound | whole (**1**); segment (**+1**) | FE both ✅ (segment BE pending) | Segment: `AdvancedTranscriptViewer` context menu. |
| **Transcript session** | container | whole session (**1**); linked transcript (**+1**) | FE both ✅ (BE pending) | Scribe ⋮ — `session_transcript`. |
| **Workbook** | compound | whole (**1**); sheet (**+1**) | FE both ✅ (sheet BE pending) | Active sheet in `WorkbookEditor`. |
| **Document** | compound | whole (**1**); page (**+1**) | whole ✅; page FE v1 | Page 1 until Univer page tracking. |
| **File** | atomic / page | whole file (**1**); page (PDFs) | whole ✅; page FE (PDF menu) | Pages 1–5 submenu on PDF files. |
| **Webpage** | external | — | n/a | Attachment, not bookmark. |
| **YouTube** | external | — | n/a | Same — attachment. |
| **Image URL / File URL / Audio (url)** | external | — | n/a | External media; attach, don't bookmark. |
| **Scope / context layer** | compound | org; type; scope; item; value (**5**) | **FE done / BE pending** | `ScopesRouteHeader` + org bulk; see aidream handoff. |

---

## Judgment framework for the ambiguous ones

For each entity with a "?" or sub-dimension above, answer three questions and record the decision here:

1. **Is there a concrete "focus the agent on just this part" use case?** No → whole-entity only.
2. **Can the backend resolve that sub-part from stable ids?** No → not yet (needs ids first).
3. **Does the sub-part overlap an entity we already model?** (file page ↔ document page; workbook cell ↔ table cell) → reuse the existing dimension shape, don't invent a parallel one.

---

## Work breakdown for the implementing agent

1. **Tables:** add the `table_schema` dimension end-to-end (BE model + resolver, FE resolver, chip icon, "Copy schema reference" in the table reference UI).
2. **Atomic entities** (task, project, note, agent, agent_app): add a whole-entity reference type + resolver + a "copy reference" affordance on each entity's primary surface. One new reference type each.
3. **Compound entities** (transcript±segment, transcript_session, workbook±sheet, document±section): decide dimensions per the judgment framework, then implement whole-entity first.
4. **Externals** (webpage/youtube/image/file urls): explicitly **no bookmark** — leave as attachments.
5. Every new reference type updates: `envelope.ts` (`REFERENCE_TYPES`), `referenceResolvers.ts`, `registry.tsx` (icon), the backend (Pydantic model + resolver), and this doc's "Today" column.

**Do not** create a parallel copy primitive — UDT bookmarks use `buildBookmarkReferenceFence`; RecordRef entities use `buildRecordReferenceFence`; compound/sub-dimensions use `compoundReference.ts` + `CompoundReferenceCopyButton`. Sub-dimension BE work: **[AIDREAM_REFERENCE_IMPLEMENTATION.md](./AIDREAM_REFERENCE_IMPLEMENTATION.md)**.

**Mobile / crowded headers:** prefer `ReferenceCopyMenuItem` inside existing ⋮ menus (`FileContextMenu`, Scribe `ActionSheet`, agent options) rather than adding another icon to an already-full toolbar.

**Bulk filtered results:** `ReferencesBulkCopyButton` + `buildMultiRecordReferenceFence` — one multi-item fence per homogeneous result set (e.g. filtered projects on `/projects`).

---

## Implementation progress

Track every change here. Status: `done` | `in progress` | `blocked` | `pending`.

| # | Work item | Status | Files touched | Notes |
|---|---|---|---|---|
| 0 | List/picklist (legacy user-lists) | done | `features/user-lists/components/BookmarkCopyButton.tsx`, `ListMetaHeader`, `GroupSection`, `ListItem` | 3 dimensions in legacy UI. |
| 0 | Table dimensions (5/5) | FE done / BE pending | `TableReference*.tsx`, `bookmarkToReference.ts` | |
| 1 | Shared RecordRef + file primitives | done | `recordReference.ts`, `fileReference.ts`, `ReferenceCopyButton.tsx`, `ReferenceCopyMenuItem.tsx`, `ReferencesBulkCopyButton.tsx` | Multi-record + file_id fences. |
| 2 | FE resolver + chip infra | done | `envelope.ts`, `referenceResolvers.ts`, `registry.tsx`, `compoundReference.ts` | Compound + `agent_app`. |
| 3 | Task | done | `TaskEditor`, `/tasks/[id]`, `TaskItem`, mobile + legacy panels | |
| 4 | Note | done | `NotesView`, `MobileNotesView`, `NoteReferenceCopyButton` | |
| 5 | Project | done | `ProjectWorkspace`, `ProjectsHub` (bulk) | |
| 6 | Agent | done | `AgentHeader`, `AgentOptionsMenu`, `AgentReferenceCopyButton` | |
| 7 | Agent app | FE done / BE pending | `AgentAppHeaderActions.tsx` | |
| 8 | Table `table_schema` (5th) | FE done / BE pending | `TableReferenceOverlay`, `TableReferenceModal` | |
| 9 | Transcript whole | done | `TranscriptViewer.tsx` | |
| 10 | Transcript segment | FE done / BE pending | `AdvancedTranscriptViewer.tsx` | |
| 11 | Transcript session whole | done | `ScribeScreen.tsx` ⋮ menu | |
| 12 | Session ↔ linked transcript | FE done / BE pending | `ScribeScreen.tsx` | `session_transcript`. |
| 13 | Workbook whole | done | `app/(core)/workbooks/[id]/page.tsx` | |
| 14 | Workbook sheet | FE done / BE pending | `WorkbookSheetReferenceCopyButton.tsx` | |
| 15 | Document whole | done | `app/(core)/documents/[id]/page.tsx` | |
| 16 | Document page | FE v1 / BE pending | `DocumentPageReferenceCopyButton.tsx` | Page 1 default. |
| 17 | File whole | done | `FileContextMenu.tsx` | |
| 18 | File PDF page | FE done / BE pending | `FilePageReferenceMenuSub.tsx` | PDF submenu pages 1–5. |
| 19 | List V2 port | pending (UI) | — | Options in handoff doc; V2 unchanged. |
| 20 | Bulk: projects hub | done | `ProjectsHub.tsx` | Pattern for other hubs. |
| 21 | Bulk: transcripts/agents/apps hub | done | `TranscriptsListPage`, `AgentsGrid`, `AgentAppsGrid` | Transcripts uses mixed-type groups. |
| 22 | Scope/context layer | FE done / BE pending | `ScopesRouteHeader`, `scopeRouteReference.ts`, orgs bulk | 5 dimensions in aidream handoff. |
| 23 | Externals | n/a | — | Attachments only. |

### Resolved / aidream handoff

1. **Agent app:** wire type `agent_app` → table `aga_apps` — see handoff doc.
2. **Sub-dimensions:** FE built for schema, segment, session_transcript, workbook_sheet, document_page; `file_page` spec only.
3. **Picklist V2:** do not modify UI until finalized; full/group/item options documented in handoff doc.
4. **Scope/context:** wire types `organization`, `scope_type`, `scope`, `context_item`, `context_value` — aidream handoff § Scope & context layer.
