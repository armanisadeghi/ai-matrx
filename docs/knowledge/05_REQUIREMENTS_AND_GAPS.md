# 05 — Requirements & Gaps (working backlog)

**Status:** working backlog / alignment doc · **Date:** 2026-06-04
**Grounded in live DB + API checks (not guesses).** Companion to `04_CURRENT_STATE_AND_PATH.md`.

**Owner tags:** `[FE]` frontend (agent) · `[aidream]` Python backend · `[NER]` extraction pipeline ·
`[DB]` schema/migration · `[DECIDE]` product decision needed before building.

---

## 0. Live facts this doc is built on (verified 2026-06-04)

- `rag.kg_entities` is **currently empty** (reset for re-ingest) — architecture, not row counts, drives this doc.
- **Scope infra exists AND has data:** `ctx_scope_types` = 6, `ctx_scopes` = 20, `ctx_scope_assignments` = 11
  (these 11 are user-authored entities — notes/tasks — tagged to scopes, NOT kg entities).
- **`scope_association_suggestions` = 0 rows.** This table is *purpose-built* to bridge a kg entity to a scope
  (`kg_entity_id`, `kg_chunk_entity_id`, `target_scope_id`, `target_scope_item_id`, `target_slot_name`,
  `suggested_value`, `match_kind`, `confidence`, `status`, `context_snippet`, `decided_at/by`) — and it has
  never been populated. **This is the single load-bearing gap.**
- **`/kg/graph` API params today:** `organization_id`, `scope_id`, `kind`, `depth`, `limit`
  (`features/kg-graph/service/kgGraphService.ts:36`). No source/document, confidence, or date filter.
- **Mentions API** (`/kg/graph/entity/{id}/mentions`) returns `source_kind/source_id/snippet/span` only —
  no `chunk_index`, char offsets, page numbers, or document id (though the joined chunk *has* them).
- All edges are `co_occurs_with`; PDFs ingested as `note` (no page provenance); `rag.kg_clusters` +
  `rag.embedding_cache` have **RLS disabled** (security flag).

---

## 1. Remaining FRONTEND work `[FE]` (you can assign these to me now)

### A1. Notes passage-jump — the `?find=` thing, explained
**What it is (the thing that was unclear):** When you click an entity and then click **"Open"** on a passage in
the Evidence panel, the app navigates to the source. For a note that URL is
`/notes/{noteId}?find=<the passage text, url-encoded>`. The Evidence panel **already appends `?find=`** — but the
notes viewer **ignores it today** (confirmed: `NotesView` reads `tabs`/`active`, not `find`). So "Open" drops you
at the **top** of a 400-page note; you still have to Ctrl-F.
**The work:** teach the notes viewer, on load, to read `?find=`, **scroll to that text and highlight it.** Then
"Open" jumps straight to the passage — the real "click entity → land on the exact spot" payoff for note sources.
**Why it matters:** it's the last mile of drill-down; without it, note-sourced entities only half-connect to reality.
**Effort:** small. **Owner:** `[FE]` (touches `features/notes/**` — I held off because you were editing notes live).
**Note:** for *paginated* sources (files/processed_documents) the equivalent is `?chunk=`/`?page=`, which the
file/rag viewers already partly honor; this A1 item is specifically the notes gap.

### A2. Filter UI — scope / organization / source pickers
Add toolbar pickers that pass the params the API supports. Status per filter (see §3 for the full classification):
- **Organization** — trivial: the graph already uses the active org; add an optional in-graph org selector. `[FE]`
- **Scope** (Client/Case/…) — a picker that passes `scope_id`. **The UI is small, but it shows nothing until
  `[NER]` populates scope links (B1).** Build the picker behind that dependency.
- **Source / document** — needs `[aidream]` B6 first (no source param on `/kg/graph` yet), then a picker. `[FE]`

### A3. Evidence index view `[FE, medium]`
A ranked, kind-grouped, searchable **list** of entities with inline passage drill-down — frequently more useful than
a node-link graph for document review. (PRODUCT_DIRECTION A2.) Candidate to become the *primary* tab (see D5).

### A4. Curation controls `[FE]` (depends on `[DB]` D + `[aidream]` B)
Per-entity: hide / pin-importance / merge-duplicate / add / edit / disassociate-mention. Optimistic UI over a
curation overlay (PRODUCT_DIRECTION Pillar 2). Blocked on the curation tables + API.

### A5. Later-phase FE
Importance/curation badges on nodes; document↔entity map; cross-document watchlist surface.

---

## 2. SERVER / DATA requirements `[aidream]` `[NER]` `[DB]`

### B1. Stage-4 scope linking — THE priority `[NER]` + `[FE]` review UI
The `scope_association_suggestions` table is built and **empty**. The NER pass must **produce suggestions**
(entity → `target_scope_id` = Client Ava / Case 123, optionally → `target_scope_item_id`/`suggested_value` for a
field like `claim_number`). Then a `[FE]` review queue lets a human confirm a suggestion, which writes
`ctx_scope_assignments` (and, for item/value targets, `ctx_context_item_values` via `set_context_value()` per the
vision). **Until this runs, the entire "structural" half of the product — "show everything for Client Ava, Case
123" — is impossible, and the scope filter (A2) has nothing to show.**

### B2. Typed relationships `[NER]`
Replace/augment `co_occurs_with` with domain relations (`employer_of`, `treating_physician_of`,
`claim_number_for`, `represents`, `date_of_injury_for`, `party_to`). Co-occurrence may remain a weak fallback but
must not be the only edge — it's why the graph is a meaningless hairball.

### B3. Canonicalization / dedup `[NER]`
Collapse surface variants ("Jane Q. Doe" / "Ms. Doe" / "claimant") into one canonical entity; stop counting the
same mention many times (today one date showed 76 mentions, the same chunk repeated 8×).

### B4. Importance scoring `[NER]` + `[DECIDE]`
Domain salience (boost claim #, client, employer, DOI, body part, provider; demote generic dates/addresses/fax),
blended with user pins. **Gated on the undecided trust model** (`04 §6`): extraction-confidence ≠ trust; do not
hardcode a single number.

### B5. Mentions API enrichment `[aidream]`
Return on each `MentionRow`: `chunk_index`, `document_char_start/end`, `page_numbers`, `document_id`,
`section/heading`. The endpoint already joins the chunk — these are a wider SELECT. **Unblocks precise
passage-jumps and real page numbers** (A1 for paginated sources). Low effort, high payoff.

### B6. Graph filter params `[aidream]`
Add to `/kg/graph`: `source_id` / `document_id` (filter to one source — the data exists on `kg_chunks`),
optionally `min_confidence` / `min_importance`, and multi-`kind`. Enables the source/document filter (A2) and
"show only what's relevant."

### B7. Page-accurate provenance + source-agnostic pipeline `[aidream]` `[NER]`
Populate `page_numbers` / char offsets (note text even contains literal `<page number="N">` markers — page
boundaries are recoverable from content); ingest large PDFs as `processed_document`s, not `note`s; extract the
**`SourceConverter`** seam so notes/code/scrapes flow through the same pipeline + viewer (full plan in `04`).

### B8. Security `[DB]`
`rag.kg_clusters` and `rag.embedding_cache` have RLS **disabled** — lock down (deny-by-default + scoped policies).

---

## 3. Data-management & filtering gap analysis (the classification you asked for)

For each filter the user wants, is it a missing UI element, a data problem, or a missing DB item?

| Filter / capability | DB schema | Data populated | API (`/kg/graph`) | UI | **Verdict** |
|---|---|---|---|---|---|
| **By kind** (person/org/date…) | ✅ | ✅ | ✅ + client-side | ✅ shipped | **Done** |
| **By organization** | ✅ `organization_id` on entities | ✅ | ✅ `organization_id` | 🟡 uses active-org, no in-graph switcher | **Simple UI add.** Not a data/DB problem. |
| **By scope** (Client/Case) | ✅ `scope_association_suggestions` (kg_entity_id→scope) + `ctx_scope_assignments` | 🔴 **0 rows — NER never links** | ✅ `scope_id` | 🟡 no picker on main graph | **Data problem, NOT a DB or API problem.** Schema + API ready; blocker is `[NER]` B1. Then a small `[FE]` picker. |
| **By source / document** | ✅ `kg_chunks.source_id` / `processed_document_id` | ✅ | 🔴 no param | 🟡 no picker | **Backend API add (B6) + UI.** Data exists. |
| **By confidence** | ✅ stored | ✅ | 🔴 no param | 🟡 none | **Backend + UI** (but see B4 — confidence isn't trust). |
| **By importance** | 🟡 placeholder | 🔴 | 🔴 | 🟡 | **Blocked on B4 `[DECIDE]`.** |
| **By date / recency** | depends on entity timestamps | 🟡 | 🔴 | 🟡 | **Backend + UI** (lower priority). |
| **Full-text within graph** | ✅ (labels) | ✅ | n/a (client) | ✅ search shipped | **Done** (node search). |

**Bottom line for your question:** none of the missing filters are a **DB schema** gap — the schema is already there
(including the dedicated scope-suggestion bridge). **Organization** filtering is a few lines of UI. **Source/document**
filtering needs one small backend param (B6). **Scope** filtering — the most valuable one, the "structural search"
that is half the product vision — is blocked by a **data/pipeline** gap: the NER stage that links entities to scopes
(`scope_association_suggestions`) has never run. That is where the leverage is.

---

## 4. Decisions I need from you `[DECIDE]`

1. **Scope linking (B1):** is implementing/running NER Stage-4 (entity → scope suggestions) on your near-term
   roadmap? It unblocks the whole structural dimension + the scope filter. What confidence threshold auto-suggests,
   and who confirms (auto above X, else human queue)?
2. **Relationship taxonomy (B2):** which typed relations matter for workers-comp defense? (Biggest "make the graph
   mean something" lever.)
3. **Ingestion granularity (B7):** large PDFs as paginated `processed_document`s (enables page-jumps) or keep as notes?
4. **Importance/trust (B4):** how much automatic vs user-pinned — and do we proceed on the undecided trust model, or
   hold? (Reminder: `04 §6` says do not hardcode.)
5. **Primary surface (A3):** lead with the evidence **index** and demote the graph to a secondary "relationships" tab?
6. **Security (B8):** lock down `kg_clusters` / `embedding_cache` RLS now?

---

## 5. Suggested sequencing (highest leverage first)

1. `[aidream]` **B5** (mentions enrichment) + `[FE]` **A1** (notes `?find=`) → real passage-jumps. *Small, high payoff.*
2. `[NER]` **B1** (scope linking) + `[FE]` review queue + scope filter (A2) → the structural half lights up.
3. `[NER]` **B2/B3** (typed edges + canonicalization) → the graph stops being a hairball.
4. `[aidream]` **B6** + `[FE]` source filter; `[FE]` **A3** evidence index.
5. `[DB]`/`[FE]`/`[aidream]` curation (A4) ; **B7** source-agnostic pipeline ; **B8** security.
</content>
