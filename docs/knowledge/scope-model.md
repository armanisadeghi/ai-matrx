# Scopes — What They Are

> Full detail for the scope model. Summarized in [`02_KNOWLEDGE_ARCHITECTURE.md`](02_KNOWLEDGE_ARCHITECTURE.md) §4 and [`03_KNOWLEDGE_MODULE.md`](03_KNOWLEDGE_MODULE.md) §5. Companion: the entity catalogue → [`scopeable_entities.md`](scopeable_entities.md).

**The problem:** We can't hardcode dimensions like Salesforce does ("Client", "Order", "Product"). Not every org has those. A law firm has clients, cases, and practice areas; a marketing team has clients and departments; a parent has kids. So the user defines their own dimensions.

**The model:** A user defines a **scope type** (a dimension), creates **scopes** (instances of it), defines **items** (fields) on the type, and fills in **values** per scope.

## The four-level chain

```
scope type   →   scope        →   item        →   value
(dimension)      (instance)       (field)         (the data)
```

Concrete (a parent's personal org):

| Level | Example |
|---|---|
| Scope type | `Kids` |
| Scopes | `Ava`, `Sara` |
| Items | `name`, `age`, `grade_level` |
| Values (for Ava) | name=Ava Sadeghi, age=15, grade_level=10 |

Key point: **items are defined on the type, not the scope.** Defining `age` on `Kids` means every kid scope has an `age` cell. Items are columns; scopes are rows; values are cells.

## Two ways something relates to a scope

Don't confuse these — they attach at different points and mean different things:

1. **It's an attribute of the scope** → an item/value (above). Ava's `age` *is* Ava. Items are defined on the **type**; values are set per **scope**.
2. **It's an entity tagged to the scope** → an M2M assignment. A note, message, task, agent, etc. The note isn't part of Ava; it's *about* Ava.

```
(entity_type, entity_id)  ←→  scope
        e.g. ('note', <note_id>)  ↔  Ava
```

An entity is tagged to a **scope**, never to a scope type. One entity can carry many scopes; one scope tags many entities.

## Treat scope values as ground truth

A scope value is a curated, authoritative fact about the scope — not a guess to second-guess. A value is free-form: a word, a paragraph, a long document, or JSON. Each value records a `source_type` (`user_input` / `ai_generated` / `imported` / `system`), which is how to tell a human-confirmed fact from an unreviewed AI extraction.

## Where this lives

- A **user** belongs to **orgs**.
- An **org** owns its **scope types** (dimensions are per-org).
- **Projects** and **tasks** are a *separate* system — not scopes. They can optionally be associated with scopes (via the same M2M assignment), but they are not part of the scope hierarchy.

## Tables (look up the DB for columns)

| Table | Holds |
|---|---|
| `ctx_scope_types` | dimensions (per org) |
| `ctx_scopes` | instances of a dimension |
| `ctx_context_items` | fields defined on a type |
| `ctx_context_item_values` | values per scope × item — *versioned*: many rows per cell, the live one is `is_current = true` |
| `ctx_scope_assignments` | M2M: scope ↔ any entity |