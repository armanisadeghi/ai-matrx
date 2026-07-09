# Resource attachment wire spec (frontend → backend)

How the frontend includes attached resources (notes, tasks, files, and the new
Matrx-entity references) in a user message. **For backend confirmation** — the
"Pending" types below are emitted by the FE but need backend handlers.

Source of truth (FE):
- `instance-resources.selectors.ts` → `selectResourcePayloads` (builds the blocks)
- `editable-resource-types.ts` → which types support the `editable` flag
- `instance.types.ts` → `ResourceBlockType` union

---

## Shape

Each attached resource becomes one entry in the user message `content[]` array.
Every block carries `type` plus a small set of option flags and a type-specific
id/value field:

```jsonc
{
  "type": "input_notes",
  "note_ids": ["<uuid>"],          // type-specific payload (see table)
  "editable": true,                 // see Editability below
  "keep_fresh": true,               // only when enabled
  "convert_to_text": false,         // only when explicitly disabled
  "optional_context": true,         // only when enabled
  "template": "full"                // only for templated types
}
```

Option flags are **omitted unless set** (lean wire). Specifically:
- `editable` — emitted **only** when `true` (see below).
- `keep_fresh` — emitted only when `true`.
- `convert_to_text` — emitted only when **`false`** (default is true).
- `optional_context` — emitted only when `true`.
- `template` — emitted only when present (`"full" | "compact" | "minimal"`).

### Reference normalization (`toResourceIdList`)

All `*_ids` fields are **lean id lists** (`string[]`). The FE stores the full
picked object internally but ships only ids; the backend re-fetches the live
record each turn (honoring ownership, edits, `keep_fresh`). The FE tolerates and
flattens `string`, `{ id }`, and `{ mode, content }` shapes down to ids.

---

## Editability (IMPORTANT — default flipped)

- The **server defaults a resource to LOCKED** (read-only).
- The **FE now defaults editable-capable resources to EDITABLE** on attach, and
  emits `editable: true` explicitly. The user opts out by clicking the lock,
  which removes the key (→ server treats as locked).
- Therefore: **absence of `editable` = locked/read-only**; **`editable: true` =
  the agent may modify the underlying record.** The FE never sends
  `editable: false`.

Editable-capable types (toggle shown, default editable):
`input_notes`, `input_task`, `input_table`, `input_list`, `input_data`,
`input_webpage`, `input_project`, `input_transcript`,
`input_transcript_session`, `input_workbook`, `input_document`.

Never editable (no toggle): files/media (`image`, `audio`, `video`,
`document`), `youtube_video`, `text`, `input_agent`, `input_agent_app`, and the
editor pills.

---

## Type → payload field

### Live today (backend supported)

| `type` | Payload field | Notes |
|---|---|---|
| `text` | `text: string` | inline text |
| `image` / `audio` / `video` / `document` | `file_id` \| `url` \| `base64_data` (+ `mime_type`, `metadata`) | MediaRef contract — `file_uri` (native storage URI) was eradicated from the client 2026-07-06; identify by `file_id` first, then `url` (see `features/files/FEATURE.md`) |
| `youtube_video` | `url: string` | |
| `input_webpage` | `urls: string[]` | |
| `input_notes` | `note_ids: string[]` | |
| `input_task` | `task_ids: string[]` | |
| `input_table` | `bookmarks` | table bookmark objects — **a bookmark IS a reference item** (FLAT identity ids + display hints); types `full_table`/`table_column`/`table_row`/`table_cell` map to the `table*` reference taxonomy via `features/matrx-envelope/bookmarkToReference.ts` |
| `input_list` | `bookmarks` | list bookmark objects — same: `full_list`/`list_group`/`list_item` → `picklist`/`picklist_group`/`picklist_item` |
| `input_data` | `refs` | data ref objects |

> **Bookmarks are reference items.** The bookmark shapes are the CANONICAL generated wire
> types (`types/python-generated/stream-events.ts`) — re-exported from `message-types.ts`, not
> hand-redefined. Identity ids are authoritative; `table_name`/`list_name`/`column_display_name`/
> `label`/`description` are non-authoritative display hints (re-fetched live). See
> [`features/matrx-envelope/FEATURE.md`](../../../matrx-envelope/FEATURE.md).

---

## Context-channel resources (NOT a content[] block)

One block type does **not** emit a `content[]` block: `processed_document`. A
processed document (an OCR'd → AI-cleaned file the user attached by reference)
rides the **context channel** — it emits a lazy pointer into `request.context`
so the backend materializes the chosen representation on demand instead of the
FE shipping the body every turn.

- **Builder:** `features/agents/utils/processedDocumentContext.ts` →
  `buildProcessedDocumentContextValue`.
- **Selector:** `instance-resources.selectors.ts` → `selectResourceContextPayload`
  emits one entry per ready `processed_document` resource. It is merged into
  `request.context` by `instance-context.selectors.ts` →
  `selectRequestContextPayload` (used by all three execution thunks).
- **Excluded from `content[]`** in `selectResourcePayloads` (alongside editor
  pills) so the binary and reference paths never cross.

Wire shape (one key per attached document, keyed `attached_document_<id8>`):

```jsonc
{
  "attached_document_1a2b3c4d": {
    "source": {
      "kind": "processed_document",
      "id": "<processed_document_id>",
      "representation": "clean"        // or "raw" — the chosen PRIMARY
    },
    "type": "json",
    "label": "<display label>",
    "description": "<agent-facing note>"
    // NB: NO `content` key — the backend treats a source-only rich value as the
    // LAZY form and resolves the body via context_sources.py on demand.
  }
}
```

**Backend contract (aidream, BUILT):** `aidream/services/conversation_context/context_sources.py`
+ `aidream/services/documents/context_source_resolver.py` resolve `source.kind
== "processed_document"` into a cheap descriptor (section ToC + alternate
formats) and materialize clean/raw on demand. The agent reaches the other
formats (raw / pages / knowledge_assets / pdf page images) via the
`document_content` tool, auto-injected whenever a processed document is attached.
`DocumentRepresentation` values today: `clean` | `raw`.

### Pending backend support (FE emits these now)

| `type` | Payload field | Entity |
|---|---|---|
| `input_agent` | `agent_ids: string[]` | saved agent (reference) |
| `input_project` | `project_ids: string[]` | project |
| `input_agent_app` | `agent_app_ids: string[]` | published agent app (reference) |
| `input_transcript` | `transcript_ids: string[]` | full transcript record |
| `input_transcript_session` | `transcript_session_ids: string[]` | one session within a transcript (distinct from the full transcript) |
| `input_workbook` | `workbook_ids: string[]` | workbook |
| `input_document` | `document_ids: string[]` | Matrx rich document (NOT an uploaded file) |

`input_transcript` vs `input_transcript_session` are **two separate types** by
design — a whole transcript vs. a single recording session inside it.

### Open questions for backend

1. Confirm the `*_ids` field names above (or tell us your preferred names).
2. Confirm which Pending types are writable (honor `editable: true`) vs.
   reference-only. FE currently marks project/transcript/session/workbook/
   document as editable-capable; agent/agent_app as reference-only.
3. Confirm `template` support for any of the new types (FE can send it).
