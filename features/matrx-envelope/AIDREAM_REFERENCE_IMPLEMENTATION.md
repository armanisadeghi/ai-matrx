# Aidream Reference Implementation Handoff

> **Audience:** aidream (Python backend) — implement resolvers, bookmark mappings, and `list_referenceable()` entries so Matrx reference fences pasted from the frontend resolve to live chips in agent context.
>
> **Frontend status:** Matrx-frontend builds and copies all fences documented here **today**, assuming backend support. FE preview resolvers live in `features/matrx-envelope/referenceResolvers.ts` (best-effort Supabase reads). Authoritative resolution must move to aidream per `docs/protocol/MATRX_REFERENCES.md`.
>
> **Related:** `features/matrx-envelope/BOOKMARK_EXPORT_COVERAGE.md` (surface catalog), `docs/protocol/MATRX_REFERENCES.md` (protocol).

---

## Summary — what aidream must add

| Priority | Reference `type` | Bookmark `type` (if any) | Item identity fields | Registry table / notes |
|---|---|---|---|---|
| P0 | `agent_app` | — (RecordRef) | `{ id }` | `aga_apps` — add to `list_referenceable()` |
| P0 | `table_schema` | `table_schema` | `{ table_id, table_name? }` | Resolve column defs from `udt_dataset_fields` |
| P1 | `transcript_segment` | — | `{ transcript_id, segment_index, label? }` | Parse `transcripts.content` at index |
| P1 | `session_transcript` | — | `{ session_id, transcript_id, label? }` | Join session ↔ linked transcript |
| P1 | `workbook_sheet` | — | `{ workbook_id, sheet_id, sheet_name?, workbook_name? }` | Latest `udt_workbook_snapshots` → sheet tab |
| P2 | `document_page` | — | `{ document_id, page_index, document_name? }` | Latest doc snapshot; page = 1-based |
| P2 | `file_page` | — | `{ file_id, page_number, label? }` | PDF page extract via file handler |
| — | Picklist V2 (UI TBD) | `full_list`, `list_group`, `list_item` | Existing shapes | Already mapped — wire V2 UI later |

**Already supported (no aidream work):** `task`, `note`, `project`, `agent`, `transcript`, `transcript_session`, `workbook`, `document`, `file`/`media`, UDT table family (`table`, `table_column`, `table_row`, `table_cell`), picklist family (`picklist`, `picklist_group`, `picklist_item`).

---

## Envelope wire format (all types)

Every copy button emits a fenced block:

````markdown
```matrx
{"matrx_version":1,"kind":"reference","type":"<TYPE>","items":[{...}]}
```
````

Items are **flat identity + optional display hints** only (`label`, `table_name`, …). No nested `ref` / `purpose` objects.

---

## P0 — `agent_app` (RecordRef)

### Wire

```json
{
  "type": "agent_app",
  "items": [{ "id": "<uuid>", "label": "My App" }]
}
```

### Backend tasks

1. Add `"agent_app"` to reference type registry / envelope schema generator.
2. Add `agent_app` → `RecordRef` resolver:
   - Table: `public.aga_apps`
   - Title fields: `name`
   - Body fields: `description`
   - RLS: same as existing app reads (user/org scoped).
3. Add to `list_referenceable()` (or equivalent agent-data registry):
   ```python
   ReferenceableKind(
       type="agent_app",
       table="aga_apps",
       id_column="id",
       ...
   )
   ```
4. Context expansion: resolve to app name + short description; optional deep link hint for FE.

### Frontend wired

- `features/agent-apps/components/route-header/AgentAppHeaderActions.tsx` — all `/agent-apps/[id]/*` routes via `AgentAppHeader`.

---

## P0 — `table_schema` (5th table dimension)

Schema-only reference — column names, types, display names — **no row data**. Distinct from `table` (whole table incl. rows) and `table_column` (one column).

### Wire

```json
{
  "type": "table_schema",
  "items": [{
    "table_id": "<uuid>",
    "table_name": "Customers",
    "label": "optional hint"
  }]
}
```

### Bookmark mapping

Add to `BOOKMARK_TYPE_TO_REFERENCE` in aidream `bookmarks.py`:

```python
"table_schema": "table_schema",
```

Bookmark pydantic model (mirror existing table bookmarks):

```python
class TableSchemaBookmark(BaseModel):
    type: Literal["table_schema"] = "table_schema"
    table_id: str
    table_name: str | None = None
    description: str | None = None  # non-authoritative hint
```

### Resolver behavior

Given `table_id`:

1. Load `udt_datasets.table_name` (ownership check).
2. Load ordered `udt_dataset_fields` (`field_name`, `display_name`, `data_type`, `is_required`).
3. Expand to human-readable schema text for LLM context, e.g.:
   ```
   Customers (schema)
   - name (text, required)
   - email (text)
   ...
   ```
4. **Do not** include row payloads.

### Frontend wired

- `TableReferenceOverlay.tsx` — reference type "Table Schema (columns only)".
- `TableReferenceModal.tsx` — dedicated schema copy section.
- `bookmarkToReference.ts` — `table_schema` mapping.

---

## P1 — `transcript_segment`

One segment inside a stored transcript (`transcripts` row). Segments are parsed client-side from markdown content; stable address is **0-based index in canonical parse order** (same order as `parseTranscript()` / `[m:ss] text` lines).

### Wire

```json
{
  "type": "transcript_segment",
  "items": [{
    "transcript_id": "<uuid>",
    "segment_index": "12",
    "label": "optional first-80-chars preview"
  }]
}
```

`segment_index` is a **string** on the wire (matches other numeric ids in reference items).

### Resolver behavior

1. Load `transcripts` row by `transcript_id` (RLS).
2. Parse content into ordered segments (reuse aidream transcript parser if available; else split on timecode lines).
3. Return segment at `int(segment_index)` — include timecode + speaker + text.
4. Chip open action: open transcript viewer scrolled to segment (FE uses `transcript_id`; segment scroll is follow-up).

### Frontend wired

- `AdvancedTranscriptViewer.tsx` — context menu "Copy Reference" when `transcriptId` prop set.
- `TranscriptViewer.tsx` — passes `activeTranscript.id`.

### Open question (document, don't block)

If transcript content is edited and segment count/order changes, indices shift. Long-term: persist stable segment ids in JSONB (`transcripts.segments`) — **fast follow**, not required for v1 resolver.

---

## P1 — `session_transcript`

Links a **studio session** to its **materialized transcript** (`studio_sessions.transcript_id` FK). Distinct from:

- `transcript_session` — RecordRef to the session itself (`{ id: session_id }`).
- `transcript` — RecordRef to the transcript row alone.

### Wire

```json
{
  "type": "session_transcript",
  "items": [{
    "session_id": "<uuid>",
    "transcript_id": "<uuid>",
    "label": "optional"
  }]
}
```

### Resolver behavior

1. Verify `studio_sessions.id = session_id` and `transcript_id` matches item (or matches session row).
2. Expand: session title + transcript title + optional excerpt.
3. Open: studio session (or transcript viewer if product prefers).

### Frontend wired

- `ScribeScreen.tsx` ⋮ menu — "Copy linked transcript reference" (only when `session.transcriptId` is set).

---

## P1 — `workbook_sheet`

One tab inside a Univer workbook (`udt_workbooks` + latest snapshot in `udt_workbook_snapshots`).

### Wire

```json
{
  "type": "workbook_sheet",
  "items": [{
    "workbook_id": "<uuid>",
    "sheet_id": "sheet-abc",
    "sheet_name": "Q1 Revenue",
    "workbook_name": "optional hint"
  }]
}
```

`sheet_id` is Univer's internal sheet id from `IWorkbookData.sheetOrder` / active sheet API.

### Resolver behavior

1. Load latest snapshot for `workbook_id`.
2. Find sheet by `sheet_id`; read sheet name + optional cell range summary (A1:used range header row) for context.
3. Do not dump full sheet JSON into context — summarize or offer structured extract.

### Frontend wired

- `WorkbookSheetReferenceCopyButton.tsx` in `WorkbookEditor` toolbar — copies **active sheet** at click time.

---

## P2 — `document_page`

One page of a Univer document or exported PDF-like document.

### Wire

```json
{
  "type": "document_page",
  "items": [{
    "document_id": "<uuid>",
    "page_index": "1",
    "document_name": "optional hint"
  }]
}
```

`page_index` is **1-based**.

### Resolver behavior

1. Load latest `udt_document_snapshots` for `document_id`.
2. Extract text/blocks for `page_index` (Univer docs pagination rules TBD — start with page 1 body text).
3. Open: document editor at page.

### Frontend wired

- `DocumentPageReferenceCopyButton.tsx` in `DocumentEditor` toolbar — **v1 copies page 1** until active-page tracking ships.

### Follow-up

FE should pass live `page_index` from Univer scroll/page API when available.

---

## P2 — `file_page`

One page of a PDF in `cld_files`.

### Wire

```json
{
  "type": "file_page",
  "items": [{
    "file_id": "<uuid>",
    "page_number": "3",
    "label": "optional"
  }]
}
```

`page_number` is **1-based**.

### Resolver behavior

1. Resolve file via existing file handler / `cld_files`.
2. If PDF, extract page text (reuse PDF microservice or existing extract path).
3. Open: file preview at page.

### Frontend wired

- `FileContextMenu.tsx` — `FilePageReferenceMenuSub` (pages 1–5) for `application/pdf`.

---

## Picklist V2 — options documented (UI not modified)

Prod route `/lists/v2` uses `PicklistManagerV2`. **Do not add bookmark buttons until picklist UI is finalized.** Required copy dimensions (same as legacy `features/user-lists/`):

| Dimension | Bookmark `type` | Reference `type` | Item fields |
|---|---|---|---|
| Full list | `full_list` | `picklist` | `list_id`, `list_name` |
| Group | `list_group` | `picklist_group` | `list_id`, `group_name`, `list_name?` |
| Item | `list_item` | `picklist_item` | `list_id`, `item_id`, `label`, `list_name?` |

### V2-specific UI notes (for future FE)

- V2 uses inline **group column** on each row — no group header rows like legacy `GroupSection`.
- **Group bookmark** options when UI lands:
  - (A) Bookmark icon on group filter chip when a group is selected in toolbar.
  - (B) Row action when `group_name` cell focused.
  - (C) Bulk copy all items in group as multi-item fence.
- Full-list bookmark: top bar (legacy pattern in `ListMetaHeader`).
- Per-item bookmark: row actions column (legacy `ListItem`).

Backend: **no new types** — existing picklist bookmark → reference mapping is sufficient.

---

## Aidream implementation checklist

### Schema / registry

- [ ] Extend envelope `reference` type enum with all new types above.
- [ ] Pydantic item models for each compound type (flat fields only).
- [ ] `BOOKMARK_TYPE_TO_REFERENCE`: add `table_schema`.
- [ ] `list_referenceable()`: add `agent_app` → `aga_apps`.

### Resolvers (`agent_data` / references module)

- [ ] `agent_app` RecordRef
- [ ] `table_schema` — fields query, no rows
- [ ] `transcript_segment` — parse + index
- [ ] `session_transcript` — session/transcript join validate
- [ ] `workbook_sheet` — snapshot sheet slice
- [ ] `document_page` — snapshot page slice
- [ ] `file_page` — PDF page extract

### Tests

- [ ] Round-trip: fence JSON → resolver expand → non-empty context string
- [ ] RLS: user cannot resolve another org's ids
- [ ] Unknown index / missing sheet / expired file → graceful fallback to hints

### Type sync

After aidream ships models, run matrx-frontend `pnpm sync-types` so `stream-events.ts` includes `TableSchemaBookmark` etc.

---

## Frontend file index (for aidream cross-reference)

| Type | Builder | FE resolver | UI surface |
|---|---|---|---|
| `agent_app` | `recordReference.ts` | `referenceResolvers.ts` | `AgentAppHeaderActions` |
| `table_schema` | `bookmarkToReference` / bookmark | `referenceResolvers.ts` | `TableReferenceOverlay`, `TableReferenceModal` |
| `transcript_segment` | `compoundReference.ts` | `referenceResolvers.ts` | `AdvancedTranscriptViewer` context menu |
| `session_transcript` | `compoundReference.ts` | `referenceResolvers.ts` | `ScribeScreen` ⋮ menu |
| `workbook_sheet` | `compoundReference.ts` | `referenceResolvers.ts` | `WorkbookEditor` toolbar |
| `document_page` | `compoundReference.ts` | `referenceResolvers.ts` | `DocumentEditor` toolbar |
| `file_page` | `compoundReference.ts` | `referenceResolvers.ts` | `FilePageReferenceMenuSub` (PDF, pages 1–5) |

Shared UI primitives: `ReferenceCopyButton`, `CompoundReferenceCopyButton`, `ReferenceCopyMenuItem`, `ReferencesBulkCopyButton`.

---

## Change log

| Date | Change |
|---|---|
| 2026-06-21 | Bulk copy on agents/apps/transcripts hubs; PDF file_page submenu (pages 1–5); grouped multi-type fence builder |
