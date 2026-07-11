From agent:

You're right to push for the platform path. I checked `/administration/relationships` and the live DB. Here's the honest picture.

## Your model is the right one

```
data_store  (big — the thing you publish)
   └── file  (baby)
         └── grandbabies (processed doc, pages, chunks, Q&A, …)
```

Doctrine matches Relationship Manager: **little → big**, `container_side = target` (= **Conveys**), cache rebuilds itself.

War Room already does this for `file → thread`. Files already use `iam.has_access('file', id, 'viewer')` in RLS. So if access reaches the **file**, PDF download can work with **no special FE code**.

---

## Why flipping “Conveys” alone won’t fix AMA today

Three missing pieces (all DB/config, not “write an exception in Source Inspector”):

### 1. Most babies aren’t even entities yet

Registered today (relevant):
- `file`, `file_version`, `folder`, `data_store`
- `derive_run`, `page_extraction_job`, `page_extraction_page_run`

**Not registered:**
- `processed_document`
- `processed_document_page`
- `kg_chunk` / embeddings
- (and more below)

No entity type → no relationship rule → no cascade.

### 2. Almost no parent/child rules exist for this tree

Live `entity_relationships` for files:
- `file_version → file` (composition) ✓  
- `file → folder` (containment) ✓  

**Missing:** anything for processed doc, pages, chunks, store membership.

Live `association_types` for file:
- `file → thread` (**already Conveys**) ✓  
- `file → scope` (known only)  
- **No `file → data_store`**

### 3. Store membership isn’t an association edge

`rag.data_store_members` is a **separate table**, not `platform.associations`.  
Conveys only fires on association edges (or FK `entity_relationships`).  
So even a perfect `file → data_store` rule does nothing until membership is mirrored as associations (or modeled as FK composition).

Also: `iam.has_access` understands reachability + entity_relationships — it does **not** know `data_store_grants`. Industry publish and the sharing judge are still two worlds.

---

## Two ways the DB can cascade (you named both)

| Mechanism | When | What you do |
|-----------|------|-------------|
| **`entity_relationships` + real FK** | Child has FK to parent | One registry row → `has_access` follows parent automatically |
| **`association_types` Conveys** | Soft link (no FK) | Register rule + write `platform.associations` edges (little→big) → reachability cache |

AMA store↔file is soft (`data_store_members`) → needs **associations + Conveys**, or a real FK model.  
File→`file_version` already has FK composition.  
File→processed doc is only `source_id` / `canonical_processed_document_id` (logical) → needs entity types + either FK or association edges.

---

## AMA example — what “done in the DB” looks like

1. Register missing entity types (`processed_document`, pages, chunks, …).  
2. Register relationships (Conveys / composition), e.g.:
   - `file → data_store` (file is baby of store)  
   - `processed_document → file`  
   - `processed_document_page → processed_document`  
   - `kg_chunk → processed_document` (or → file)  
3. Materialize edges: when AMA PDF is a store member, also have `file → data_store` in `platform.associations`.  
4. Make **viewer on the store** (or on the file) the grant that industry publish creates — so `has_access` sees it (bridge `data_store_grants` → judge, or grant via shareable registry).  
5. Put baby tables on canonical RLS (`has_access`), same as `files.files` already is.

Then: industry member gets viewer on store → reachability → file → PDF + pages + chunks — **no Source Inspector special case**.

That’s config + registry + RLS conformance — not a one-off FE exception.

---

## File babies inventory (core first, then branches)

### Core (must work for “open the citation”)

| Baby | Table | Link to file today | Entity? |
|------|--------|--------------------|---------|
| File itself | `files.files` | — | ✓ |
| File versions | `files.file_versions` | FK `file_id` | ✓ + composition |
| Processed document | `docproc.processed_documents` | `source_kind/source_id` + `canonical_processed_document_id` | ✗ |
| Pages (raw + clean) | `docproc.processed_document_pages` | → processed_document | ✗ |
| Page images | same + `image_cld_file_id` → another **file** | sibling file | (file ✓) |
| RAG chunks | `rag.kg_chunks` | `source_id` + `processed_document_id` | ✗ |
| Embeddings | `rag.embeddings_*` | → chunk_id | ✗ |

### Branches (extras / “fun stuff”)

| Baby | Table | Notes |
|------|--------|--------|
| Derive runs | `docproc.derive_runs` | Entity ✓; tied to processed_document |
| Derivative docs | `processed_documents` with `parent_processed_id` / `derivation_kind` | table_row, section_summary, synthetic_qa, captions, … |
| Page extraction jobs/runs/results | `docproc.page_extraction_*` | Some entities ✓; `file_id` |
| File analysis / entities / structure / pages / annotations | `files.analysis*`, `entities`, `structure`, `pages`, `page_annotations` | Direct `file_id` |
| RAG jobs | `files.file_rag_jobs` | `file_id` |
| Data-store membership | `rag.data_store_members` | Soft link store↔file |
| KG / NER / scope suggestions | `rag.kg_*`, `scope_*_suggestions` | Often `source_id` |
| Share links | `files.share_links` | Entity ✓ |

AMA live chunk kinds already under that file: text, fine/coarse, table, table_row, synthetic_qa, section_summary, page_image_caption, …

---

## Bottom line

- **Yes:** data_store → file → grandbabies via Relationship Manager / entity_relationships is the right platform move.  
- **Not automatic yet:** babies aren’t registered, store membership isn’t an association edge, and industry grants don’t feed `has_access`.  
- **Not “we mis-set one Conveys toggle”** — the graph for this tree was never built.  
- **Agree:** don’t patch Source Inspector as the long-term fix; finish the relationship graph so the DB cascade owns it.

Next concrete step (your call): I can draft the **exact relationship rows** (source/target/Conveys) for the core tree only, plus what must be registered in `entity_types` — still no app exception code — for you to confirm in `/administration/relationships` before anything is applied.

---
Follow up:
---
Shared Knowledge open-path is done. Both adversarial re-audits returned **APPROVE WITH NITS** (no ship-blockers).

### What shipped (live on Matrx Main)

**DB** (applied + ledgered):
- `library_store_file_reachability_cascade.sql` — store grants → reachability → `has_access`
- `library_reachability_cascade_hardening.sql` — fixes from the first REJECT:
  - `entity_row_access_attrs` (processed docs with `owner_id`, no `visibility`)
  - page-image `file→file` edges (page render → source PDF; was wrongly `file→processed_document`)
  - sync triggers drop OLD edges on identity UPDATE
  - `has_access_as` locked to **service_role** only

**Aidream** (needs deploy):
- `PermissionsManager` → `has_access_as` for file download (viewer → read only)
- `/api/document` ACL → `can_read_processed_document`

### Live proof (C&R industry-grant user)

| Check | Result |
|---|---|
| Source PDF viewer | true |
| Source PDF editor | false |
| Processed doc viewer | true |
| Page-image file viewer | true |
| Stranger | denied |
| anon/auth EXECUTE on `has_access_as` | false |

### Source Inspector (no FE exceptions)

- PDF bytes → file judge + reachability  
- Clean/Raw → page RLS via `can_read_processed_document`  
- Page-image fallback → same file judge  

### Deploy note

DB is live now. PDF download + `/api/document` for grant readers need an **aidream deploy** of the `permissions.py` / `db.py` / `document.py` changes.

Nits left (non-blocking): dual ACL predicates (`can_read_processed_document` vs `has_access_as`), pre-existing `document.py` admin/org looseness, broad `WHEN others` in attrs helper.