# Matrx Knowledge System Concept

## The purpose in one paragraph
Ingest any content → understand it (entities + themes) → **tag it to the org's own scopes** (Client Ava, Case 123, Patient X) → so users and agents can search **semantically** ("back pain") *and* **structurally** ("everything for Client Ava, Case 123"), trust results **by provenance**, and **retain raw data by default** (never auto-dropped; always user-deletable), re-processable when instructions change. Scopes are user-defined per tenant (no hardcoded Salesforce dimensions).

## The four planes (how it all connects)
- **Plane 1 — Content / Entities (the nouns).** Every scopeable thing (notes, files, agent chats, research, scrapes, code, tasks…) catalogued in `public.shareable_resource_registry` (~36 types). Each plays a role: **Source / Destination / Utility / Container** (`scopeable_entities.md`).
- **Plane 2 — The Pipeline (the verbs).** A **7-phase flow** turns raw content → enriched knowledge; the 5-stage NER pass is Phase 6 (below).
- **Plane 3 — Scopes (the structure / the target).** Per-org dimensions: `scope type → scope → item → value` (attributes) **plus** `ctx_scope_assignments` (M2M: tag any entity → a scope). Pipeline Stage 4 feeds this. Scope **values are ground truth**, never overwritten by AI.
- **Plane 4 — Provenance / Authority (the trust).** Rides alongside; annotates how much we trust each thing *now*. Scoring is fully specified in [`04_matrx_quality_model.md`](04_matrx_quality_model.md); lineage/roles in `knowledge_provenance_model.md`. Designed, rollout pending.
- **Consumption.** Hybrid retrieval (`search.py`) + the KG/cluster **visualization** (`kg_graph.py`).
- **The Agent Fabric (cross-cutting — the differentiator).** A custom agent, built in minutes, can plug in at any phase or edge and manifest as a chatbot, button, form, widget, event automation, or scheduled job (and reach external platforms via MCP). It operates *on* the planes; it is not itself a plane.

---

## The doc map — start here, reach everything

This overview is the entry point. From here:

| Go to | For |
|---|---|
| **What's left to build** → [`00_MASTER_TASKLIST.md`](00_MASTER_TASKLIST.md) | The prioritized tracker — every task (big & small) on the road to making this real |
| Architecture detail → [`02_KNOWLEDGE_ARCHITECTURE.md`](02_KNOWLEDGE_ARCHITECTURE.md) | Master architecture, Agent Fabric, STOP rules |
| Phase 6 (NER) detail → [`03_KNOWLEDGE_MODULE.md`](03_KNOWLEDGE_MODULE.md) | The 5-stage NER pipeline |
| Scopes → [`scope-model.md`](scope-model.md) · [`scopeable_entities.md`](scopeable_entities.md) | The scope chain + what can be tagged |
| Auto-scoping → [`scope-association-pipeline.md`](scope-association-pipeline.md) | How new content is matched to scopes + scope items (the agent, suggestions, match confidence) |
| **Agent access → knowledge** → [`agent-knowledge-access.md`](agent-knowledge-access.md) | How an agent reaches RAG/NER — bounded agentic search (mirrors the tool hierarchy), the hit contract + condensed entity map, hint injection |
| **Quality / scoring** → [`04_matrx_quality_model.md`](04_matrx_quality_model.md) | **Single source of truth for all scoring** — Quality Vector, log-odds propagation, utility profiles, composite, seeding |
| Trust / lineage → [`knowledge_provenance_model.md`](knowledge_provenance_model.md) | Provenance, content roles, lineage (scoring math lives in `04`) |
| **What the code actually does today** → [`../rag_and_ner/`](../rag_and_ner/README.md) | Reality docs + the truth-checked backlog (`00_CLEANUP.md` §2.0 bucket index) |

> **Vision lives here** (`docs/knowledge/`). **Code truth + backlog** live in [`docs/rag_and_ner/`](../rag_and_ner/README.md). The tasklist is the bridge.

---

# The Pipeline — 7 phases (Phase 6 zoomed in)

Raw content → enriched knowledge in seven phases: **1 Acquire · 2 Convert · 3 Clean · 4 Enrich & Branch · 5 Admit to Hub · 6 Structure & Associate · 7 Use & Reprocess.** Phases 1–5 turn messy sources into admissible text, and Phase 7 is consumption + the reprocess loop. **Phase 6 is the 5-stage NER / entity-linking pass:**

1. **Extract** entities and concepts from documents using a model (GLiNER2 or Haiku).
2. **Resolve** duplicates and synonyms with a generic AI pass.
3. **Score importance** — mark distinctive vs. noisy entities, again with generic AI.
4. **Link to scopes** — a **Helpful Agent** matches the content against the user's **known** scopes and scope items and proposes links the user confirms. Two parts: **(A)** assign the source to a known scope ("this is *about* Ava"); **(B)** once a scope is known, fill that scope-type's blank/changed items from the content. Always **suggestions**, abstaining-is-good, scored by a **match confidence** that is *not* a trust/quality score. Concepts skip this and stay thematic. → full spec: [`scope-association-pipeline.md`](scope-association-pipeline.md).
5. **Store enriched chunks** — each RAG chunk carries the resolved entities, importance scores, scope links, and provenance metadata alongside its embedding.

The output is a document system where you can:
- Search semantically ("back pain") *and* structurally ("for Client Ava, Case 123").
- Trust quality by provenance ("this came from an official source").
- Keep all raw data forever, just tagged appropriately so you can re-process if instructions change.
- Involve humans at the end to correct scope links and flag edge cases.

The scope system is flexible: scope types and items are defined per tenant, stored relationally, so you're not locked into schema.

---

# Scopes — What They Are

> Full detail: [`scope-model.md`](scope-model.md)

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

## Scopeable entities (what can be tagged to a scope)

> Full table — canonical names, role (S/D/U/C), and modern vs. legacy tables: [`scopeable_entities.md`](scopeable_entities.md)

Any entity of these types can be tagged to a scope via `ctx_scope_assignments`:

Notes, Files, Tasks, Agents, Agent Apps, Agent Shortcuts, Skills, Conversations, Workflows, UDT Datasets, UDT Picklists, UDT Workbooks, Sandboxes, Flashcards, Quizzes, Canvas/Artifacts, Content Templates, Transcripts/Audio, Research, Scrapes, Code, Projects.

(Further candidates still under review are listed in the detail doc.)

---

# Provenance & Authority — the trust layer

> **Scoring is canonical in [`04_matrx_quality_model.md`](04_matrx_quality_model.md)** (the Quality Vector, log-odds propagation, utility effect types, composite profiles, seeding). Lineage / content roles / `source_type` mapping: [`knowledge_provenance_model.md`](knowledge_provenance_model.md). Nothing else re-explains scoring.

Rides alongside scopes and the pipeline — it annotates trust, replaces nothing.
**Scopes** = what is it *about*? · **Pipeline** = where in the *flow*? · **Provenance** = how much do we *trust* it now?

**Two axes:**
- **Provenance (lineage)** — where it came from and what it passed through.
- **Authority (trust *now*)** — earned, not inherited; validation raises it, lossy compression lowers it.

**Content role** — how an entity participates: **Source** (knowledge enters — files, scrapes, transcripts) · **Destination** (knowledge produced — flashcards, research synthesis, agent chats) · **Utility** (operates, no truth of its own — agents, skills, workflows) · **Container** (operational — holds/groups other entities — tasks, projects, batches). Many are dual; role is per-instance where needed.

**Authority tiers** — a coarse lens generalizing the scope-value `source_type`: **primary** (assumed factual) · **derived** (trusted process) · **unvalidated** (raw, unreviewed). The canonical scoring underneath is the `04` Quality Vector.

**How authority changes (intuition):** `input_authority × utility_transformation = output_authority` — a weak source through a strong validation tool can outrank a strong source through a lossy one. **The real computation** (log-odds propagation, the `preserve` / `additive_impact` / `targeted_transform` effect types) is defined in [`04_matrx_quality_model.md`](04_matrx_quality_model.md).

**Through the 5 stages:** entities inherit their document's tier + confidence (1) → merges keep the highest authority (2) → provenance weights importance (3) → **scope linking is agent-driven and always *suggestion-first*** (4): Stage A proposes an *entity→scope assignment* (`scope_association_suggestions` → confirmed to `ctx_scope_assignments`); Stage B, only once a scope is known, proposes *item values* (→ confirmed to `ctx_context_item_values` via `set_context_value()`). Both are gated by a **match confidence** that is a *separate axis* from authority/trust — see [`scope-association-pipeline.md`](scope-association-pipeline.md) → each stored chunk carries entities, scope links, authority tier, confidence, content role, and lineage beside its embedding (5).

Retention is the **default** — never auto-dropped on "done reading"; raw stays tagged & re-processable. **The user is the ultimate boss and may delete anything**; deleting an anchor warns + tombstones (shell + lineage kept, bytes purged), never a system veto.

---

# Quality / trust — DEFINED in `04_matrx_quality_model.md`

**Status: DECIDED.** Quality scoring is now fully specified in [`04_matrx_quality_model.md`](04_matrx_quality_model.md) — the **single source of truth**. Every column, code path, and doc that touches scoring **refers to `04`**; nothing re-explains it elsewhere. What `04` settles:

- **Not one number.** Each artifact carries a **Quality Vector** (`source_quality`, `capture_quality`, `faithfulness`, `alignment`, `coverage`, `utility_value`) and a purpose-dependent **`composite_quality`**. Components stay separate so retrieval, ranking, agents, and UI can explain *why*.
- **Propagation is in log-odds space**, via three utility **effect types**: `preserve` (lossless), `additive_impact` (validation/degradation deltas), `targeted_transform` (derived outputs pulled toward the utility's own expected quality). A strong cleanup can lift weak input; a lossy summary can lower excellent input.
- **No quality laundering.** Derived artifacts do **not** automatically become trusted seed sources — seeding requires explicit `seed_policy` / validation / human approval (`can_be_seeded`).
- **Composite is purpose-dependent** (named composite profiles), not one universal formula.

**The three score types — never conflate them:**
1. **Quality** — the Quality Vector + composite above. The real scoring system. Canonical: `04`.
2. **Scope match confidence** — an agent's guess that content matches a *known* scope/item. A *separate axis*. See [`scope-association-pipeline.md`](scope-association-pipeline.md).
3. **NER extraction confidence** — a model's mechanical certainty it pulled an entity *correctly*. Says nothing about truth or quality; at most a capture-side gate.

**Still open: rollout, not design.** What remains is *implementation* (engine module, DB schema, default utility profiles, backfill) — see `04`'s TASKS section and [`00_MASTER_TASKLIST.md`](00_MASTER_TASKLIST.md), not a design question.