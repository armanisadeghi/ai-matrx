# 05 — Requirements & Gaps (working backlog)

**Status:** working backlog / alignment doc · **Date:** 2026-06-04 (rev. 2 — corrected after owner review)
**Grounded in live DB + API + code checks.** Companion to `04_CURRENT_STATE_AND_PATH.md`.

**Owner tags:** `[FE]` frontend (agent) · `[aidream]` Python backend · `[NER]` extraction pipeline ·
`[DB]` schema/migration · `[DECIDE]` product decision.

> **rev. 2 corrects three wrong framings in rev. 1** (called out inline as ⚠️ CORRECTION): scope
> association is **user-driven first**, not NER-discovered; relationships must be **user-defined**;
> and **a note is not a flattened PDF** — they're unrelated source types.

---

## 0. The model, stated correctly (the part rev. 1 got backwards)

**Scope association is something the USER does, and the UI already exists.** When a user creates a note
they pick its scopes via `NoteContextPicker` → `EntityScopeTagger` (`features/scopes/components/entity-context/`)
— "this note is for **Ava** (a *Kid*) and her *Genetics Class*." That writes `ctx_scope_assignments`
(`note` ↔ scope). This is **path 2** (assignment) and it is the primary, correct path. Asking an AI to *discover*
"this is probably about one of your kids named Ava" is backwards and not the primary mechanism.

What AI *can* usefully do (secondary, and partly built — `features/kg-suggestions/` + `KgSuggestionsChip`):
once a scope is **known**, scan the content for **values of that scope-type's known items** (path 1) — e.g. the
*Kids* type has an `exam_schedule` item, the study guide has an exam date → propose a value. Always a suggestion
the user confirms (`scope_association_suggestions` → confirm → `ctx_context_item_values`). It does **not** invent
scopes.

**The chain that makes the KG structural is already complete in the data:**

```
entity → kg_chunk_entities → kg_chunks(source_id=note) → ctx_scope_assignments(note ↔ scope) → scope (Ava / Client X)
```

The user tags the source; every entity extracted from it is therefore "about Ava" via its source. **No NER
scope-discovery required.** The backend already exploits this: `GET /kg/graph?scope_id=…` "seeds from entities
mentioned in the scope's tagged sources" (kg-graph FEATURE.md). So the data + API for scope filtering exist; the
**graph UI just doesn't expose the picker** (see A2).

**Core directive from the owner:** *show the user what we have and let them pick.* Stop gating on AI magic. If
scopes exist, show them; if not, let the user create/assign. Everything below honors that.

---

## 1. Remaining FRONTEND work `[FE]`

### A1. Notes passage-jump — the `?find=` thing, explained
When you click an entity → **"Open"** a passage, the URL built for a note is `/notes/{id}?find=<passage text>`.
The Evidence panel **already appends `?find=`**; the notes viewer **ignores it** (it reads `tabs`/`active`, not
`find`). So "Open" lands at the **top** of the note. **The work:** notes viewer reads `?find=` on load → scrolls
to + highlights that text. Then "Open" jumps to the exact passage. *Small; last mile of drill-down. I held off
because notes was being actively edited.*

### A2. Scope / org / source FILTER on the graph — `[FE]`, reuse existing primitives ⭐ highest near-term value
The graph shows the whole org today. Add a **scope picker to the toolbar** so the user can say "show me only
**Ava** / only **Client X**." **This reuses `EntityScopeTagger` in its controlled/filter mode** (already used by
`TaskScopeFilter`) and the **backend `scope_id` param already works.** No new data, no new API, no DB change —
it's wiring an existing component to an existing endpoint. Org filter = trivial (active-org + optional switcher).
Source/document filter = needs the small `[aidream]` param (B5).

### A3. Show an entity's scope(s) in the Evidence panel — `[FE]` (+ maybe small `[aidream]`)
When a node is selected, show which scope(s) its sources are tagged to (and let the user **tag/curate** from there
via `EntityScopeTagger`). Makes the "what is this about / let me file it under Client X" loop direct. May need the
mentions API to include the source's scope assignments, or the FE can join via the scopes slice.

### A4. Evidence Index view — `[FE]` (this does NOT exist yet — see "Where is it?" below)
A ranked, kind-grouped, searchable **list** of entities with inline passage drill-down — an alternative tab to the
node-link graph, often better for document review. **Today there is no such screen**; the only KG UI is the graph
at `/knowledge-graph`. This is a proposed build, not a place you can visit.

### A5. Curation controls — `[FE]` (+ `[DB]` overlay) — hide / pin / merge / add / edit / disassociate.

---

## 2. SERVER / DATA requirements `[aidream]` `[NER]` `[DB]`

### B1. ⚠️ CORRECTION — scope linking is NOT primarily a server job
Rev. 1 called "NER must produce scope suggestions" the load-bearing gap. **Wrong.** The user assigns scopes
(A2/A3, already built for notes/tasks). The server's role is the **secondary assist** only: given a known scope,
propose **values for that scope-type's known items** (path 1) into `scope_association_suggestions` for the user to
confirm. Useful, not foundational. Build the user-driven filter (A2) first; treat suggestions as enhancement.

### B2. User-defined relationship types `[DECIDE]` + `[DB]` + `[aidream]` — see §6 (the design question you asked)
Typed edges must be **user-defined within the context system**, not a hardcoded taxonomy. Design options in §6.

### B3. Canonicalization / dedup `[NER]` — collapse "Jane Q. Doe"/"Ms. Doe"/"claimant"; stop counting one mention 8×.

### B4. Importance scoring `[NER]` + `[DECIDE]` — domain salience, gated on the undecided trust model (`04 §6`).

### B5. Mentions API enrichment `[aidream]` — return `chunk_index`, char offsets, page numbers, document id,
section/heading per `MentionRow` (the chunk's already joined). Unblocks precise passage-jumps (A1) and a source
filter (A2). Low effort, high payoff.

### B6. ⚠️ CORRECTION — "source-agnostic," stated correctly `[aidream]`/`[NER]`
Rev. 1 implied "stop flattening PDFs into notes / re-ingest PDFs as documents." **There is no flatten bug.** A
**note** is user-authored text (no pages — correctly). A **PDF/file** goes through the *separate* pdf-extractor
pipeline (`MediaRef`/`cld_id` → extract text w/ per-page/block/word metadata → chunks w/ `PdfPageSpan`) and **does**
carry page provenance. The note I inspected was content the owner pasted into a note — a legitimate user choice;
we do not police where users get content. The real "source-agnostic" goal: **generalize the pdf-extractor's rich
pipeline + viewer (extract → clean → pages → chunks → run agents) so notes / code / scrapes get the same treatment**,
and have the KG consume every source type uniformly. The only "don't reprocess" concern is **duplicate-content
detection**, nothing more.

### B7. Graph filter params `[aidream]` — add `source_id`/`document_id` (data exists on chunks) for A2's source filter.

### B8. Security `[DB]` — `rag.kg_clusters` + `rag.embedding_cache` have RLS **disabled**; lock down.

---

## 3. Data-management & filtering gap analysis (corrected)

| Filter | DB schema | Data populated | API | UI | **Verdict** |
|---|---|---|---|---|---|
| **By kind** | ✅ | ✅ | ✅ | ✅ shipped | Done |
| **By organization** | ✅ | ✅ | ✅ `organization_id` | 🟡 active-org only | **Trivial UI add** |
| **By scope** (Client/Case/Kid) | ✅ `ctx_scope_assignments` | ✅ **user tags sources today** (11 assignments incl. notes) | ✅ `scope_id` (resolves scope→sources→entities) | 🟡 no picker on graph | **Small UI add — reuse `EntityScopeTagger` (A2).** NOT a data/DB/NER gap. |
| **By source / document** | ✅ `kg_chunks.source_id` | ✅ | 🔴 no param | 🟡 no picker | **Small `[aidream]` param (B7) + UI** |
| **By importance** | 🟡 placeholder | 🔴 | 🔴 | 🟡 | Blocked on B4 `[DECIDE]` |

**Answer to "is filtering a UI / data / DB problem?"** — **None is a DB-schema gap.** Org = trivial UI.
Scope (the valuable one) = **a small UI add reusing an existing component**, because the user already tags sources
to scopes and the backend already resolves scope → entities. Source = one small backend param. The earlier claim
that scope filtering was blocked on NER was wrong.

---

## 4. Decisions I need from you `[DECIDE]`

1. **Relationship model (§6):** which of the user-defined-relationship options fits how you want users to work?
   (The one real design call here.)
2. **Importance/trust (B4):** proceed on the undecided trust model, or hold? (`04 §6` says don't hardcode.)
3. **Primary surface:** is the Evidence Index (A4) worth building as the lead view, or keep the graph primary?
4. **Security (B8):** lock down `kg_clusters` / `embedding_cache` now?

---

## 5. Suggested sequencing (highest leverage first)

1. `[FE]` **A2** scope/org filter (reuse `EntityScopeTagger`) — *let the user slice to Ava / Client X today.* Small.
2. `[aidream]` **B5** mentions enrichment + `[FE]` **A1** notes `?find=` → real passage-jumps.
3. `[FE]` **A3** entity↔scope in the panel (tag/curate from the graph).
4. `[DECIDE]`+build **§6** user-defined relationships → meaningful edges; **B3** canonicalization.
5. `[FE]` **A4** Evidence Index; **A5** curation; **B6** source-agnostic pipeline; **B8** security.

---

## 6. Design question — user-defined relationships that fit the context system

You asked: *"we have to offer the user a way to do this. What's the dynamic way that fits the context system?"*
Three options, in increasing build cost. They are **not exclusive** — A is likely the first move regardless.

**Insight first:** the context system *already* encodes the most valuable relationships, and they're user-defined:
- **Scope hierarchy** — scope types carry `child_types`, scopes carry `children`. A *Client* type can have a child
  *Case* type; a *Case* scope nests under its *Client*. That **is** a user-defined relationship graph (Client → Case
  → tagged sources → entities) — far more meaningful than entity co-occurrence.

**Option A — visualize the SCOPE graph (no new schema).** Make the KG's primary "relationship" view the
**scope → sub-scope → tagged source → key entities** structure that already exists. Reuses `ctx_scopes.children`
+ `ctx_scope_assignments`. *Highest value for least cost; honors "the user already defined these."*

**Option B — user-defined relationship TYPES, parallel to scope types** (`[DB]` `ctx_relationship_types` per org).
Just as a user defines *Kid*/*Client* dimensions, they define edge vocabularies — "represents", "treating physician
of", "claim # for" — with optional from/to entity-kind or scope-type constraints. Edges (`kg_edges` gains a
`relationship_type_id`, or a new `ctx_relationships`) are then **user-applied or agent-proposed + user-confirmed**
(same suggestion→confirm loop as scopes). This is the dynamic, per-tenant taxonomy you described.

**Option C — relationships as "reference" context items.** Extend `ctx_context_items` with a `reference` item type
whose value points to another scope/entity (e.g. the *Case* type gets a `treating_physician` item → a Person).
Reuses item/value machinery; natural for scope↔entity links, awkward for arbitrary entity↔entity.

**My recommendation:** **A now** (visualize the scope structure you already have — it's the real, user-defined
relationship graph), then **B** for entity-entity typing (the per-org vocabulary + suggestion-confirm loop). Tell
me which resonates and I'll spec it in detail.
</content>
