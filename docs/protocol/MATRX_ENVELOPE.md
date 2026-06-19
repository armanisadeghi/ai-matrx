# Matrx Envelope — the GOLD STANDARD encoding

> **One flat JSON shape for an action, reference, secret, or validator** — anywhere
> in the platform: LLM output, stored content, workflow wiring, client ↔ server.
> **Detect once, route once, handle by family.** This file is the single source
> of truth and is kept **byte-identical** in `aidream` and `matrx-frontend`.

## The shape

```json
{
  "matrx_version": 1,
  "kind": "output_directive",
  "type": "create_project_with_tasks",
  "items": [ { } ]
}
```

- **`matrx_version`** *(int, required)* — the sentinel **and** the contract version.
  **Presence is the only trigger:** `"matrx_version" in obj` → Matrx envelope, else
  ignore. No normal data carries this key → zero-collision early-exit.
- **`kind`** *(string, required)* — the **orchestrator/family** the envelope routes
  to. A small **registered** set (never ad-hoc). Each `kind` declares a `category`.
- **`type`** *(string, required)* — the specific op within the `kind`. Descriptive
  (`create_project_with_tasks`, `user_table_cell`, `is_valid_email`).
- **Everything else is defined by the `kind`** (`items` for actions, id fields +
  `display` for references, `args` for validators, …).

**Reserved keys:** `matrx_version`, `kind`, `type` — a payload MUST NOT use them at
the top level. Flat by design: an LLM `output_schema` declares the control fields
as `const` and only authors the body.

## Detection & routing — one path, shared by client + server

```
isMatrxEnvelope(obj) = "matrx_version" in obj
decode(obj)          → { kind, type, body }
route                → registries[kind][type]   # one registry per kind
```

ONE detector + decoder, **mirrored in TS and Python**. A new orchestrator = a new
`kind` + its registry — never a new top-level shape. A consumer handles only the
kinds it owns and skips the rest by `kind`; it need not know every `type`.

## The `kind` registry (launch set)

| kind | category | what it is | body |
|---|---|---|---|
| `output_directive` | `side_effect` | output that applies a durable server action (the apply system) | `items: [...]` |
| `reference` | `pure` | a pointer resolved/rendered/fetched on read; never carries stored data | id fields + optional `display` |
| `secret` | `sensitive` | a token resolved to a secret only for the model; redacted everywhere stored/shown | `token` + `source` |
| `validation` | `pure` | name a validation function to run (server workflows, client dynamic forms) | `args: {...}` |

**`category`** is a documented property of each `kind` (not a wire field):
- `pure` — no mutation; resolving/running twice is free.
- `side_effect` — mutates; needs auth + idempotency + execute-once.
- `sensitive` — must be redacted before any persist/display.

Generic consumers and security audits read `category` from this table — so "is this
a side effect?" never requires parsing every `type`.

## Per-kind contracts

**`output_directive` (action)** — executes once, server-side, after the response is
delivered, before the stream closes ("has the last word").
- `kind` / `type` are `const` in the agent `output_schema`; the model authors only `items`.
- `items` is **always a list** (1..N). Each item applied independently → **per-item
  receipt** (`item 0: created proj_x`; `item 2: failed: …`). A bad item never rolls
  back good ones; each item's own write stays atomic.
- **Idempotency is derived server-side** (request id + item index) — never on the
  wire, so the model can't fumble it.
- A failed apply is **warn-not-fatal** — the delivered response always stands.

**`reference`** — a pure pointer. **Stores ids, never data.** Optional `display` is a
*last-known* hint for instant paint; the resolver re-fetches live values on render →
never stale.

**`secret`** — `kind:"secret"` makes "**must never persist resolved**" one greppable,
enforceable rule. The resolver injects the real value only into the model-bound
payload; the redactor strips it from everything stored or shown.

**`validation`** — names a validation function + `args`. Identical shape server-side
(workflow gate) and client-side (dynamic form/process). Pure: returns a result,
mutates nothing.

## Examples (every current case, unified)

```jsonc
// output_directive — create a project tree (model authors only `items`)
{ "matrx_version":1, "kind":"output_directive", "type":"create_project_with_tasks",
  "items":[ { "name":"Website Redesign", "tasks":[ /* … */ ] } ] }

// output_directive — generic typed write (resource_type is part of db_create's body)
{ "matrx_version":1, "kind":"output_directive", "type":"db_create",
  "resource_type":"note", "items":[ { "title":"…", "content":"…" } ] }

// reference — user-table cell (now carries the top-level marker; ids only + display hint)
{ "matrx_version":1, "kind":"reference", "type":"user_table_cell",
  "table_id":"a67b…", "row_id":"b671…", "field_name":"short_description",
  "display":{ "label":"Short Description" } }

// reference — item card (presentation = a reference + display, never the live data)
{ "matrx_version":1, "kind":"reference", "type":"agent", "id":"<uuid>",
  "display":{ "name":"Project Copilot", "about":"Plans work, edits tasks & notes…" } }

// secret — hidden picklist value (resolved for the model, redacted on store/display)
{ "matrx_version":1, "kind":"secret", "type":"picklist_value",
  "token":"opt_7f3a", "source":{ "picklist_id":"…", "option_id":"…" } }

// validation — run a validator (server workflow gate OR client form)
{ "matrx_version":1, "kind":"validation", "type":"is_valid_email",
  "args":{ "value":"a@b.com" } }
```

## Client vs server responsibilities

- **Server** runs `output_directive` (execute), `secret` (inject for the model +
  redact on store), `validation` (server gates); resolves `reference` when it needs
  the value (context, RAG).
- **Client** renders/fetches `reference` (cards, live data), runs client
  `validation`, shows `output_directive` receipts; **never** sees a resolved `secret`.
- Both share the same `isMatrxEnvelope` / `decode` and the same `kind`/`type`
  catalog (generated and kept in sync, like the stream-events contract).

## Invariants

- Detect **only** by `matrx_version` presence.
- `kind` is registered, never ad-hoc; each declares a `category`.
- A payload never uses a reserved key (`matrx_version`/`kind`/`type`).
- `reference` stores ids + optional last-known `display`, never live data.
- `secret` must pass the redactor before any persist/display.
- `output_directive` idempotency is server-derived; a failed apply warns, never fatal.
- Bump `matrx_version` **only** on a breaking change; add kinds/types freely without a bump.

## Migration

During the transition, handlers accept **both** the legacy shapes (bare
`type:"user_table_cell"`, `item_presentation`, the old `__matrx_apply` envelope) and
the `matrx_version` envelope. New code emits **only** the envelope. Legacy detection
is deleted once each family is migrated. Track open families in the consuming
`FEATURE.md`s.

## Consumers

- `aidream/services/output_directives/` — first `output_directive` consumer.
- (to come) reference resolver, secret redactor, validation runner; matrx-frontend
  renderers + workflow wiring.

## Change Log

- 2026-06-17 — Created. The Matrx Envelope GOLD STANDARD: flat
  `matrx_version`/`kind`/`type` + kind-defined body; launch kinds
  `output_directive` / `reference` / `secret` / `validation`; shared detector +
  per-kind registry contract.
