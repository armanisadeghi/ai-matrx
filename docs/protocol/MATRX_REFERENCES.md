# Matrx References — the `reference` kind & the `matrx` fence

> A pointer to anything we hold internally — a picklist, a table cell, a whole
> table, (soon) a note, task, file, KG entity — is a **reference**, not a copy and
> not bespoke text. ONE vocabulary, shared by chat content, agent output, and
> **workflow edges**. Broad→specific: `kind:"reference"` says *what family*, `type`
> says *what kind of thing*, each `items[]` is the *pure pointer*.

## What a reference is (and is not)

- **Pure identity.** An item is the ids that name the thing + optional display
  hints. **Nothing else.** It stores **ids, never the value** — the value is
  re-fetched live on every read, so it is never stale.
- **Not an action.** A reference is `category: pure` — resolving it twice is free,
  it never mutates, it is **safe to resolve inside untrusted content**. (Contrast:
  an `output_directive` mutates and executes only at output root.)
- **Not source-coupled at the `kind` level.** Every reference — udt table, udt
  picklist, note, file — is `kind:"reference"`. The **source lives in `type`**, not
  `kind`. (Why this matters: § The kind boundary.)

## The item shape — identity + display hints, nothing more

`purpose` and `slot` are **GONE from the item** (§ Where purpose went). An item is
the typed ids plus optional, **non-authoritative** display hints — re-fetched live,
present only for instant paint + offline/LLM readability:

```matrx
{
  "matrx_version": 1,
  "kind": "reference",
  "type": "table_cell",
  "items": [
    {
      "table_id": "fafdf7da-…",
      "row_id": "4127fbc8-…",
      "column_name": "key_aspects",
      "table_name": "CA WC Defense Terms",
      "column_display_name": "Key Aspects",
      "description": "Cell \"Key Aspects\" in row 4127… of \"CA WC Defense Terms\""
    }
  ]
}
```

Many items is the norm, not the exception — the pure shape restores the list:

```matrx
{ "matrx_version":1, "kind":"reference", "type":"picklist_item",
  "items":[ {"list_id":"a729…","item_id":"0c36…","label":"Illustrated Recipe"},
            {"list_id":"a652…","item_id":"11ff…","label":"Cooking Items"} ] }
```

## The reference type taxonomy

`kind:"reference"` · `category: pure`. Each `type` = one scope of one resource;
each has a registered Pydantic item model (required ids + optional hints,
`extra="allow"` for UI fetch hints like limit / offset / sort).

| type | identity ids | scope |
|---|---|---|
| `picklist` | `list_id` | whole list |
| `picklist_group` | `list_id`, `group_name` | one group |
| `picklist_item` | `list_id`, `item_id` | one item |
| `table` | `table_id` | whole table |
| `table_column` | `table_id`, `column_name` | one column |
| `table_row` | `table_id`, `row_id` | one row |
| `table_cell` | `table_id`, `row_id`, `column_name` | one cell |
| `table_schema` | `table_id` | column defs only — **never rows** (5th dimension) |
| `transcript_segment` | `transcript_id`, `segment_index` | one segment of `transcripts.segments` (0-based) |
| `session_transcript` | `session_id`, `transcript_id?` | a studio session ↔ its materialized transcript |
| `workbook_sheet` | `workbook_id`, `sheet_id` | one sheet of a workbook's latest snapshot |
| `document_page` | `document_id`, `page_index` | one (1-based) page of a document's latest snapshot |
| `file_page` | `file_id`, `page_number` | one (1-based) PDF page in `cld_files` |
| `conversation_value` | `key`, `conversation_id?`, `field?` | one stored conversation value (`chat.conversation_value`) — `field` narrows a json value by dot/bracket path; owner-scoped, resolves per-send (Pattern 2 pass-by-reference) |
| `context_value` | `scope_id`, `context_item_id` | the filled cell — current `(scope × item)` value (alias of `context_item_value`) |

Positional indices (`segment_index` / `page_index` / `page_number`) are **strings on
the wire** (parity with the other numeric reference ids). Display-hint fields (all
optional, all non-authoritative): `label`, `table_name` / `list_name` / `sheet_name` /
`workbook_name` / `document_name`, `column_display_name`, `description`.

**Record-shaped types (one `resources.py` entry each, loop-registered as `RecordRef`):**
`note`, `task`, `project`, `agent`, `agent_app`, `organization`, `scope`, `scope_type`,
`context_item`, `conversation`, `kg_entity`, … — a new referenceable resource is **one
registry line**, never a new structure. A resource whose model lives outside aidream's
`db.models` (another schema/package) sets the entry's `module` field; `kg_entity`
(matrx-rag's `rag.kg_entities`, `module="matrx_rag.db.models_rag"`) is the reference case
— RLS still gates it because the model rides the host pool's `acting_as_user()` connection.

## Two shapes only — full envelope or raw typed item

1. **Full envelope** — `{matrx_version, kind, type, items}`. Use **anywhere it is
   serialized, persisted, embedded in content, or crosses a process / network
   boundary** — i.e. almost always. `matrx_version` is the *only* detection trigger;
   include it and any observer (logger, checkpoint inspector, a brand-new consumer)
   routes it for free.
2. **Raw typed item** — the bare Pydantic item model, **in-process only**, on a
   contracted channel where the type is known from the function signature (you pass
   the object; you do not serialize an envelope).

**There is no third shape.** `type`+`items` *without* `kind`/`matrx_version` is
**forbidden** — undetectable (`isMatrxEnvelope` keys on `matrx_version` presence)
yet under-typed. Full envelope, or the typed object. Nothing between.

## The fence — the only in-content encoding

In prose (message text, substituted prompt, system instruction) a reference is a
self-contained ` ```matrx ` fenced block on its own lines:

````text
```matrx
{ "matrx_version":1, "kind":"reference", "type":"picklist_item",
  "items":[ {"list_id":"a729…","item_id":"0c36…","label":"Illustrated Recipe"} ] }
```
````

- Opening fence is exactly ` ```matrx ` (language `matrx`, not `json`). Detection
  reuses the render-block splitter (`SPECIAL_CODE_LANGUAGES` + Python mirror).
- Gate is `"matrx_version" in obj`; bad JSON / missing key → render as a normal
  `code` block (fail-safe, never drop).
- **Persist the fence verbatim.** Never store a resolved value in its place.

## The kind boundary — why `reference`, never `udt_handler`

`kind` is the **security category**, not the data source. The position invariant
keys on it:

- **Output root** of an agent's structured output → an `output_directive` /
  `validation` may **execute**.
- **Inside a content fence** → only `reference` (and later `secret`) **resolve**. An
  action found in content is **logged + skipped, never executed.**

A source-named kind (`udt_handler`) would carry a pure `table_cell` read **and** a
side-effecting `create_table_row` write under one kind — and the in-content filter
could no longer tell "safe to resolve" from "must never execute." **`kind` stays =
category.** Source-specificity is `type`'s job; cohesion of source logic is the
resolver's job (next section). It also keeps `kind` from proliferating per source
(`udt_handler`, `note_handler`, `file_handler`, …) — the opposite of broad→specific.

## One orchestrator, source-grouped resolvers

There is **exactly one `ReferenceOrchestrator`** in the codebase. Anyone holding a
`kind:"reference"` envelope hands it over; it validates the shell, then dispatches
each item by `type` to a registered resolver. Source logic is **grouped in the
resolver** — the cohesion a `udt_handler` kind would wrongly put in `kind`:

- `UdtTableResolver` → `table` / `table_column` / `table_row` / `table_cell` / `table_schema`
- `UdtPicklistResolver` → `picklist` / `picklist_group` / `picklist_item`
- `special.py` → `file`/`media`, `context_item_value`/`context_value`, `agent_variable`
- `compound.py` → `transcript_segment`, `session_transcript`, `workbook_sheet`, `document_page`, `file_page`
- `record.py` (generic) → every `RecordRef` type (`note`, `agent_app`, `scope`, …)

**Auth is the resolver's job and is non-negotiable.** A reference is resolved
**only** against data the requesting `user_id` may read — owner or public. A forged
id resolves to the display label, never another user's value. No `user_id` → no
fetch. (Live gate: `aidream/services/references/resolvers.py`.)

## Where `purpose` / `slot` went — externalized to the use-site

A pure reference carries no intent. *How* it is consumed is decided by **where it
sits**, never by a field on the item:

- **In-content fence** → resolved in place; the fence's **position is the slot**.
- **Agent variable binding** → `variables: { style: <envelope> }`; the **map key is
  the slot**.
- **Workflow edge** → the **consuming node** decides what to do with the value.

**Resolved:** intent is **position-decided** — the orchestrator resolves every item it
is handed (a reference in a content fence / on an edge / in a `variables` slot IS a
resolution request); the legacy item-level `purpose` no longer gates anything. The
fields stay only to accept legacy payloads and will be dropped once the FE stops
emitting them. The envelope shell is `extra="forbid"` (non-negotiable), so any future
explicit override would NOT live on the shell — but position has proven sufficient and
none is planned. Do **not** re-add `purpose`/`slot` to the item.

## Resolution pipeline (one path, client + server)

- **Server — provider send:** for each `matrx` reference fence, the
  `ReferenceOrchestrator` resolves each item and the value is swapped **only into
  the wire clone** sent to the model (`picklist_runtime.build_wire_config` /
  `set_wire_swaps`) — never persisted, re-resolved from live DB every send.
- **Server — workflow edge:** a node emits a reference envelope; a downstream node
  resolves it on read. No two nodes must pre-agree on a shape — the envelope is
  self-describing. (§ Workflow.)
- **Client:** parse fence → render each item by `type` (chip / cell preview),
  `display` hints for instant paint, optional live refetch. **Never** show raw fence
  JSON in production UI. Authoring inserts a `matrx` fence, never a bare id.

## Bookmarks converge onto references

`input_table` / `input_list` content blocks **keep their attachment wrapper**
(`convert_to_text`, `keep_fresh`, editable-tool injection) but their `bookmarks`
**are reference items** using these exact models — not a parallel `bookmark` shape.
The bookmark wire types map 1:1: `full_table`→`table`, `table_cell`→`table_cell`,
`table_schema`→`table_schema`, `full_list`→`picklist`, `list_item`→`picklist_item`, …
**One vocabulary; the bookmark-specific Pydantic models**
(`packages/matrx-ai/matrx_ai/db/message_parts.py`) **retire into the reference types.**

## Workflow — the reference is the data bus

`matrx-graph` edges carry reference envelopes. A step that outputs "this udt row"
emits `{kind:"reference", type:"table_row", items:[…]}`; any downstream node — or a
logger, a checkpoint inspector, a node written a year later — resolves it because it
is self-describing and typed. **Sender and receiver never have to be looking for the
same thing first** — the whole point of the system. **Wired** via the
`matrx_graph.references` seam: the host injects the `ReferenceOrchestrator`
(`configure_reference_resolver`) and a node calls `await resolve_references(payload,
user_id=ctx.user_id)`. Opt-in by design — a node that operates on the resource
structurally keeps the typed ids; only one that needs the rendered value resolves.

## The position invariant (security boundary)

The same envelope shape appears in two POSITIONS; position decides what is allowed:

- **Root of an agent's structured output** → an `output_directive` / `validation`
  may execute.
- **Inside a content fence (prose)** → only `reference` (and later `secret`)
  **resolve**. An `output_directive` found in a fence is **logged + skipped, never
  executed.**

## Status (built vs. designed)

**Built now** (live in `aidream/services/references/`, **63 registered shapes** in
[`matrx_envelope_registry.generated.json`](matrx_envelope_registry.generated.json)):
- The **udt taxonomy** — `picklist` / `picklist_group` / `picklist_item`,
  `table` / `table_column` / `table_row` / `table_cell` / `table_schema` (columns-only,
  never rows) — each with a pure item model and an ownership-gated resolver
  (`resolvers.py`); `dataset_cell` (+ `dataset_id` / `field_name`) stays registered as a
  legacy alias of `table_cell`.
- **Compound types** (`compound.py`, RLS via `acting_as_user`) — `transcript_segment`,
  `session_transcript`, `workbook_sheet`, `document_page`, `file_page`.
- **Item purity** — items are identity + display hints; `purpose`/`slot` are
  accepted-and-IGNORED for back-compat only (resolution is decided by **position**).
- The single **`ReferenceOrchestrator`** (`orchestrator.py`) — decode + dispatch by
  `type` + enforce `user_id`; resolves every item by position.
- The generic **`RecordRef`** + read-only **referenceable registry** (`resources.py`)
  — every id-keyed user resource (note/task/project/… + read-only extras) is one
  loop-registered `type`; loads inside `acting_as_user()` (RLS). Cross-schema/cross-package
  via the entry's `module` field — `kg_entity` (matrx-rag `rag.kg_entities`) is RLS-gated
  unchanged because the model rides the host pool's `acting_as_user()` connection.
- **Special resolvers** (`special.py`) — `file`/`media` (owner-scoped `MediaRef`),
  `context_item_value` / `context_value` (depth-guarded recursion; `context_value` is
  the FE-facing alias keyed `{scope_id, context_item_id}`), `agent_variable`.
- **Bookmark convergence** (`bookmarks.py`) — `BOOKMARK_TYPE_TO_REFERENCE` +
  ownership-gated `resolve_bookmark(s)` through the orchestrator.
- **`matrx-graph` reference edges** — `matrx_graph.references` injection seam
  (`configure_reference_resolver` / `resolve_references`), aidream wires the
  orchestrator; opt-in, ownership-gated.
- The ` ```matrx ` fence detection + in-content substitution (`substitute.py`, wired
  in `prepare_agent_run`); FE `MatrxEnvelopeBlock` renders the fence.

**Designed / not yet built:**
- **Drop** the deprecated `purpose`/`slot` item fields entirely — held until the FE
  stops emitting them (the resolution read is already externalized).
- **Delete the legacy bookmark hot path** (`bookmark_as_xml` in `structured_input_config.py`)
  — acknowledged + **scheduled for removal by 2026-06-30**. The FE is migrating attachments
  onto the ownership-gated fence; kill the unscoped cross-user-read path rather than hot-swap
  it (see `FOUND_DEFECTS.md` → Deferred).
- **A graph node that opts into** `resolve_references` on its inputs (the seam is wired;
  no consumer node yet).

## Open items (focus next)

1. **FE handoff (Phase 4).** FE re-pulls the regenerated stream types
   (`scripts/sync-types.mjs`) — `input_table`/`input_list` bookmarks are now typed
   unions; authoring emits ` ```matrx ` fences (not bare `picklist_ref`).
2. Retire the legacy `picklist_ref` *variable* path once the FE emits fences (stays
   behind the parallel-encoding allowlist until then — annotated in
   `scripts/validate_envelope_registry.py`).
3. **Delete the legacy bookmark hot path by 2026-06-30** (acknowledged) + audit
   `input_notes` / `input_task` for the same unscoped-read class as they go.

## Change Log

- 2026-06-21 — **`kg_entity` referenceable + legacy bookmark kill date.** `kg_entity` is now
  a `RecordRef` over matrx-rag's `rag.kg_entities` via a new `module` field on the registry
  entry (the cross-schema/cross-package seam) — no cross-DB loader needed (same physical pool;
  matrx-orm reuses the active RLS connection, so `acting_as_user()` enforces the org policy;
  proven live: member reads, non-member fail-closed). Manifest → **63 shapes**. The legacy
  `bookmark_as_xml` cross-user-read path is acknowledged + **scheduled for deletion 2026-06-30**
  (deprecation banners in `structured_input_config.py`).
- 2026-06-21 — **Frontend handoff implemented** (matrx-frontend
  `features/matrx-envelope/AIDREAM_REFERENCE_IMPLEMENTATION.md`). +8 shapes (→ **62**) for
  the types the FE now copies: `agent_app` (RecordRef → `aga_apps`); `table_schema`
  (columns-only 5th table dimension) + `TableSchemaBookmark` +
  `BOOKMARK_TYPE_TO_REFERENCE["table_schema"]`; `context_value` (FE alias of
  `context_item_value`); and the compound `transcript_segment` / `session_transcript` /
  `workbook_sheet` / `document_page` / `file_page`. `organization` / `scope` / `scope_type`
  / `context_item` were already RecordRef types. Manifest + `stream-events.ts` regenerated.
  Note: `transcript_segment` resolves against the structured `transcripts.segments` JSONB
  (the table has no `content` column — index = position in `segments`).
- 2026-06-20 — **Reference rollout SHIPPED (Phases 1–4 backend).** Full 7-type udt
  taxonomy + generic `RecordRef` over a read-only referenceable registry + 3 special
  resolvers (file/media, recursive `context_item_value`, `agent_variable`) = 54
  registered shapes. Items purified; `purpose`/`slot` externalized (orchestrator
  resolves by position; fields accepted-and-ignored). Single `ReferenceOrchestrator`.
  Bookmark→reference bridge (`bookmarks.py`, ownership-gated). `matrx-graph` edge seam
  (`matrx_graph.references` + aidream wiring). Stream types + manifest regenerated for
  the FE. Deferred: `kg_entity` (separate DB), the bookmark hot-path swap (visibility
  decision), dropping the deprecated item fields (post-FE).
- 2026-06-20 — **Reference purified + completed (design).** Item = pure identity +
  display hints; `purpose`/`slot` externalized to the use-site. Full 7-type
  taxonomy (`picklist` / `picklist_group` / `picklist_item`, `table` /
  `table_column` / `table_row` / `table_cell`). `kind` stays = security category
  (`reference`); source-named `udt_handler` rejected — it would break the in-content
  position invariant. One `ReferenceOrchestrator` + source-grouped resolvers. Two
  shapes only (full envelope | raw typed item). Bookmarks converge onto references;
  `matrx-graph` edges carry references.
- 2026-06-17 — Items-based (`items:[{purpose,slot?,ref,display?}]`), types
  `picklist_item` / `dataset_cell` registered with resolvers; the position
  invariant; the ` ```matrx ` fence.
