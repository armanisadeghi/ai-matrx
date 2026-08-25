# Kind Directives — the automated family of Content IR

> **ONE system.** Arman, 2026-08-23: the Matrx Envelope / Directive protocol and the
> Content IR kind system were *"always meant to be just one system"* — the split was a
> terminology accident. This file is the single source of truth for that one system, and
> it replaces the three documents it was merged from (`MATRX_ENVELOPE.md`,
> `MATRX_DIRECTIVES.md`, `MATRX_REFERENCES.md`, all deleted 2026-08-25).
> It is kept **byte-identical** in `aidream` and `matrx-frontend`.

A **Kind Directive** is an ordinary Content IR kind instance whose slug sits in a reserved
namespace, and whose registered shape carries execution semantics a plain kind does not:
a handler, a capability, an apply policy, and an idempotency ledger. Everything else —
detection, streaming pre-recognition, routing, rendering — is the *same* machinery every
kind uses. There is no second pipeline.

- Grammar + shell + position law (pure, importable anywhere): `matrx_graph.content_ir.directives`
- Server registry, decode, schema-gen, actions: `aidream/services/content_ir_directives/`
- Plan of record: `common-docs/projects/kind-directives/PLAN.md`

---

## 1. The shell — two keys, and `__kind` is first

```json
{ "__kind": "directive_v1_create_task", "items": [ { "title": "Draft the brief" } ] }
```

**Exactly two top-level keys.** The outer model is `extra="forbid"`, which is what makes
"everything lives inside `items`" structurally true rather than a convention: a stray
top-level key is a hard error, never a silent passthrough.

- **`__kind`** *(string, required, FIRST)* — the ONE discriminator. Same key every kind
  instance carries; the value is the directive slug (§2).
- **`items`** *(array, required)* — the universal payload. Every slug registers a Pydantic
  **item model**; `items` is a list of those. One item or a hundred — always a list. There
  is no other place for data.

**`__kind` first is a wire requirement, not a style rule.** A bound agent streams an
*unfenced* JSON document, and the only thing that can type it before it finishes arriving
is its own first key (`block_detector.root_kind_declaration`). `__kind` first means a
directive routes through the same skeleton→fill→component path as every other kind from
the first ~30 characters — which is what makes a kind-specific loading state possible at
all, and is why the raw-JSON-then-swap defect (Arman, 2026-08-21) cannot happen here.
Generated schemas pin `__kind` as `const` and declare it first; Python dicts preserve
insertion order and `json.dumps` honours it, so declaration order *is* the wire guarantee
(pinned by `aidream/services/content_ir_directives/tests/test_schema_gen.py`).

**`items` stays** because batch semantics are load-bearing: the per-item ledger, the
per-item receipt, and partial-batch retry all key on it. Don't force one item shape across
classes, and don't wrap a singular thing in anything but the list — the uniformity is the
shell, not the item.

---

## 2. The slug grammar — a routing language

```
directive_v<version>_<class>_<noun>
```

**`directive_v` is a RESERVED prefix.** A hand-authored or user-created kind may never
start with it — enforced in `@kind`, in kind authoring, in the frontend shape creator, and
by `scripts/validate_kind_directive_registry.py` at a **zero baseline**. Under this rule
the namespace-collision class the pre-merge registry lived with dissolves structurally: the
kind `transcript` and the directive `directive_v1_reference_transcript` cannot be the same
string, so there is nothing left to grandfather and no exemption to grant. If you find
yourself wanting to add one, the grammar has been violated upstream — fix that.

**`<class>` comes from a CLOSED vocabulary of eight.** Closed is what makes the grammar
parseable even though nouns contain underscores: the class is always the first
`_`-delimited token after the prefix, so `directive_v1_reference_create_task` is
unambiguously `(reference, "create_task")` and never `(create, …)`. The mapping
`(class, noun) → slug` is injective for the same reason.

| class | capability | what it is |
|---|---|---|
| `reference` | `pure` | a pointer resolved/fetched on read; stores ids, never data (§5) |
| `view` | `pure` | an open-this affordance; a read, resolved by the client |
| `validation` | `pure` | names a check; returns a verdict, mutates nothing (§8) |
| `secret` | `sensitive` | a vault-key pointer resolved only for the model; redacted on store (§9) |
| `create` | `side_effect` | write one row (and its FK write-tree) as the user (§6) |
| `update` | `side_effect` | write by id, as the user (§6) |
| `delete` | `side_effect` | soft delete where the table supports it (§6) |
| `action` | `side_effect` | a named, registered procedure — a Kind Action (§7) |

**`<noun>`** is an enrolled `platform.entity_types` token (`task`, `note`, `picklist_item`,
…) or a declared name. It is lowercase `[a-z0-9_]`, starting with a letter. Kind Actions
use their action name (`directive_v1_action_plan_tree`); validators use the check name
(`directive_v1_validation_regex`); secrets, the secret source
(`directive_v1_secret_user_secret`).

**CAPABILITY IS DERIVED FROM THE CLASS, never stored twice** (`CAPABILITY_BY_CLASS`). A
shape's capability is a *fact about its class*; a second copy is a second thing to drift.
Generic consumers and security audits read the class, so "is this a side effect?" never
requires parsing every noun.

**Versioning.** `v1` in the slug replaces the retired `matrx_version` field (which nothing
ever compared). Bump only on a breaking change to the shell-or-item contract of that shape.

```python
build_directive_slug("create", "task")            # "directive_v1_create_task"
parse_directive_slug("directive_v1_action_plan_tree")
#   DirectiveSlug(version=1, directive_class="action", noun="plan_tree", capability="side_effect")
is_reserved_directive_slug("directive_v1_nope")   # True — reserved, even though malformed
parse_directive_slug("directive_v1_nope")         # None — and callers treat that as an ERROR
```

`is_reserved_directive_slug` is deliberately broader than `parse_directive_slug`: a
*malformed* `directive_v…` slug is still reserved, so authoring gates reject it instead of
letting a near-miss through as an ordinary kind.

---

## 3. Detection & routing — one path, client and server

```
is_kind_directive(obj) = obj["__kind"] starts with "directive_v"
decode(obj)            → DecodedDirective{ slug, spec, items: [typed] }
route                  → the registered shape for that slug
```

ONE detector, ONE decoder, mirrored in TypeScript and Python. A new capability is a new
**shape** (a slug + an item model + a handler) — never a new top-level wire shape.

The frontend resolves a directive through the ordinary kind route with a **prefix tier**:
`(exact kind, platform, role)` → db override → compiled → **prefix rule** → generic. The
prefix rules point at the components that already exist —
`directive_v1_reference_*` → the reference chip, `directive_v1_{create,update,delete}_*` →
the directive card + Apply button, `directive_v1_action_*` → the action renderers. This is
the platform-wide parent→child component fallback pattern: every enrolled noun instantly
has a view, and a custom view overrides it.

---

## 4. THE POSITION LAW — one function, two predicates

The same shell means different things depending on **where it sits**. Before the merge this
law was written in FOUR places over THREE different kind sets (the output dispatcher's
`_EXECUTING_KINDS`, the reference substituter's `IN_CONTENT_KINDS`, the confirm endpoint's
tuple, the grooming gate's tuple) — three chances to disagree. Now there are exactly two
predicates in `matrx_graph.content_ir.directives`, and every caller asks one of them:

- **`executes_at_output_root(cls)`** — only a `side_effect` class (`create` / `update` /
  `delete` / `action`) may take effect at an agent's structured-output root. A reference or
  a secret sitting there is inert data.
- **`resolves_in_content(cls)`** — only `reference` and `secret` resolve to a live value
  inside content (prose, a substituted prompt, a ` ```matrx ` fence). **A side effect found
  in content is logged and skipped, never executed** — it renders as a *button*, and only a
  human click runs it.

`IN_CONTENT_CLASSES` is `{reference, secret}` — exactly the pre-merge in-content set.
`view` is pure and could plausibly be read as in-content, but nothing registers a `view`
shape today, and widening a position gate no caller needs is the "little bit of breathing
room" the campaign's Strictness Law forbids. A `view` shape that ever earns in-content
resolution adds itself there deliberately, with a consumer.

**The third position** — current-turn model-authored text — is the orchestrator's
`turn_directive_handler` seam. It hands EACH turn's model output (never history, user, or
tool content) to the host, which executes only explicitly turn-scoped shapes (today:
`directive_v1_action_context_groom`). The position is enforced by the INVOKER: matrx-ai
passes only that turn's assistant text, and the host guards the class. A turn-scoped
shape's blast radius must be reversible and confined to the requester's own conversation.

---

## 5. The `reference` class — pointers, and the ` ```matrx ` fence

A pointer to anything we hold internally — a picklist, a table cell, a note, a task, a
file, a KG entity — is a **reference**, not a copy and not bespoke text. ONE vocabulary,
shared by chat content, agent output, and workflow edges.

**Pure identity.** An item is the ids that name the thing plus optional **display hints**
(`label`, `table_name`, `column_display_name`, `description`, …). **Nothing else.** It
stores ids, never the value — the value is re-fetched live on every read, so it is never
stale. Resolving twice is free; it never mutates; it is safe to resolve inside untrusted
content.

```matrx
{ "__kind": "directive_v1_reference_table_cell",
  "items": [ { "table_id": "fafdf7da-…", "row_id": "4127fbc8-…",
               "column_name": "key_aspects", "table_name": "CA WC Defense Terms" } ] }
```

Many items is the norm, not the exception:

```matrx
{ "__kind": "directive_v1_reference_picklist_item",
  "items": [ { "list_id": "a729…", "item_id": "0c36…", "label": "Illustrated Recipe" },
             { "list_id": "a652…", "item_id": "11ff…", "label": "Cooking Items" } ] }
```

### The taxonomy

Each noun is one scope of one resource, with a registered Pydantic item model (required
ids + optional hints). **140 reference shapes are registered today** — the live list is the
generated manifest (§11), never a hand-kept table here.

| noun | identity ids | scope |
|---|---|---|
| `picklist` | `list_id` | whole list |
| `picklist_group` | `list_id`, `group_name` | one group |
| `picklist_item` | `list_id`, `item_id` | one item |
| `table` | `table_id` | whole table |
| `table_column` | `table_id`, `column_name` | one column |
| `table_row` | `table_id`, `row_id` | one row |
| `table_cell` | `table_id`, `row_id`, `column_name` | one cell |
| `table_schema` | `table_id` | column defs only — **never rows** |
| `transcript_segment` | `transcript_id`, `segment_index` | one segment (0-based) |
| `session_transcript` | `session_id`, `transcript_id?` | a studio session ↔ its transcript |
| `workbook_sheet` | `workbook_id`, `sheet_id` | one sheet of the latest snapshot |
| `document_page` | `document_id`, `page_index` | one (1-based) page |
| `file_page` | `file_id`, `page_number` | one (1-based) PDF page in `cld_files` |
| `conversation_value` | `key`, `conversation_id?`, `field?` | one stored conversation value |
| `context_value` | `scope_id`, `context_item_id` | the filled `(scope × item)` cell |

Positional indices (`segment_index` / `page_index` / `page_number`) are **strings on the
wire**, for parity with the other numeric reference ids.

**Record-shaped nouns** (`note`, `task`, `project`, `agent`, `agent_app`, `organization`,
`scope`, `scope_type`, `context_item`, `conversation`, `kg_entity`, …) are one registry
line each, loop-registered as `RecordRef` and pointed at by `{ id }`. A resource whose
model lives outside aidream's `db.models` sets the entry's `module` field — `kg_entity`
(matrx-rag's `rag.kg_entities`) is the cross-package case, and RLS still gates it because
the model rides the host pool's `acting_as_user()` connection.

### Two shapes only

1. **The full shell** — use anywhere it is serialized, persisted, embedded in content, or
   crosses a process/network boundary. That is almost always.
2. **The raw typed item** — the bare Pydantic item model, **in-process only**, on a
   contracted channel where the type comes from the function signature.

There is no third shape. `items` without `__kind` is forbidden: undetectable *and*
under-typed.

### The fence — the only in-content encoding

In prose a reference is a self-contained ` ```matrx ` fenced block on its own lines.

````text
Create an image in this style:

```matrx
{ "__kind": "directive_v1_reference_picklist_item",
  "items": [ { "list_id": "a729…", "item_id": "0c36…", "label": "Illustrated Recipe" } ] }
```
````

- The opening fence is exactly ` ```matrx ` (language `matrx`, not `json`). Detection
  reuses the render-block splitter (`SPECIAL_CODE_LANGUAGES` + the Python mirror in
  `matrx_ai.processing.blocks.block_detector`).
- The gate is the reserved `__kind` namespace. Bad JSON or an unknown slug renders as a
  muted card — **fail-safe, never drop**.
- **Persist the fence verbatim.** Never store a resolved value in its place.
- Never show raw fence JSON in production UI.

### Where `purpose` / `slot` went

A pure reference carries no intent. *How* it is consumed is decided by **where it sits**:
the fence's position is the slot; a `variables: { style: <shell> }` map key is the slot; a
workflow edge's consuming node decides. The orchestrator resolves every item it is handed.
Do **not** re-add `purpose`/`slot` to the item.

### One orchestrator, source-grouped resolvers

There is exactly one `ReferenceOrchestrator`. Anyone holding a `reference`-class directive
hands it over; it validates the shell and dispatches each item by noun to a registered
resolver. Source logic is grouped in the resolver, which is the cohesion a source-named
class would have wrongly put in the class axis:

- `UdtTableResolver` → `table` / `table_column` / `table_row` / `table_cell` / `table_schema`
- `UdtPicklistResolver` → `picklist` / `picklist_group` / `picklist_item`
- `special.py` → `file`/`media`, `context_item_value`/`context_value`, `agent_variable`
- `compound.py` → `transcript_segment`, `session_transcript`, `workbook_sheet`, `document_page`, `file_page`
- `record.py` → every `RecordRef` noun

**Auth is the resolver's job and is non-negotiable.** A reference resolves only against
data the requesting `user_id` may read. A forged id resolves to the display label, never
another user's value. No `user_id` → no fetch.

### Where references are the data bus

- **Provider send.** For each `matrx` reference fence, the orchestrator resolves each item
  and the value is swapped **only into the wire clone** sent to the model — never
  persisted, re-resolved from the live DB every send (`references/substitute.py`).
- **Workflow edges.** `matrx-graph` edges carry reference shells; a downstream node
  resolves on read via the `matrx_graph.references` seam
  (`configure_reference_resolver` / `resolve_references`). Sender and receiver never have
  to be looking for the same thing first — the shell is self-describing. Opt-in: a node
  that operates on the resource structurally keeps the typed ids.
- **Bookmarks.** `input_table` / `input_list` blocks keep their attachment wrapper, but
  their `bookmarks` **are reference items** using these exact models — not a parallel
  shape. `full_table`→`table`, `list_item`→`picklist_item`, and so on.

---

## 6. `create` / `update` / `delete` — the entity directives

The simple plane: **the payload is the table's own shape**, so anyone can guess it without
looking it up. Every `agent_writable` noun in `platform.entity_types` loop-registers its
`create` / `update` / `delete` shapes automatically — there is no per-noun code.

```json
{ "__kind": "directive_v1_create_task",
  "items": [ { "title": "Draft the brief", "project_id": "…", "priority": "high" } ] }
```

1. **Shape = the table.** Fields are the noun's writable columns. Identity / ownership /
   audit columns (`id`, `user_id`, `organization_id`, `created_*`, `updated_*`,
   `deleted_*`, embeddings, …) are never writable — the server stamps them.
2. **Required means required.** A `create` must include every column the DB requires with
   no default, or it fails **loudly** — never a silent partial row.
3. **`update` / `delete` carry the `id`.** `create` does not; the server mints it.
4. **`delete` is soft** where the table supports it (`deleted_at` / `is_deleted`); a hard
   delete is never the default. Column existence is the authority.
5. **Batch is free — via `items`, never a plural noun.** Three `directive_v1_create_task`
   items = three tasks. There is no `create_tasks`.
6. **Nested children along a known foreign key are canonical and atomic.** A
   `directive_v1_create_project` may nest its `tasks`, and each task its `subtasks`,
   because `tasks.project_id` / `subtasks.parent_task_id` are real FKs. The parent is
   created, its new `id` is stamped onto the children, and **the whole tree is one item =
   one atomic unit** (all succeed or all roll back).
7. **Acts as the user.** Every write runs under the user's RLS (`acting_as_user`), so a
   user can only ever write what they are allowed to.

**Where the FK rule stops:** this class covers a **single row** and a **write-tree down
known foreign keys**. The moment an operation is not "write this row (and its FK
children)," it is a Kind Action (§7).

**No permissive item schemas.** Generated entity item models derive real column types from
the live model. Where a column's type genuinely cannot be derived, the shape is REFUSED at
registration with the column named — never widened to `Any` or `additionalProperties:
true`. The DB is the source, so a generated schema can never drift, and it stops accepting
keys nothing will read.

---

## 7. `action` — Kind Actions

The home for anything that is **not** a single-row / FK-write-tree write: multi-resource
logic, computed steps, external side effects, a real procedure. Whatever you want — write
a Kind Action, register it, and it runs everywhere.

**Register once and it works everywhere.** The dispatcher executes it under the same
apply-policy cascade, idempotency ledger, and per-item receipts as any canonical write;
the catalog, schema-gen, and the generated manifest pick it up automatically.

```python
register_action(
    "plan_tree",
    input_model=PlanTreeInput,   # typed args — the shape is real, not guessed
    handler=apply_plan_tree,     # async, standard directive signature
    doc="Propose or revise a site's content plan as one nested tree.",
)
```

Registered today: `context_groom`, `create_agent`, `create_project_with_tasks`,
`create_task`, `db_create`, `db_update`, `plan_node_patch`, `plan_tree`.

> **Why one slug per shape matters.** Before 2026-08-23 the same procedure was registered
> TWICE — once as `(output_directive, plan_tree)` and once as `(function, plan_tree)` — two
> encodings of one operation, kept in step only by the ledger key deliberately excluding
> the family axis. Under one slug per shape that duplication is not "resolved", it is
> unrepresentable.

---

## 8. `validation` — pure checks

A self-contained, pure pass/fail check: the rule *and* the value live in the item. The same
shape runs server-side (a workflow gate) and client-side (a dynamic form). It runs at an
output root, never in prose.

```json
{ "__kind": "directive_v1_validation_regex",
  "items": [ { "value": "a@b.com", "pattern": "^[^@]+@[^@]+\\.[^@]+$" } ] }
```

Built in: `regex` (`{value, pattern, flags?, message?}`), `range` (`{value, min?, max?}`),
`length` (`{value, min_length?, max_length?}`), `enum` (`{value, allowed}`).

---

## 9. `secret` — a value the model sees and nothing stores

The `secret` class makes "**must never persist resolved**" one greppable, enforceable rule.
The item is a *pointer* — the vault key name. The resolver injects the real value only into
the model-bound payload; the redactor strips it from everything stored or shown.

```matrx
{ "__kind": "directive_v1_secret_user_secret", "items": [ { "key": "OPENAI_API_KEY" } ] }
```

The fence stores only the KEY name. Never write an actual secret value anywhere.

---

## 10. The execution contract

Every `side_effect` class obeys this, whichever noun it names.

- **Position decides where** (§4). At the output root a directive can take effect ("has the
  last word"). The same directive sitting in content renders as a **button**, never
  auto-runs.
- **The apply-policy cascade decides whether** — agent → surface → user, **user wins** (the
  same precedence every per-call setting uses). Three values: **`auto`** (apply now),
  **`ask`** (human in the loop — stream `directive_apply.proposed`, apply only on user
  confirm), **`off`** (inert + a loud `directive_apply.blocked`). **System default `ask`** —
  never a silent auto-apply, never a silent drop; **`ask` degrades to `off`** on a
  non-interactive surface, never to `auto`. This is the line between "the agent was
  *programmed* to apply" and "a model *said* it, so it happened". Layers:
  `matrx_actions` (agent) · `client.apply_policy` (surface) · `user.apply_policy` (user).
  `POST /directives/execute` and `POST /directives/confirm` are *user*-proposed and bypass
  the gate by design — a human clicked.
- **Idempotency — one ledger, one key, PER ITEM, and NEVER on the wire** (so the model
  cannot fumble it). The key is
  `act:sha256(conversation_id \x00 type \x00 canonical(item))`, consulted against the one
  durable ledger `platform.matrx_action_ledger` (`key` primary key, owner-read RLS,
  server-only writes). A second apply of the same key is a no-op that replays the original
  receipt. Per-ITEM, not per-batch, so a partially-failed batch stays retryable — failed
  items are never ledgered. An explicit `force` opt-out mints always-unique keys for the
  rare "I really do want two identical ones" case.

  🚨 **The `type` fed into that hash is the LEGACY string, DERIVED from the slug** by
  `content_ir_directives.naming.ledger_type_for` — `directive_v1_create_task` →
  `"create:task"`, `directive_v1_action_plan_tree` → `"plan_tree"`,
  `directive_v1_reference_note` → `"note"`. The family axis is deliberately EXCLUDED from
  the key. If a post-merge emission fed a different string in, every action in history
  would stop deduping and re-apply: duplicate rows, duplicate writes, duplicate money. The
  merge does **not** get to choose a prettier ledger input. Proven byte-identical against
  real pre-merge ledger rows by `tests/test_ledger_key_parity.py`. The ledger ROW stores
  the derived class and this same legacy type, so `(kind, type)` reconstructs the slug
  exactly (`slug_for_ledger_row`) — nothing is written that cannot be read back into the
  new grammar.
- **Receipts.** Every executed item streams a typed receipt
  (`directive_apply.started` / `.item` / `.failed` / `.completed`), so the client always
  knows what landed. A bad item never rolls back good ones; each item's own write stays
  atomic.
- **Warn, never fatal.** A failed apply warns with a fault tag; the delivered AI response
  always stands.

---

## 11. The catalog — COMPUTED, never authored

There is no hand-written list of nouns anywhere, so it can never silently be wrong.
`aidream/services/directive_catalog/catalog.py::build_catalog()` derives every noun and
cell live from `platform.entity_types` (`agent_writable`, `reference_pickable`,
`is_component`, category, label, `title_column`) + the shape registry + the generated ORM
models (soft-delete columns), and:

1. **serves** it at **`GET /directives/catalog`** (unauthed) — the live payload every
   client reads: nouns × classes, per-noun identity fields + write schemas, the Kind
   Actions section, the alias map;
2. **snapshots** it to **`docs/protocol/kind_directives_catalog.generated.json`**
   (`scripts/generate_directive_catalog_manifest.py`, run in `release.sh`), mirrored
   byte-identical to matrx-frontend for offline/build-time consumers.

Adding a noun = one `platform.entity_types` row/flag. Flipping `agent_writable` on is the
security-review act that turns on `create`/`update`(/`delete` where a soft-delete column
exists). `reference_pickable` turns on `reference`/`view`. `is_component` marks derived
shapes that are never independently writable (a `table_cell` has no independent
create/delete — it is the crossroads of a row and a column). **Read ⊇ write, always** —
being referenceable never implies writable.

**Directive shapes do NOT mint per-pair `kind_definition` rows.** The catalog stays the
noun/shape authority; the kind registry carries the GRAMMAR (the reserved prefix + the
`kind_surface` row: `fence_lang: matrx`, with `json_root_key: __kind` owning the rest) and
resolution carries a prefix tier (§3). One registry row per CLASS may be seeded for
discoverability — never one per pair.

---

## 12. Registration & enforcement

**Adding a shape is one call, and it is the only way in.**

1. A Pydantic **item model** (the shape of one `items[]` entry).
2. A **handler** (class-specific: a side-effect class registers a per-item async processor;
   `reference` registers a per-item async resolver).
3. One `register_shape(ShapeSpec(directive_class=…, noun=…, item_model=…, handler=…,
   doc=…))` in the consumer's register module.

There is deliberately **no way to pass a raw slug string** — the slug is built from the
class and the noun, so an unparseable slug can never be registered, which is what lets
every downstream consumer treat `spec.parsed` as total. `register_shapes()` is atomic: if
any spec raises, every shape that call added is rolled back before the error re-raises, so
a partial startup failure can never leave a half-populated registry.

Then regenerate:

```bash
uv run python scripts/generate_kind_directive_registry.py     # the shape manifest
uv run python scripts/generate_directive_catalog_manifest.py  # the live catalog snapshot
```

Schema, detection, decode, routing, and the catalog are all generic — nothing else to edit.

### The guard — `scripts/validate_kind_directive_registry.py`

**STRICT IS THE ONLY MODE.** There is no `--strict` flag and no non-blocking default: the
EXIT CODE is the verdict. `0` = every check RAN and passed · `1` = problems · **`2` =
UNMEASURED, which is a FAILURE** — "we did not look" must never be reportable as "we looked
and it was fine". It checks:

1. a registered shape missing an item model / handler / doc;
2. the committed manifest being STALE vs. the live registry;
3. a **parallel encoding** in code — the retired 4-key shell and older eradicated shapes
   (`__matrx_apply`, `picklist_ref`, `<<<MATRX_START>>>`, private-use delimiter tokens),
   anywhere outside the ONE read-only decode shim (§13). The allowlist has **one** entry;
4. the **reserved prefix** — no `content_ir.kind_definition` row may claim a `directive_v`
   slug the registry does not own, and no registry slug may fall outside the namespace.
   **Zero exemptions, zero grandfathering, zero baseline;**
5. the **protocol mirror set** matching the co-located frontend checkout.

### The mirror pact

These files are contractually **byte-identical** in both repos, aidream canonical:

- `docs/protocol/KIND_DIRECTIVES.md` (this file)
- `docs/protocol/kind_directive_registry.generated.json`
- `docs/protocol/kind_directives_catalog.generated.json`

aidream's half is check 5 above; the frontend's half is `pnpm check:protocol-sync`
(`--fix` copies aidream → frontend). Drift screams no matter which repo ships first. A
missing frontend checkout is UNMEASURED (exit 2), never a WARN.

---

## 13. The legacy shim — read-only, counted, and expiring

Stored conversations hold ` ```matrx ` fences written before 2026-08-23 in the retired
4-key shell (`{matrx_version, kind, type, items}`). Those must keep decoding forever.
`aidream/services/content_ir_directives/legacy_shell.py` is how — and **it is the entire
legacy story of this system**:

1. **READ-ONLY.** It translates an old shell into the new one. It never emits, never
   writes, and never returns the old shape to anyone.
2. **UNREACHABLE FROM ANY EMISSION PATH.** Its only importer in the whole repo is
   `decode.py` — proven by a test that walks every Python file in the repo.
3. **IT NEVER REGISTERS A SHAPE.** No dual registration, no compatibility alias, and no
   "try new, fall back to old" branch anywhere. **A fallback branch is a defect the moment
   it is written.**
4. **COUNTED.** Every translation increments `legacy_shell_uses()`, published to the
   coverage board, so the number is watched and stored content can be seen aging out.

It is a *translation*, not a second decoder: it produces the new shell and then stops.
Everything downstream — registry lookup, item validation, the position law, the ledger key
— runs the single new path, so a 2024 fence and a fence written this second are
byte-identical by the time anything makes a decision about them.

The detection-side twin is `block_detector._is_legacy_matrx_shell`, marked as the legacy
read path beside the current `_is_kind_directive`. **New emitters emit the new shell.** If
you are reading this because you want to import the shim somewhere else: the answer is no.

---

## 14. Invariants

- Detect **only** by the reserved `__kind` namespace. `__kind` is the FIRST key.
- **Exactly two top-level keys**; all data lives inside `items`, which is always a list.
- Every slug has a registered Pydantic item model + handler + doc — that is the only way to
  be in the system. An unregistered shape, or a parallel encoding, is a build failure.
- The class vocabulary is CLOSED (eight). Capability is DERIVED from the class, never
  stored twice.
- `directive_v` is reserved; a hand-authored kind may never claim it. Zero exemptions.
- A `reference` stores ids + optional display hints, never live data.
- A `secret` must pass the redactor before any persist or display.
- Idempotency is server-derived, per item, and the ledger `type` is derived from the slug —
  never invented, never guessed.
- **Position decides capability:** side effects execute only at an output root; in content,
  only `reference` and `secret` resolve.
- A failed apply warns; the delivered response always stands.
- No new escape hatch, no baseline that grows, no dual registration, no fallback branch.
  Strict-or-not resolves to strict (campaign Strictness Law).

---

## Change Log

- **2026-08-25 — Created by merging `MATRX_ENVELOPE.md`, `MATRX_DIRECTIVES.md`, and
  `MATRX_REFERENCES.md`, all three deleted.** This document teaches the CURRENT system
  only: the two-key `__kind`-first shell, the closed 8-class grammar with capability
  derived from the class, ONE position law, the read-only legacy shim, and the
  reference / entity / action / validation / secret families as sections of one document.
  The mirror set was repointed to the three current files, and the catalog manifest was
  renamed to `kind_directives_catalog.generated.json` (the generator had still been
  writing the old name, so the guard had been comparing a snapshot nothing refreshed).
- 2026-08-23 — **The merge.** Arman ruled Kind Directives and Content IR one system. The
  4-key shell (`matrx_version`/`kind`/`type`/`items`) retired in favour of the two-key
  `__kind` shell; the `(kind, type)` registry re-keyed by slug; the position law
  consolidated from four sites to two predicates; the collision guard's `RecordRef`
  exemption and `{transcript, transcript_segment}` grandfather set deleted; the read-only
  legacy shim introduced as the one and only legacy surface.
- 2026-07-26 — `platform.entity_types` became THE noun registry; every writable noun's
  write shapes loop-register automatically; soft delete wired; ONE per-item content-key
  ledger (`platform.matrx_action_ledger`); the catalog made COMPUTED (the authored grid,
  the drift gate, and the `mtx_envelope_catalog` DB table all deleted).
- 2026-06-24 — The apply-policy cascade (agent → surface → user; `auto`/`ask`/`off`,
  default `ask`, `ask`→`off` when non-interactive) and the author gate: a model-emitted
  side effect at the output root auto-applies only when the agent opts in.
- 2026-06-20 — References purified to identity + display hints; `purpose`/`slot`
  externalized to the use-site; one `ReferenceOrchestrator` with source-grouped resolvers;
  bookmarks converged onto reference items; `matrx-graph` edges carry references.
- 2026-06-17 — Items-everywhere made canonical; the generic core, the registry, typed
  decode, auto schema-gen, the ` ```matrx ` in-content fence, the position invariant, and
  the generated-manifest enforcement system.
