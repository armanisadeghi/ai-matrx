# Current State → Vision: The Real Map and the Path

> ⚠️ **Corrected by owner review — read `05_REQUIREMENTS_AND_GAPS.md` (rev. 2) for the authoritative model.**
> Three framings in this doc are wrong: (1) scope association is **user-driven first** (`EntityScopeTagger` exists),
> not NER-discovered; (2) **a note is not a flattened PDF** — they're separate source types, and there is no
> "flatten" bug (the owner pasted PDF text into a note by choice); (3) typed relationships must be **user-defined**.
> The provenance/DB facts below remain accurate; the *interpretation/priorities* are superseded by 05.

**Status:** analysis + roadmap · **Date:** 2026-06-04
**Method:** four parallel deep-dive analyses (pdf-extractor pipeline, knowledge-vision
synthesis, entity→source provenance chain, source-viewer drill-down targets), every
claim cross-checked against the live DB `txzxabzwovsujtloxrus`. Read alongside
`01_KNOWLEDGE_OVERVIEW.md`–`03_KNOWLEDGE_MODULE.md`, `knowledge_provenance_model.md`,
and `features/kg-graph/docs/PRODUCT_DIRECTION.md`.

---

## 0. Bottom line up front

The **spine is real and working**: a source-agnostic-capable RAG+NER ingest contract,
a live scope-suggestion loop, and a polished graph visualizer. The three things that
make the product *feel* decorative are exactly the gaps the vision docs already flag —
and **two of the three are wiring/server work, not new architecture**:

1. **Edges carry no signal** — `13,689 / 13,689` edges are `co_occurs_with`. (NER work: typed relations.)
2. **Provenance dead-ends** — the entity→passage thread exists in schema but the page
   block is `0%` populated, because the 50-page PDF was ingested as a flat `note`
   instead of the paginated `processed_document` **that already exists** (`ellie-example.pdf`, 51 pp). (Wiring + a small server change.)
3. **No trust model** — by design. `01 §"Open & undecided"` makes this a hard
   guardrail: **do not encode any trust/confidence/seeding decision in schema or code.**

The single highest-leverage structural move is to **extract one `SourceConverter`
primitive** so the pdf-extractor becomes *one adapter behind it* and the
flatten-to-`note` path goes extinct — which simultaneously fixes provenance, unifies
drill-down across every source kind, and gives the NER stages uniform input.

---

## 1. The gap map (built vs aspirational) — live-verified

Legend: ✅ built · 🟡 partial · 🔴 concept-only. Counts are live as of 2026-06-04.

| Vision element | Status | Evidence |
|---|---|---|
| Scope model (type→scope→item→value + M2M) | ✅ | 6 scope types, 20 scopes, 10 values, 11 assignments; full CRUD UI in `features/scopes/`. |
| Stage-4 scope **suggestion** loop | ✅ | `scope_association_suggestions` (27 rows) + `kg-suggestions` review UI + heavy-hitter→`create_scope`. The most-realized piece of the vision. |
| RAG ingest contract (source-agnostic) | ✅ | `source_kind: cld_file \| note \| code_file \| transcript \| scraped` (`features/rag/api/ingest.ts:51`). |
| NER **Extract** (stage 1) | ✅ | 617 entities; `kg_chunk_entities` carries `span_start/end` + `confidence` (100%). |
| Semantic search | ✅ | vector + tsvector on `kg_chunks`; `/rag/search` Search Lab. |
| pdf-extractor pipeline (PDF) | ✅ | full studio: extract/clean/chunk/page-nav/lineage + per-page agent (`page-extraction`). |
| KG visualization | ✅ viz / 🟡 product | polished cytoscape engine; but it visualizes a noise-dominated corpus. |
| KG drill-down ("click → real") | 🟡→🔴 | side panel + `citationHrefFor` wired, but `note` → bare `/notes/{id}` (no passage). |
| NER **Resolve / canonicalize** (stage 2) | 🔴 | schema ready (`kg_entities.canonical_id`/`cluster_id`) but un-run: "same chunk counted 8×". |
| NER **Importance** (stage 3) | 🔴 | no importance column; ranking is raw `mention_count` → junk floats up. |
| Typed relationships | 🔴 | 100% `co_occurs_with`. |
| Page-accurate provenance | 🔴 (schema ✅, data 0%) | `processed_document_id`/`primary_page_id`/`page_numbers`/`page_spans`/`document_char_start/end` = **0 / 171**. |
| Provenance / Authority plane | 🔴 (by design) | no `authority_tier`/`content_role`/`confidence_score`/`can_be_seeded` columns. Undecided. |
| Curation overlay (hide/merge/pin/watchlist) | 🔴 | none of `kg_entity_curation`/`kg_entity_merge`/`kg_manual_*`/`kg_entity_dictionary` exist. |
| Source-agnostic Convert/Clean | 🟡 | data model + ingest contract neutral; the *converter + viewer* are PDF-coupled. |
| Agent Fabric (attach-at-phase) | 🟡 | ingredients exist platform-wide; the "attach an agent at Phase 3" abstraction does not. |
| Phase 4 Enrich/Branch · Phase 7 Reprocess↻ | 🔴 | no fact-check/branching; reprocess loop not first-class. |

---

## 2. The two foundational problems (and why they're fixable)

### 2.1 Provenance dead-ends (the "nothing real" complaint)
The full join path **exists**:
```
kg_entities → kg_chunk_entities[span_start/end ✅100%] → kg_chunks[processed_document_id, primary_page_id, page_numbers, document_char_start/end ❌0%] → processed_documents (= the [id] in /tools/pdf-extractor) + processed_document_pages
```
What's true today, verified: `span_start/end` and `chunk_index` are **100% populated** (e.g. "Mariela Montelongo" sits exactly at chars 386–404 of chunk 154); the page block is **100% NULL** *for this corpus only* — `processed_document_pages` holds **6,009 real page rows** for 39 other documents, so the infra works. The legal note (`73410645-…`, 96,451 chars) names UUID `9380f8bd-…`, which **is** a `processed_documents` row (`ellie-example.pdf`, 51 pp) — the good copy was orphaned when NER ran on the flattened note.

> **Fix:** populate `processed_document_id`/`page_numbers` on the note's chunks (or re-ingest the legal file as the `processed_document` that already exists). Then page-jump works. Char-accurate jump within the note works *today* via `chunk_index` + `span_start/end` once the mentions API surfaces them.

### 2.2 Edges carry no signal (the "useless hairball")
Every edge is co-occurrence. The graph's core visual is noise until the NER pass emits **typed** relations (`employer_of`, `treating_physician_of`, `claim_number_for`, …). This is the single biggest "make the graph mean something" lever, and it is **NER/server work** (owner-owned).

---

## 3. The structural insight: extract a `SourceConverter` primitive

The vision's Plane-1 premise is *"ingest **any** content,"* yet the most provenance-rich
path (pdf-extractor → `processed_documents` + pages) is **siloed to PDFs**, while the
path that actually fed the KG threw provenance away. Per CLAUDE.md doctrine ("build the
platform, not the artifact") the win is **not** "make the PDF tool also do scrapes." It's:

> **Extract one `SourceConverter` primitive** that takes any `source_kind`/`FileSource`
> and emits one normalized record: `(text, page/section spans, char offsets, lineage)`.
> The pdf-extractor becomes *one adapter* behind it; notes/code/transcripts/scrapes are
> other adapters; the flatten-to-`note` path is deleted.

This one primitive simultaneously:
1. **Makes Phase-5 provenance uniform** → `kg_chunks.page_numbers/document_char_start` get
   populated *regardless of source*; passage drill-down works everywhere, not just PDFs.
2. **Lets the generic NER stages (1–3) run identically on anything** (they require shape-uniform input).
3. **Makes the Phase-7 reprocess loop mechanical** (re-run from a retained raw layer).
4. **Is the natural Agent-Fabric attach point** for Phase-3 known-type cleaning agents.

### The PDF-coupling seams to abstract (from the pdf-extractor map)
The DB + 3-pane reader are already neutral; PDF assumptions are concentrated and nameable:

| Seam | Where | Abstraction |
|---|---|---|
| Upload MIME allowlist + `/utilities/pdf/batch-extract` | `usePdfExtractor.ts:349` | source-kind→ingest registry; text sources skip OCR ("adopt existing text"). |
| PDF viewer pane (pdfjs) | `PdfStudioReader.tsx` `PdfPane` | source-kind-dispatched renderer (pdf→pdfjs; note/code/text→markdown/code/plain). |
| Manipulation layer (crop/reorder, US-Letter hardcoded, `mime:application/pdf`) | `PdfStudioReader.tsx` | gate on `cld_file && pdf`; N/A for text sources. |
| Page model assumes physical pages | `processed_document_pages` | synthesize logical pages (sections/char-windows) for pageless sources; `section_kind/title` already exist. |
| Re-process needs re-fetchable binary | `usePdfExtractor.ts:914` | text sources re-clean from stored `content`, no byte fetch. |
| Chunk/Job runner keyed on `file_id` | `PdfStudioInspector.tsx:102` | re-key on `processed_document_id` (column already exists). |
| Naming/nav ("pdf-extractor") | route/feature/nav | cosmetic last → "Document Studio". |

**Highest-leverage refactor:** a `source_kind`→capability registry + viewer dispatch at
`PdfPane` + re-key the chunk runner on `processed_document_id`.

> ⚠️ **`rag.*` is not browser-readable** (no PostgREST). Any entity→passage resolver MUST
> be a Python endpoint returning `{processed_document_id, page_number, char offsets, chunk_id}` —
> the frontend cannot join `kg_chunk_entities → kg_chunks` itself.

---

## 4. The drill-down path (entity → real passage), precisely

| Step | Owner | What | Status |
|---|---|---|---|
| Evidence panel: dedupe occurrences, group by source, highlight entity in passage | **FE (done)** | `KgGraphSidePanel` rebuilt this pass | ✅ shipped |
| De-noise default: faint co-occurrence edges, hide phone/email/url/address | **FE (done)** | this pass | ✅ shipped |
| Surface `chunk_index` + `span_start/end` (+ `parent_chunk_id`) in `MentionRow` | **server** | one SELECT + Pydantic change in `kg_graph.py:415` (already joins the chunk) — **free** | 🔜 |
| `note` viewer honors `?find=`/`?chunk=` → scroll + highlight | **FE (notes)** | primitives exist (`usePreviewFindHighlight`, `FindMatchOverlay`); snippet re-find (note content ≠ chunk text) | 🔜 |
| `LibraryPreviewPage` honors `initialPage`/`initialChunkId` (viewer for `/rag/viewer` AND `/files` doc tab) | **FE** | reference impl exists dead-coded in `DocumentViewer`/`ChunksPane`; highest-ROI viewer fix | 🔜 |
| Populate page provenance / re-ingest legal PDF as `processed_document` | **pipeline** | unlocks page-jump against the 51-pp doc that already exists | 🔜 |
| Typed relations + canonicalization + importance | **NER/server** | makes the graph diagnostic, not decorative | 🔜 |
| Scope-aware drill-down ("this is Client Ava → her other evidence") | **FE + data** | `scope_association_suggestions` carries `target_scope_id` + snippet; needs *real* (non-junk, accepted) scope links | 🔜 |

The FE deep-link already forward-wires `?find=<snippet>` on note sources, so the note-viewer
step lights up with no further KG change.

---

## 5. Roadmap (ROI-ordered, by owner)

- **Phase 1 — legible + evidence-real (FE, mostly shipped).** De-noise default ✅, Evidence
  panel ✅. Remaining: `MentionRow` chunk_index/span (server, trivial) + note `?find=`
  scroll-highlight (FE/notes).
- **Phase 2 — passage-accurate everywhere (FE + small server).** `LibraryPreviewPage`
  initialPage/initialChunkId; surface page fields once populated.
- **Phase 3 — `SourceConverter` primitive (FE + pipeline).** Source-kind registry + viewer
  dispatch + re-key chunking on `processed_document_id`; "adopt existing text" ingest.
  Delete the flatten-to-`note` path; backfill/re-ingest the legal file.
- **Phase 4 — meaningful graph (NER/server).** Typed relations + canonicalization +
  importance scoring + noise classification.
- **Phase 5 — curation overlay (FE + data model).** `kg_entity_curation/merge/manual/dictionary`
  (hide/merge/pin/watchlist) — non-destructive layer over NER output.
- **Phase 6 — scope-native retrieval + reprocess loop + agent-fabric attach points.**

---

## 6. Hard guardrails (do not violate)

1. **Trust/confidence/seeding is UNDECIDED** (`01 §"Open & undecided"`). Do **not** add
   `authority_tier`/`confidence_score`/`can_be_seeded`/composite-trust columns or bake
   confidence into ranking as if it were trust. Extraction confidence is a *quality gate*,
   not trust. (This is why Phase 1 deliberately does **not** rank by confidence.)
2. **`rag.*` is not browser-readable** — entity/chunk joins go through Python.
3. **Scope links are suggestions until a human accepts** — never write
   `ctx_context_item_values` straight from NER.
4. **Security (flagged, not yet fixed):** `rag.kg_clusters` and `rag.embedding_cache` have
   **RLS disabled** (readable/writable by `anon`/`authenticated`). Needs owner decision +
   policies (invoke the `protected-resources` skill before locking down).

---

## 7. Shipped in this pass (Phase 1 FE)

- **De-noise default:** co-occurrence edges recede to a faint baseline (they're noise until
  typed); phone/email/url/address kinds hidden by default with a "Noise hidden (N)" toggle.
- **Evidence panel:** the side panel now dedupes inflated mentions by `(chunk_id, span_start)`
  (collapsing "×8" duplicates), groups passages by source, highlights the entity inside each
  passage, supports copy-passage, and forward-wires a `?find=` passage anchor on note sources.

Everything past Phase 1 is sequenced above with explicit owners. The fastest visible wins
remaining are the two *trivial server changes* (surface `chunk_index`; re-ingest the legal
PDF as the paginated doc that already exists) — both unblock real page/passage jumps.
</content>
