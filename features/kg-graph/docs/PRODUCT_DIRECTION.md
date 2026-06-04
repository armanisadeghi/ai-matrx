# Knowledge Graph → Document Intelligence — Product Direction

**Status:** proposal / alignment doc · **Date:** 2026-06-03
**Audience:** product owner (server/NER decisions) + frontend agents (UI build)

> **Thesis:** A graph of extracted entities is not the product. The product is
> *"find what actually matters inside my documents, jump straight to the exact
> passage, and teach the system what matters so it's recognized everywhere."*
> The graph is one **lens** onto that — valuable only once entities are clean,
> relationships are meaningful, and every entity is one click from real source.

---

## 1. What the live data proves (2026-06-03, the 50-page legal PDF)

These are measured, not guessed:

| Finding | Evidence | Consequence |
|---|---|---|
| **Edges are 100% co-occurrence** | `15,672 / 15,672` edges are `kind = co_occurs_with` | Every line in the graph means "appeared near each other." There are **zero meaningful relationships**. The graph's core visual (edges) carries ~no signal. |
| **Ranking surfaces noise** | Top entity by mentions = the date **"05/25/2021" (76 mentions)**, and the *same chunk (index 57) is counted 8×* | Raw mention-count floats junk (dates, boilerplate) to the top; the client name / claim # sink. Counts are also **inflated by duplication**. |
| **Drill-down is shallow** | `citationHrefFor(note)` → `/notes/{id}` with **no `?chunk`/`?page`**; `document_char_start/end` and `page_numbers` are **NULL** | Clicking "Open" lands you at the **top of a 400-page note**, not the passage. The thread to "something real" exists but goes nowhere useful. |
| **PDF ingested as a `note`** | All 200 chunks `source_kind='note'`, `processed_document_id`/`page_numbers` 0% populated | The page-range provenance the schema supports was never filled in — so "jump to page 47" is impossible for this data today. |

**Conclusion:** the feature is decorative *right now* for three fixable reasons —
noise (edges + entities), shallow provenance, and zero curation. None are
fundamental; all are addressable, split across UI and server/NER.

---

## 2. The reframe

For the real job-to-be-done — *a defense attorney reviewing a 400-page workers'
comp file* — nobody cares about a force-directed cloud of phone numbers. They
care about:

> *"Show me the people, the employer, the claim number, the dates of injury, the
> treating physicians, the deadlines, the disputed issues — ranked by what
> matters — and let me jump to exactly where each is discussed. Hide the
> boilerplate. Remember what I tell you is important."*

That implies the **primary** surfaces are probably **not** a node-link graph:

1. **Evidence index (smart outline)** — entities grouped by kind (People, Orgs,
   Claim identifiers, Dates, Medical, Legal issues), ranked by *curated*
   importance, each expanding to its passages with **jump-to-source**. This is a
   self-assembling index of the document. *Highest value for single-doc review.*
2. **Document ↔ entity map** — at scale (5k docs), "which documents / sections /
   page ranges mention this client + this claim + this issue?" *This is the
   "find the valuable documents" view the owner explicitly asked for.*
3. **Relationship graph** — the current node-link view, demoted to a
   *secondary "explore connections" lens*, and only meaningful once edges are
   **typed** (not co-occurrence).

The graph stays — but it earns its place; it is not the front door.

---

## 3. Three pillars

### Pillar 1 — Provenance & drill-down (make it *real*)
Every entity is one click from its evidence: the documents it appears in, the
**page ranges / sections**, the **snippets**, and a **jump that opens the real
artifact at the right spot** (scrolled + highlighted). This is the single
biggest value unlock and it's mostly wiring + a provenance-population task.

### Pillar 2 — Curation (let the user drive)
Non-destructive overlay on the NER output: **hide/delete** noise,
**merge** duplicates (one client spelled three ways → one node), **pin/star
importance** (persists and elevates the entity *everywhere*), **add** a missing
entity, **edit** a label/kind, **disassociate** a wrong mention. Never mutates
source; it's a user layer the system learns from.

### Pillar 3 — Signal over noise (make the data worth showing)
**Typed relationships** (replace `co_occurs_with`), **canonicalization/dedup**,
**importance scoring** (domain rules + curation), **noise classification**,
confidence. This is the NER/server investment that turns the graph from
decorative to diagnostic.

---

## 4. Workstreams — who owns what

### A. Frontend / UI — *this repo (`features/kg-graph`), agent-owned*
Buildable against today's data (degrades gracefully where server work is pending):

- **A1. Evidence-first drill-down.** Promote the side panel to the hero
  interaction: mentions **grouped by document**, each showing section/snippet and
  a **"jump to passage"** link. Today it lands at the note top — see API B1.
- **A2. Evidence index view.** A ranked, kind-grouped, searchable list of
  entities with inline drill-down — an alternative primary tab to the graph.
- **A3. De-noise the default.** Edges **faded until a node is focused** (already
  built — invert the default); hide low-value kinds (phone/email/url/address) by
  default behind a "show noise" toggle; de-duplicate occurrences. (Note: ranking
  must **not** use confidence — it's an undecided trust placeholder; see
  `docs/knowledge/04_CURRENT_STATE_AND_PATH.md §6`.)
- **A4. Curation controls.** Per-node actions: hide, pin/star (importance),
  merge-into, edit label/kind, add entity, disassociate mention. Optimistic UI
  over the curation API (B3). Needs data model D + API B3.
- **A5. Document map view.** Documents as first-class nodes; entity→document
  links; filter "documents mentioning X and Y." Needs API B2.
- **A6. Importance + curation badges** on nodes (pinned, hidden-dimmed,
  merged-collapsed). Reads curation overlay.

### B. API contracts — *frontend ↔ aidream (`/kg`), needs server*
- **B1. Richer mentions.** `GET /kg/graph/entity/{id}/mentions` should return
  per-mention `document_id`, `page_numbers`, `section/heading`, `char_start/end`,
  `chunk_index`, so the FE can deep-link to the passage. Today it returns
  source_kind/source_id/snippet only.
- **B2. Documents-for-entity / entities-for-document.** `GET /kg/documents?entity_id=…`
  and `GET /kg/document/{id}/entities` to power the document map + "find valuable
  docs/sections."
- **B3. Curation CRUD.** `POST/DELETE /kg/curation/{entity}` for hide, pin
  (importance), merge (`canonical_id`), manual add/edit, mention disassociate.
- **B4. Typed-neighbor expansion.** `GET /kg/graph/entity/{id}/neighbors?types=…`
  for click-to-expand (lazy growth at 5k-doc scale) once edges are typed.

### C. Server / NER — *aidream + NER pipeline, owner-owned*
These are the product calls and pipeline changes only you can make:
- **C1. Typed relations.** Replace/augment `co_occurs_with` with domain relations
  (e.g. `employer_of`, `treating_physician_of`, `claim_number_for`,
  `represents`, `date_of_injury_for`, `party_to`). Co-occurrence can stay as a
  weak fallback but must not be the only edge.
- **C2. Canonicalization / dedup.** Collapse surface variants ("Jane Q. Doe" /
  "Ms. Doe" / "claimant") into one canonical entity; stop counting the same
  mention 8×.
- **C3. Importance scoring.** Domain-aware salience: boost claim #, client,
  employer, DOI, body part, provider; demote generic dates, addresses, fax
  numbers. Blend with user pins (D1).
- **C4. Noise classification.** Tag entities as `signal | noise | boilerplate`
  (letterhead, headers, page furniture) so the UI can hide noise by default.
- **C5. Page-accurate provenance.** Populate `document_char_start/end`,
  `page_numbers`, `page_spans` for note/chunk rows — and **ingest large PDFs as
  `processed_document`s** (paginated) rather than flattening to a `note`, so
  "jump to page 47" works.
- **C6. Entity dictionary / watchlist (cross-document recognition).** A per-org
  list of "things that matter" (this client, this claim #) so a pinned entity is
  recognized and elevated **anywhere it appears, in any future document** — the
  owner's "indicate importance so it's recognized everywhere" requirement.

### D. Data model — *curation overlay (new tables, owner-owned, FE consumes)*
Non-destructive layer over `rag.kg_entities` (never edit NER output in place):
- **D1. `kg_entity_curation`** — `(entity_id, org_id, user_id, importance,
  hidden bool, pinned bool, note, updated_at)`.
- **D2. `kg_entity_merge`** — `(entity_id → canonical_id, org_id, reason)`.
- **D3. `kg_manual_edges`** / `kg_manual_entities` — user-authored relations/nodes.
- **D4. `kg_entity_dictionary`** (watchlist, C6) — `(org_id, canonical_label,
  kind, aliases[], importance)`.
- All RLS-scoped per org/user; the graph payload LEFT JOINs the overlay so
  curation is reflected without touching NER rows.

---

## 5. Phasing (highest ROI first)

- **Phase 1 — Make it real & legible (FE + small API).** A3 de-noise default +
  A1 evidence-first drill-down + B1 passage-accurate mentions + deep-link notes to
  `?chunk=`/highlight. *Outcome: clicking the client name jumps you to the exact
  passages; the hairball becomes a readable, ranked view.* Mostly agent-buildable;
  B1 is a focused server change.
- **Phase 2 — Curation (FE + API + data model D).** A4 + B3 + D1/D2. *Outcome:
  hide noise, merge dupes, star what matters.*
- **Phase 3 — Meaningful graph (server/NER).** C1 typed relations + C2/C3/C4 +
  B4 typed expansion. *Outcome: the graph finally diagnoses, not decorates.*
- **Phase 4 — Scale & recognition.** A5 document map + C5 page provenance + C6
  watchlist. *Outcome: at 5k docs, "find the valuable documents/sections" works;
  pinned entities recognized everywhere.*

---

## 6. Open product questions (need owner decisions)

1. **Ingestion granularity:** should large PDFs ingest as paginated
   `processed_document`s (enables page jumps) or stay as `note`s? (Drives B1/C5.)
2. **Relationship taxonomy:** which typed relations matter for workers' comp
   defense? (Drives C1 — the single biggest "make the graph mean something" lever.)
3. **Importance policy:** how much is automatic (domain rules) vs user-driven
   (pins)? (Drives C3 + D1.)
4. **Primary surface:** do we lead with the **evidence index** (A2) and demote
   the graph to a secondary tab? (Recommended for single-doc review.)
5. **Cross-document recognition scope:** is the watchlist (C6) per-matter,
   per-org, or per-user?

---

## 7. One-line summary for each stakeholder

- **Frontend:** stop perfecting the hairball; build the **evidence index +
  passage drill-down + curation**, fade co-occurrence edges by default.
- **Server/NER:** the graph can't be valuable until edges are **typed**, entities
  **canonical + importance-scored**, and provenance is **page-accurate**.
</content>
