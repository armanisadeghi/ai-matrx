# 5-Stage NER, RAG and Entity-Linking Pipeline

1. **Extract** entities and concepts from documents using a model (GLiNER2 or Haiku).
2. **Resolve** duplicates and synonyms with a generic AI pass.
3. **Score importance** — mark distinctive vs. noisy entities, again with generic AI.
4. **Link to scopes** — use custom instructions and your structured data (scope types, scope items, scope instances) to map entities to the things that matter operationally (Client Ava, Case 123, etc.). Concepts skip this and stay thematic.
5. **Store enriched chunks** — each RAG chunk carries the resolved entities, importance scores, scope links, and provenance metadata alongside its embedding.

The output is a document system where you can:
- Search semantically ("back pain") *and* structurally ("for Client Ava, Case 123").
- Trust quality by provenance ("this came from an official source").
- Keep all raw data forever, just tagged appropriately so you can re-process if instructions change.
- Involve humans at the end to correct scope links and flag edge cases.

The scope system is flexible: scope types and items are defined per tenant, stored relationally, so you're not locked into schema.

---

# Scopes — What They Are

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

---

---
# Provenance & Authority — the trust layer

A layer that **rides alongside** scopes and the pipeline. It does not replace scope
links or values; it annotates them. It answers a question the other two systems don't:

- **Scopes** → what is this *about*? (Client Ava, Case 123)
- **Pipeline** → where did it sit in the *flow*?
- **Provenance** → how much do we *trust* it right now?

## Two axes
- **Provenance (lineage):** where a thing came from and what it passed through.
- **Authority (truth confidence *now*):** earned, not inherited. Processing can raise it
  (validation, cross-checking) or lower it (lossy compression).

## Content role — how an entity participates in knowledge flow
| Role | Meaning | Examples |
|---|---|---|
| **Source** | knowledge enters | files, scrapes, transcripts |
| **Destination** | knowledge produced / refined | flashcards, research synthesis, conversations |
| **Tool** | operates on knowledge, no truth of its own | agents, skills, workflows |

Many entities are dual (a note can be both; research is a destination that becomes a
secondary source). Role is per-instance where needed, not just per-type.

## The anti-sprouting rule
Only **Sources** and **promoted Destinations** may be ingested as documents in Stage 1.
A raw Destination (e.g. a flashcard) never silently becomes a seed — otherwise a single
bad output would propagate across the system.

## Authority tiers (generalize the value `source_type`)
Scope values already carry `source_type`. Same idea, generalized to documents, entities,
and chunks. `source_type` = how it was made; `authority_tier` = how much we trust it now;
`confidence_score` (0–1) = the downstream handle.

| Tier | Meaning | Typical `source_type` |
|---|---|---|
| **primary** | assumed factual | `user_input`, trusted `imported` |
| **derived** | produced by a trusted process | `system`, reviewed `ai_generated` |
| **unvalidated** | raw, unreviewed | scraped, raw `imported`, unreviewed `ai_generated` |

## How authority changes
```
input_authority  ×  tool_transformation  =  output_authority
```
validation ↑ · synthesis ≈/↑ · distillation ≈ · abstraction ↓

A weak source through a strong validation tool can outrank a strong source through a
lossy one. (Court transcript + attorney's rough notes → validation agent → notes now as
trustworthy as the transcript.)

## Riding through the 5 stages
1. **Extract** — each entity inherits its document's tier + confidence.
2. **Resolve** — a merge keeps the highest authority among the merged mentions.
3. **Score importance** — weight by provenance (official > raw for the same scope).
4. **Link to scopes** — AI links are *suggestions* (`scope_association_suggestions`),
   never overwrites of ground-truth scope values. Human confirmation is the promotion gate —
   accept writes into `ctx_context_item_values` via `set_context_value()`.
5. **Store** — each chunk carries resolved entities, importance, scope links,
   `authority_tier`, `confidence_score`, `content_role`, and lineage, beside its embedding.

## Two gates (the whole guarantee)
- **Ingestion gate (Stage 1):** only seedable content is extracted from.
- **Promotion gate (Stage 4 / review):** a Destination becomes an ingestible Source only
  by passing human approval or a trusted validation agent. Record `{gate, timestamp, approver}`.
  Never automatic.

## Storage
- **Documents:** `source_type`, `authority_tier`, `confidence_modifier`.
- **Entities / chunks:** inherited `authority_tier`, `confidence_score`, `content_role`,
  `derived_from` (lineage), `can_be_seeded`.
- **Queries** filter ("only primary sources for legal decisions") or rank by it.

Keep raw data forever, tagged — never deleted, just gated. If instructions change,
re-process from the originals.