# Matrx References — the `reference` kind & the `matrx` fence

> A picklist item or table cell embedded in prose is a **reference**, not text.
> ONE encoding: a ` ```matrx ` fenced [Matrx Envelope](MATRX_ENVELOPE.md) with
> `kind:"reference"`. No inline bare JSON, no delimiter tokens, no sidecar map.

## The fence (the only in-content encoding)

A reference is a self-contained fenced block on its own lines inside any host string
(message text, substituted prompt, system instruction):

````text
```matrx
{ "matrx_version":1, "kind":"reference", "type":"udt_picklist_item",
  "purpose":"substitute", "slot":"style",
  "list_id":"…", "item_id":"…", "display":{ "label":"Illustrated Recipe" } }
```
````

- Opening fence: exactly ` ```matrx ` on its own line (language `matrx`, not `json`).
- Body: one JSON object — a valid envelope.
- Detection reuses the render-block splitter (`SPECIAL_CODE_LANGUAGES` + TS mirror);
  `matrx` is a first-class fence language. Envelope gate is `"matrx_version" in obj`;
  invalid JSON / missing key → render as a normal `code` block (fail-safe, never drop).
- **Persist the fence verbatim.** Never store a resolved value or opaque token in its place.

## Reference body fields (kind-defined, not new universals)

The universals stay `matrx_version` / `kind` / `type`. The `reference` kind defines:

- **`purpose`** *(required on fence embeddings)* — pipeline behavior, separate from
  `type`. `substitute` (variable slot → resolve for the model) · `inline` (user-placed
  in prose) · `context` (injected via manifest). **v1 implements `substitute`
  end-to-end; `inline` / `context` are registered now, full behavior later.** `purpose`
  is the extension point — never hard-code behavior off `type` alone.
- **`slot`** *(optional)* — the `{{slot}}` this fence replaces when `purpose:substitute`.
  The client may send the fence in text or as `variables:{slot:<fence>}`; both normalize
  to the persisted fence.
- **`display`** *(optional)* — last-known UI hint, never authoritative. The resolver
  re-fetches live; `display` is for instant paint + offline-export readability.

## v1 types

| type | required ids | model-resolve (`substitute`) | render |
|---|---|---|---|
| `udt_picklist_item` | `list_id`, `item_id` | item `description` (fallback `label`) — `user_data/picklist_reference_fetch.py` | chip |
| `udt_dataset_cell` | `dataset_id`, `row_id`, `field_name` | cell value as string — `dataset_reference_fetch.py::fetch_table_cell` | chip / cell preview |

`dataset_id` accepts legacy `table_id` during migration. Reserved (register before use):
`udt_picklist_group`, `udt_picklist_full`, `udt_dataset_row`, `udt_dataset_column`,
`udt_dataset_full` — shapes mirror the existing bookmark types; **bookmarks become fence
envelopes, never a second language.**

## The position invariant (security boundary)

The same envelope shape appears in two POSITIONS; position decides what's allowed:

- **Root of an agent's structured output** → an `output_directive` / `validation` may
  execute.
- **Inside a content fence (prose)** → only `reference` (and later `secret`) **resolve**.
  An `output_directive` found inside a fence is **logged + skipped, never executed.**

## Pipeline (one path, client + server)

- **Server — provider send:** walk text fields; for each `matrx` fence with
  `purpose:substitute`, resolve the reference and replace **only in the wire clone** sent
  to the model (generalizes today's picklist wire-swap). Re-resolve from live DB every
  send — continue-turns rely on the self-contained fence, not a re-sent envelope.
- **Server — auth:** authoritative `list_id` / `dataset_id` come from the agent binding,
  never client-forged ids.
- **Client:** parse fence → render by `type` (chip), `display` for instant paint, optional
  live refetch. Never show raw fence JSON or `…` tokens in production UI. Authoring
  inserts a `matrx` fence (not a bare uuid, not a legacy bookmark JSON).

## `secret` (deferred)

An explicitly hidden picklist value uses the **same fence** with `kind:"secret"`,
`purpose:"substitute"` (parent doc's `secret` contract). v1 uses `reference` for normal
picklists. One fence, two families — never a third encoding.

## Registration

Every `reference` type registers in the Matrx Envelope Registry (kind, body model,
resolver, `purpose` applicability, doc) — see
[MATRX_ENVELOPE.md § Registration & enforcement](MATRX_ENVELOPE.md#registration--enforcement).
Unregistered/undocumented types and the legacy encodings fail `release.sh`.

## Change Log

- 2026-06-17 — Created. The `reference` kind + the `matrx` fence; v1 types
  `udt_picklist_item` / `udt_dataset_cell`; `purpose` / `slot` / `display` contract; the
  position invariant.
