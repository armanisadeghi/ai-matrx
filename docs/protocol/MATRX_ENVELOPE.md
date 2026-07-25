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
- **`items`** *(array, required)* — the **universal payload**. Every `(kind, type)`
  registers a Pydantic **item model**; `items` is a list of those. One item or a
  hundred — always a list. There is no other place for data.

**Exactly four top-level keys** — `matrx_version`, `kind`, `type`, `items`, and
nothing else (the outer model `forbid`s extras). The shell is identical for every
kind; all variation lives *inside* each item, typed per `(kind, type)`. An LLM
`output_schema` makes the three control fields `const`, so the model only authors
`items`. **Don't force one item shape across kinds, and don't wrap a singular kind
in anything but the list — the uniformity is the shell, not the item.**

## Detection & routing — one path, shared by client + server

```
isMatrxEnvelope(obj) = "matrx_version" in obj
decode(obj)          → { kind, type, body }
route                → registries[kind][type]   # one registry per kind
```

ONE detector + decoder, **mirrored in TS and Python**. A new orchestrator = a new
`kind` + its registry — never a new top-level shape. A consumer handles only the
kinds it owns and skips the rest by `kind`; it need not know every `type`.

## Position decides capability (security boundary)

The same envelope shape means different things by **where it sits**:

- **Root of an agent's structured output** → an `output_directive` / `validation` may
  **execute** (side effect).
- **Embedded inside content** (a ` ```matrx ` fence in prose — see
  [MATRX_REFERENCES.md](MATRX_REFERENCES.md)) → only `reference` / `secret` **resolve**.
  An `output_directive` found inside content is **logged + skipped, never executed.**
- **Current-turn model-authored text** (the third position, added 2026-07-02) → the
  orchestrator's `turn_directive_handler` seam hands EACH turn's model output — never
  history, user, or tool content — to the host, which executes ONLY explicitly
  turn-scoped shapes (today: `(output_directive, context_groom)`). The position is
  enforced by the INVOKER (matrx-ai passes only that turn's assistant text; the host
  guards kind/type) — `ShapeSpec.purposes` remains documentation, not enforcement.
  The blast radius of a turn-scoped shape must be reversible and confined to the
  requester's own conversation (context_groom: stub/retain value-linked tool rows).

In-content references use ONE encoding — the ` ```matrx ` fence — never inline bare
JSON or delimiter tokens. Full contract: [MATRX_REFERENCES.md](MATRX_REFERENCES.md).

## The `kind` registry (launch set)

| kind | category | what it is | each `items[]` |
|---|---|---|---|
| `output_directive` | `side_effect` | output that applies a durable server action (the apply system) | the thing to create/update (a project, a task, a row) |
| `reference` | `pure` | a pointer resolved/fetched on read; never carries stored data | `{ …ids, display-hints? }` — pure identity (see [MATRX_REFERENCES.md](MATRX_REFERENCES.md)) |
| `secret` | `sensitive` | a token resolved only for the model; redacted on store/display | `{ purpose, token, source }` |
| `validation` | `pure` | name a validation function to run (server workflows, client dynamic forms) | `{ args }` |

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

**`reference`** — each item is a **pure pointer**: the typed identity ids + optional
**display hints** (`label` / `table_name` / `description` / …), nothing else.
**Stores ids, never data** — the resolver re-fetches live on render → never stale.
Intent is **not** on the item: `purpose`/`slot` are externalized to the use-site
(fence position, the `variables` map key, or the consuming workflow node). One
`ReferenceOrchestrator` dispatches each item by `type` to a source-grouped resolver
that enforces ownership. Full taxonomy + the seven types: [MATRX_REFERENCES.md](MATRX_REFERENCES.md).

**`secret`** — `kind:"secret"` makes "**must never persist resolved**" one greppable,
enforceable rule. The resolver injects the real value only into the model-bound
payload; the redactor strips it from everything stored or shown.

**`validation`** — each item names a validation function + `args`. Identical shape
server-side (workflow gate) and client-side (dynamic form/process). Pure: returns a
result, mutates nothing.

## Examples (every current case, unified)

```jsonc
// output_directive — create a project tree (model authors only `items`)
{ "matrx_version":1, "kind":"output_directive", "type":"create_project_with_tasks",
  "items":[ { "name":"Website Redesign", "tasks":[ /* … */ ] } ] }

// output_directive — generic typed write; resource_type lives IN the item (mixed batches OK)
{ "matrx_version":1, "kind":"output_directive", "type":"db_create",
  "items":[ { "resource_type":"note", "data":{ "title":"…", "content":"…" } } ] }

// reference — picklist item (in a ```matrx fence); item = pure identity + display hints
{ "matrx_version":1, "kind":"reference", "type":"picklist_item",
  "items":[ { "list_id":"a729…", "item_id":"0c36…", "label":"Illustrated Recipe" } ] }

// secret — vault-key pointer (resolved for the model on the wire only, never stored)
{ "matrx_version":1, "kind":"secret", "type":"user_secret",
  "items":[ { "purpose":"substitute", "key":"OPENAI_API_KEY" } ] }

// validation — a self-contained check (rule + value live in the item); pure pass/fail
{ "matrx_version":1, "kind":"validation", "type":"regex",
  "items":[ { "value":"a@b.com", "pattern":"^[^@]+@[^@]+\\.[^@]+$" } ] }
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
- **Exactly four top-level keys** (`matrx_version`/`kind`/`type`/`items`); all data
  lives inside each item. `items` is always a list. Every `(kind, type)` has a
  registered Pydantic item model — that's the only way to be in the system.
- `reference` stores ids + optional last-known `display`, never live data.
- `secret` must pass the redactor before any persist/display.
- `output_directive` idempotency is server-derived; a failed apply warns, never fatal.
- **Position decides capability:** actions execute only at output root; in content, only
  `reference`/`secret` resolve (an action in content is skipped).
- **Every kind/type is registered** (below) — an unregistered or undocumented shape, or a
  parallel encoding, is a build failure.
- Bump `matrx_version` **only** on a breaking change; add kinds/types freely without a bump.

## Registration & enforcement

Every `kind` and every `type` is declared **once, in code**, with metadata + body schema
+ handler + a one-line doc. The registry is the source of truth; the client mirror and the
doc tables are **generated** from it; `release.sh` fails loudly on any divergence. This is
what stops many coding agents from sprouting parallel sub-systems.

- **Register (one site per type).** `kind` → category (`pure`/`side_effect`/`sensitive`).
  `type` → a Pydantic body model (fields + required), a handler (resolver/executor),
  allowed `purpose` values (references), a one-line doc. Collected at import, like the
  directive registry and declared tools.
- **Generate.** `scripts/generate_envelope_registry.py` emits the canonical
  `docs/protocol/matrx_envelope_registry.generated.json` (kinds, categories, types, field
  schemas, purposes), committed **byte-identical to both repos** and regenerated like
  db-types / stream-events. **The doc reference tables are generated from it — registering
  and documenting are one act.**
- **Mirror.** TS consumes the generated manifest → typed `kind`/`type` unions + per-type
  field types + a schema-aware `isMatrxEnvelope` / `decode`. The `matrx` fence language is
  registered in `SPECIAL_CODE_LANGUAGES` + the TS mirror.
- **Enforce — `scripts/validate_envelope_registry.py`** (loud + non-blocking in
  `release.sh`; `:strict` exits non-zero for CI). It screams on:
  - a `kind`/`type` literal used in code that isn't registered;
  - a registered `type` missing a body model, handler, doc, or its `kind`'s category;
  - the committed manifest being stale (regenerate + diff);
  - a **parallel encoding** — grep guard for the eradicated shapes (`__matrx_apply`,
    `picklist_ref`, `<<<MATRX_START>>>`, the private-use `…` tokens, bare inline
    reference JSON) outside the back-compat decoder;
  - the `matrx` fence missing from `SPECIAL_CODE_LANGUAGES` or the TS mirror;
  - the two repos' protocol mirror set diverging — this doc, `MATRX_REFERENCES.md`,
    and the generated manifest byte-compared against the co-located frontend
    checkout (`$MATRX_FRONTEND_DIR`, else the `../ai-matrx` sibling; missing
    checkout = loud warn + skip). The FE half of the pact is ai-matrx
    `scripts/check-protocol-sync.ts` (`pnpm check:protocol-sync`, `--fix` copies
    aidream → FE), so drift screams no matter which repo ships first.

**The one rule for every contributor (human or agent):** add a kind/type via the registry,
never inline. There is no second place to put one.

## Migration

During the transition, handlers accept **both** the legacy shapes (bare
`type:"user_table_cell"`, `item_presentation`, the old `__matrx_apply` envelope, the
delimiter/broker tokens) and the `matrx_version` envelope. New code emits **only** the
envelope. The back-compat decoder is the one sanctioned home for legacy detection (the
grep guard whitelists it); it is deleted per-family once migrated. Track open families in
the consuming `FEATURE.md`s.

## Consumers

- `aidream/services/output_directives/` — first `output_directive` consumer.
- `reference` kind + the ` ```matrx ` fence: [MATRX_REFERENCES.md](MATRX_REFERENCES.md)
  (v1: picklist + dataset-cell substitution).
- (to come) secret redactor, validation runner; matrx-frontend renderers + workflow wiring.

## Change Log

- 2026-06-20 — **`reference` item purified** to pure identity + display hints;
  `purpose`/`slot` externalized to the use-site (not item fields). `kind` stays =
  security category (`udt_handler` / source-named kinds rejected — they break the
  position invariant). Reference detail moved to its own authority
  [MATRX_REFERENCES.md](MATRX_REFERENCES.md) (7-type taxonomy, one
  `ReferenceOrchestrator`, workflow-edge contract). **FE copy of this file must
  sync** (kept byte-identical across repos).
- 2026-06-17 — **items-everywhere is canonical.** Exactly four top-level keys
  (`matrx_version`/`kind`/`type`/`items`); all data lives inside each item, typed by
  a registered Pydantic item model. Built the generic core
  (`aidream/services/matrx_envelope/`: outer model, registry, decode, schema-gen),
  migrated `output_directives` onto it (per-item receipts, server-derived
  idempotency, `create_tasks` collapsed into `create_task` with N items), registered
  the `reference` shapes, and shipped the registry enforcement
  (`scripts/generate_envelope_registry.py` + `validate_envelope_registry.py` in
  `release.sh`). Agent skill: `matrx-envelope`.
- 2026-06-17 — Added the position invariant (actions execute at output root only;
  in-content = resolve only), the ` ```matrx ` in-content fence + `reference` kind
  ([MATRX_REFERENCES.md](MATRX_REFERENCES.md)), and the Registration & enforcement system
  (code registry → generated manifest + doc tables → `release.sh` drift/parallel-encoding
  guards).
- 2026-06-17 — Created. The Matrx Envelope GOLD STANDARD: flat
  `matrx_version`/`kind`/`type` + kind-defined body; launch kinds
  `output_directive` / `reference` / `secret` / `validation`; shared detector +
  per-kind registry contract.
