# Matrx Knowledge System Concept

## The purpose in one paragraph
Ingest any content → understand it (entities + themes) → **tag it to the org's own scopes** (Client Ava, Case 123, Patient X) → so users and agents can search **semantically** ("back pain") *and* **structurally** ("everything for Client Ava, Case 123"), trust results **by provenance**, and keep raw data forever, re-processable when instructions change. Scopes are user-defined per tenant (no hardcoded Salesforce dimensions).

## The four planes (how it all connects)
- **Plane 1 — Content / Entities (the nouns).** Every scopeable thing (notes, files, agent chats, research, scrapes, code, tasks…) catalogued in `public.shareable_resource_registry` (~36 types). Each plays a role: **Source / Destination / Utility / Container** (`scopeable_entities.md`).
- **Plane 2 — The Pipeline (the verbs).** A **7-phase flow** turns raw content → enriched knowledge; the 5-stage NER pass is Phase 6 (below).
- **Plane 3 — Scopes (the structure / the target).** Per-org dimensions: `scope type → scope → item → value` (attributes) **plus** `ctx_scope_assignments` (M2M: tag any entity → a scope). Pipeline Stage 4 feeds this. Scope **values are ground truth**, never overwritten by AI.
- **Plane 4 — Provenance / Authority (the trust).** Rides alongside; annotates how much we trust each thing *now* (`knowledge_provenance_model.md`). Mostly CONCEPT today.
- **Consumption.** Hybrid retrieval (`search.py`) + the KG/cluster **visualization** (`kg_graph.py`).
- **The Agent Fabric (cross-cutting — the differentiator).** A custom agent, built in minutes, can plug in at any phase or edge and manifest as a chatbot, button, form, widget, event automation, or scheduled job (and reach external platforms via MCP). It operates *on* the planes; it is not itself a plane.

---

# The Pipeline — 7 phases (Phase 6 zoomed in)

Raw content → enriched knowledge in seven phases: **1 Acquire · 2 Convert · 3 Clean · 4 Enrich & Branch · 5 Admit to Hub · 6 Structure & Associate · 7 Use & Reprocess.** Phases 1–5 turn messy sources into admissible text, and Phase 7 is consumption + the reprocess loop. **Phase 6 is the 5-stage NER / entity-linking pass:**

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

> Full detail — tier↔`source_type` mapping, transformation types, entity-field list, storage: [`knowledge_provenance_model.md`](knowledge_provenance_model.md)

Rides alongside scopes and the pipeline — it annotates trust, replaces nothing.
**Scopes** = what is it *about*? · **Pipeline** = where in the *flow*? · **Provenance** = how much do we *trust* it now?

**Two axes:**
- **Provenance (lineage)** — where it came from and what it passed through.
- **Authority (trust *now*)** — earned, not inherited; validation raises it, lossy compression lowers it.

**Content role** — how an entity participates: **Source** (knowledge enters — files, scrapes, transcripts) · **Destination** (knowledge produced — flashcards, research synthesis, agent chats) · **Utility** (operates, no truth of its own — agents, skills, workflows) · **Container** (operational — holds/groups other entities — tasks, projects, batches). Many are dual; role is per-instance where needed.

**Authority tiers** — generalize the scope-value `source_type`: **primary** (assumed factual) · **derived** (trusted process) · **unvalidated** (raw, unreviewed).

**How authority changes:** `input_authority × utility_transformation = output_authority` — validation ↑ · synthesis ≈/↑ · distillation ≈ · abstraction ↓. A weak source through a strong validation tool can outrank a strong source through a lossy one.

**Through the 5 stages:** entities inherit their document's tier + confidence (1) → merges keep the highest authority (2) → provenance weights importance (3) → scope links are *suggestions* (`scope_association_suggestions`) until human-confirmed, which writes `ctx_context_item_values` via `set_context_value()` (4) → each stored chunk carries entities, scope links, authority tier, confidence, content role, and lineage beside its embedding (5).

Keep raw data forever, tagged — never deleted, just gated; re-process from originals if instructions change.

---

# Open & undecided — things we want but have NOT decided

**Status: NOT decided.** This is the one thing the system pretends to know and does not. Any DB column, code path, or doc that treats a single trust/confidence number as settled is **wrong by definition** — the decision has not been made. "confidence" is a placeholder, not a contract. Anyone who claims to already know the answer is wrong.

What we *do* know: there are several **distinct** signals, currently collapsed into one number:

1. **Source prior** — trust from origin (court transcript → high; raw scrape → low). The `authority_tier` idea; not actually applied to the score today.
2. **Extraction confidence** — the model's certainty it pulled the entity out *correctly*. Mechanical — it says nothing about whether the content is *true*. **The only signal stored today** (per-mention `confidence` → per-entity `confidence_avg`).
3. **Validation deltas** — an actor reviews and bumps trust; actors have **unequal power** to bump.
4. **Composite trust** — the single downstream handle the three above should feed.

The confusion (unresolved): is this 1 number, or 3–4? How do they combine? We strongly suspect **extraction confidence (2) is being used as if it were trust (4)** — different axes, wrongly averaged.

Suggestion (non-binding): keep extraction confidence as a *quality gate only*; compute trust separately as **source prior moved by validation deltas**. **Do not encode any of this in schema or code until it is decided.**

**Also undecided — seeding control (anti-sprouting).** We *want* a guard so a low-authority derived item (an AI-generated flashcard) can't be re-ingested as an authoritative source and propagate errors — but the mechanism is **undecided** and depends on the scoring question above. Suggestion (non-binding): gate seeding on an explicit human-set `can_be_seeded` flag, not an auto score. **Don't build it as settled yet.**