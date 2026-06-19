# Matrx References — the `reference` kind & the `matrx` fence

> A picklist item or table cell embedded in prose is a **reference**, not text.
> ONE encoding: a ` ```matrx ` fenced [Matrx Envelope](MATRX_ENVELOPE.md) with
> `kind:"reference"`. Same outer shell as everything — `items` carries the
> pointer(s). No inline bare JSON, no delimiter tokens, no sidecar map.

## The fence (the only in-content encoding)

A reference is a self-contained fenced block on its own lines inside any host
string (message text, substituted prompt, system instruction):

````text
```matrx
{
  "matrx_version": 1,
  "kind": "reference",
  "type": "picklist_item",
  "items": [
    { "purpose": "substitute", "slot": "style",
      "ref": { "list_id": "a729…", "item_id": "0c36…" },
      "display": { "label": "Illustrated Recipe" } }
  ]
}
```
````

- Opening fence: exactly ` ```matrx ` on its own line (language `matrx`, not `json`).
- Body: one Matrx Envelope. Detection reuses the render-block splitter
  (`SPECIAL_CODE_LANGUAGES` + Python mirror); `matrx` is a first-class fence
  language. Envelope gate is `"matrx_version" in obj`; invalid JSON / missing key
  → render as a normal `code` block (fail-safe, never drop).
- **Persist the fence verbatim.** Never store a resolved value or token in its place.

## Reference item fields (each `items[]`)

The four top-level keys are fixed; a reference's data lives in each item:

- **`purpose`** *(required)* — pipeline behavior: `substitute` / `expand` (resolve
  for the model — synonyms) · `inline` (user-placed in prose) · `context` (injected
  via manifest). **v1 implements `substitute`/`expand` end-to-end; `inline` /
  `context` are registered now, full behavior later.** Never hard-code behavior off
  `type` alone — `purpose` is the extension point.
- **`slot`** *(optional)* — the `{{slot}}` this item fills when resolving for the
  model. The client may send the fence in text or as `variables:{slot:<fence>}`;
  both normalize to the persisted fence.
- **`ref`** *(required)* — the identifying ids (typed per `type`).
- **`display`** *(optional)* — last-known UI hint, never authoritative. The resolver
  re-fetches live; `display` is for instant paint + offline-export readability.

## v1 types (registered: `aidream/services/references/`)

| type | `ref` ids | model-resolve (`substitute`) | render |
|---|---|---|---|
| `picklist_item` | `list_id`, `item_id` | item `description` (fallback `label`) — `user_data/picklist_reference_fetch.py` | chip |
| `dataset_cell` | `dataset_id`, `row_id`, `field_name` | cell value as string — `dataset_reference_fetch.py::fetch_table_cell` | chip / cell preview |

`dataset_id` accepts legacy `table_id` during migration. Reserved (register before
use): `picklist_group`, `picklist_full`, `dataset_row`, `dataset_column`,
`dataset_full` — **bookmarks become fence envelopes, never a second language.**

## The position invariant (security boundary)

The same envelope shape appears in two POSITIONS; position decides what's allowed:

- **Root of an agent's structured output** → an `output_directive` / `validation` may
  execute.
- **Inside a content fence (prose)** → only `reference` (and later `secret`)
  **resolve**. An `output_directive` found inside a fence is **logged + skipped,
  never executed.**

## Pipeline (one path, client + server)

- **Server — provider send:** walk text fields; for each `matrx` fence whose items
  carry `purpose:substitute|expand`, resolve each item and replace **only in the
  wire clone** sent to the model (generalizes today's picklist wire-swap via
  `picklist_runtime.build_wire_config` / `set_wire_swaps`). Re-resolve from live DB
  every send — continue-turns rely on the self-contained fence, not a re-sent
  envelope.
- **Server — auth:** authoritative `list_id` / `dataset_id` come from the agent
  binding, never client-forged ids.
- **Client:** parse fence → render each item by `type` (chip), `display` for instant
  paint, optional live refetch. Never show raw fence JSON or private-use tokens in
  production UI. Authoring inserts a `matrx` fence (not a bare uuid, not legacy JSON).

## `secret` (deferred)

An explicitly hidden picklist value uses the **same fence** with `kind:"secret"`,
`purpose:"substitute"`. v1 uses `reference` for normal picklists. One fence, two
families — never a third encoding.

## Status

- **Registered + schema-gen + decode:** done (`picklist_item`, `dataset_cell`).
- **Resolvers:** `aidream/services/references/resolvers.py` (live DB fetch).
- **Next (migration):** wire resolvers into `aidream/api/utils/picklist_resolution.py`
  (`resolve_and_stage` → `set_wire_swaps`) so a `matrx` fence substitutes on the wire,
  and the FE renderer + authoring insert the fence. Until then the legacy
  `picklist_ref` path stays live behind the back-compat allowlist.

## Change Log

- 2026-06-17 — Items-based (every reference is `items:[{purpose,slot?,ref,display?}]`),
  types `picklist_item` / `dataset_cell` registered with resolvers; the position
  invariant; the ` ```matrx ` fence.
