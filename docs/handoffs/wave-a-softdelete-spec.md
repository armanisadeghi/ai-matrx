# Wave A crack-hunt — adversarially confirmed spec (2026-07-17)

Source: workflow wf_26d010fe-aba (56 agents, 37 confirmed cracks, 4.4M tokens).

## ARMAN DECISIONS (2026-07-17) — these override the spec's assumptions

1. **Chunk hide marker** — NEW `rag.kg_chunks.deleted_at` (do NOT reuse `valid_to`; it means supersession).
2. **Delete canonical extract directly** — BLOCKED. The `initial_extract` is only removable via the file path (delete/reprocess the file). Per-derivative delete is allowed for non-canonical derivations.
3. **Canonical repoint on soft-delete** — immediately repoint `files.canonical_processed_document_id` to the newest live sibling (NULL if none); symmetric on restore.
4. **"Delete file"** — soft-delete the WHOLE file family as one set (file + derivations + memberships), restore together.
5. **Trash surface** — owner-only Trash view (view + restore + purge) via an `include_deleted` read path.
6. **THE INVARIANT (load-bearing):** there is NO `active → deleted` path. Lifecycle is strictly
   **active → soft-deleted → deleted**. Hard-delete (purge) is reachable ONLY from the Trash view, on a row
   that is ALREADY soft-deleted. Enforce at the DB: a `BEFORE DELETE` guard on `docproc.processed_documents`
   (and `rag.kg_chunks`) RAISES unless `OLD.deleted_at IS NOT NULL`. Added as the capstone AFTER every delete
   path is converted to soft-delete (else it breaks live endpoints).

## Progress

- [x] Phase 0 — schema (`kg_chunks.deleted_at` + index; regen types) — LIVE 2026-07-17 (index name is `kg_chunks_live_by_doc_idx`; FE types + aidream `KgChunks.deleted_at` regenerated; column is currently written/read by NOTHING — Phase 1/2 wire it)
- [x] Pre-build adversarial verification (2026-07-17) — see PRE-BUILD VERIFICATION section; all premises confirmed against live DB + both repos; corrections folded into phases below
- [ ] Phase 1 — per-document soft-delete/restore/purge authority
- [ ] Phase 2 — close every read surface (search lanes + RLS + tools + central gate)
- [ ] Phase 3 — canonical repoint triggers
- [ ] Phase 4 — FE resolver guard
- [ ] Phase 5 — collapse cascade authorities + atomicity
- [ ] Phase 6 — reprocess/replace/archive coherence
- [ ] Capstone — BEFORE DELETE hard-delete guard (the invariant)
- [ ] Adversarial pass #2 against the implementation

## PRE-BUILD VERIFICATION (2026-07-17) — corrections that OVERRIDE the phase text where they conflict

Every structural premise was re-verified against the live DB and both repos. All 6 `kg_chunks` RLS policy names, the 3 search-lane anchors, the FK cascade chain (`kg_chunks→processed_documents` CASCADE; 3 embeddings tables + `kg_chunk_entities` + `kg_edges` cascade off chunks), the cascade trigger body, and the FE anchors are exact. Corrections + additions:

**V1 (CRITICAL, changes Phase 1/5): the existing file-keyed soft-delete uses `valid_to`, which is the exact bug this spec exists to kill.** `ingestion.py:1744 soft_delete_source_artifacts` sets `KgChunks.valid_to` (+ `DataStoreMembers.deleted_at`), and `:1773 restore_source_artifacts` CLEARS `valid_to` — restoring a file today resurrects superseded chunks. Phase 1 must ALSO convert these two file-keyed primitives to the new chunk `deleted_at` (restore clears only `deleted_at`), not just add the doc-scoped trio.

**V2 (CRITICAL, rewrites Phase 2.3): do NOT add `deleted_at IS NULL` to `processed_documents_owner_all`.** It is `cmd=ALL`: gating it (a) makes the soft-delete UPDATE itself fail its own WITH CHECK re-check (the exact 42501 class fixed platform-wide 2026-07-04 — authenticated RLS never gates `deleted_at`), (b) blocks the owner's restore UPDATE and purge DELETE, and (c) kills the Decision-5 owner Trash view, which reads trashed rows via direct supabase-js. Correct scope: add `deleted_at IS NULL` only to the non-owner SELECT policies (`_org_member_select`, `_curator_select`, `_library_grant_select`; also review `_curator_update`). Owner sees their own trash by design — that IS the `include_deleted` read path. Same rule for `kg_chunks`: its 6 policies are SELECT-only so gating is safe, but if `kg_chunks_owner_select` is gated, the trash surface must never need owner chunk reads (it lists docs, so fine).

**V3 (Phase 3.1 contradiction): "earliest non-deleted sibling" vs Decision 3 / Phase 3-4 verify "newest live sibling".** Decision 3 wins: repoint to the NEWEST live sibling.

**V4 (Phase 3.2 is a no-op as described):** `pdf_set_canonical_bridge` writes only `WHERE canonical_processed_document_id IS NULL` — after a NULL reclaim, re-ingest already repoints. Keep 3.2 only as "verify bridge + new 3.1 trigger don't fight" (bridge fires AFTER INSERT; 3.1 fires AFTER UPDATE OF deleted_at — disjoint events, no conflict expected).

**V5 (verified gate state):** `can_read_processed_document` / `can_curate_library_document` check only `data_store_members.deleted_at`, never the doc's own `deleted_at`/`archived_at` — Phase 2.2 needed exactly as written. Also `trg_processed_documents_file_assoc` already fires on `UPDATE OF deleted_at` (associations sync self-heals — no work needed).

**V6 (Phase 2.4 additions — aidream read paths the spec missed):**
- `browse.py` chunk/embedding count aggregations `:714`/`:724` filter NEITHER `valid_to` NOR `deleted_at` (worse than spec stated — they count superseded chunks today).
- `rag_tool.py` parent fetch is `:261` (primary fetch `:222` and `:252` are `valid_to`-guarded; only the parent fetch is naked).
- `document_content_tool.py` real defs: `_document_visible` :165, `_document_source_file_id` :177, `_rep_text` :196, `_rep_pages` :263, `_rep_knowledge_assets` :311; `document_search_tool.py` `_resolve_visible` :174; `list_library_documents` def :310 (filter at :345-346). Minor drift only — targets unchanged.
- Hard-delete twins already exist for Phase 1.3: `ingestion.py:1794 purge_source_artifacts` (+ `delete_source_artifacts`) — extend/reuse, don't reinvent.

**V7 (Phase 4 additions — FE read paths the spec missed; same fix class):**
- `features/pdf-extractor/studio/hooks/usePdfStudioDocs.ts:131-142` — studio list filters `archived_at` only, not `deleted_at`.
- `features/pdf-extractor/hooks/usePdfExtractor.ts:330-342` — `loadHistory` same gap (single-doc load :202-211 is guarded).
- `features/pdf-extractor/hooks/useDocumentLineage.ts:94-98` — `fetchProcessingChildren` has NO guard at all (parents/file-lineage reads are guarded).
- `features/notes/hooks/useNoteIngestStatus.ts:47-51` — `archived_at` only (source_kind='note', outside file cascade, still leaks direct doc soft-delete).
- Parent-doc-blind `processed_document_pages` reads (pages have no own `deleted_at`; each needs a guarded parent resolve OR relies on Phase 2.3 RLS): `features/pdf/scanner/processing.ts:38,46,92,165`, `features/rag/components/source-inspector/usePageBundle.ts:73`, `features/rag/hooks/usePageVerificationSummary.ts:89`, `features/page-extraction/hooks/useChunkPreview.ts:117`, `features/pdf-extractor/studio/PdfStudioReader.tsx:1613`, plus the spec's `useProcessedDocumentPages.ts:124-130`.
- Low-severity: `features/files/redux/converters.ts:131,148,193` maps `canonical_processed_document_id` → war-room `hasExtraction` boolean; goes stale-true until Phase 3 repoints. No action beyond Phase 3.

**V8 (Decision 5 scope-check): there is NO existing trash surface for library/processed documents** — only cloud-files has one (`app/(a)/files/trash`, and its restore UI is itself unwired per `CLOUD_FILES_RPC_DISPOSITIONS.md:88`). The Decision-5 Trash view is a net-new build; plan it as its own phase-5.5 work item, reusing the cloud-files trash patterns.

**V9 (Phase 6.2 confirmed): `archive_processed_document` (dedup_service.py:912) sets only `archived_at` on the doc — chunks stay fully live in all 3 recall lanes.** Archived ≠ hidden today; Phase 2's chunk filter does NOT fix archive (chunks of archived docs have no marker at all). 6.2 must stamp `kg_chunks.deleted_at` on archive (or add an archived-doc join guard) — as written, but now confirmed-required, not speculative.

# Wave A — Soft-Delete Implementation Spec (single build order)

Verified premise correction driving everything below: **`rag.kg_chunks` has NO `deleted_at`** (only `valid_from/valid_to`). `valid_to` = bitemporal *supersession* (used by reprocess/replace), NOT deletion — reusing it conflates delete with supersede and breaks restore (a `valid_to IS NOT NULL` restore resurrects superseded chunks). RAG search + every `kg_chunks` RLS policy gate on `c.valid_to IS NULL` only and never join `docproc.processed_documents`. So a doc-only `deleted_at` flip leaks 100% of chunk content. The spec adds a **dedicated `kg_chunks.deleted_at`**, propagates it to every read, keeps chunk ROWS (so the embeddings ON-DELETE-CASCADE never fires), and routes all three lifecycles through one authority.

---

## DECISIONS FOR ARMAN (blocking — do not decide in code)

1. **Chunk hide marker**: recommend a NEW `rag.kg_chunks.deleted_at` (not reusing `valid_to`) because `valid_to` already means supersession. Confirm before schema work.
2. **Per-derivation deletion of the CANONICAL extract while the file lives** — allowed, or must canonical-doc removal only happen via the file path? (Affects whether `delete_library_document` may target an `initial_extract`.)
3. **Canonical repoint policy** on soft-delete of the canonical extract: (a) immediately repoint `files.canonical_processed_document_id` to the newest live sibling, or (b) leave file "un-extracted" until restore? Restore reconciliation differs per choice.
4. **`delete_library_document_and_source` (/full "Delete file")** semantics: soft-delete the **whole file family** as one set, or just this doc + soft-delete the file? (Currently hard-erases derivations + members.)
5. **Trash/restore UI**: is a trashed doc viewable in an owner-only trash surface (`include_deleted` flag), or fully invisible until restored?

Everything below assumes: (1) new `deleted_at` column, (3a) immediate repoint, (4) whole-family. Adjust Phase 3/5 if Arman chooses otherwise.

---

## PHASE 0 — Schema foundation (DB, project `txzxabzwovsujtloxrus`)

**0.1** `ALTER TABLE rag.kg_chunks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;`
`CREATE INDEX CONCURRENTLY IF NOT EXISTS kg_chunks_live_idx ON rag.kg_chunks (processed_document_id) WHERE deleted_at IS NULL AND valid_to IS NULL;`
Regenerate: `python db/generate.py` (aidream ORM `KgChunks`), `pnpm db-types` (FE).

**Verify**: `SELECT column_name FROM information_schema.columns WHERE table_schema='rag' AND table_name='kg_chunks' AND column_name='deleted_at';` → 1 row.

Dependency: nothing. Everything downstream references this column.

---

## PHASE 1 — One lifecycle authority, per-`processed_document` scoped (aidream + matrx-rag)

The only shipped soft-delete/restore primitives are FILE-keyed (`ingestion.py:1744` `soft_delete_source_artifacts`, `:1773` restore) and would trash/restore ALL sibling derivations of a file. Library deletion is per-`processed_document_id`. Build the missing granularity.

**1.1 New matrx-rag primitives** — `packages/matrx-rag/matrx_rag/ingestion.py`:
- `soft_delete_document_artifacts(processed_document_id)` → `UPDATE rag.kg_chunks SET deleted_at=now() WHERE processed_document_id=X AND deleted_at IS NULL` (leave `valid_to` untouched). Do NOT touch `data_store_members` (file-keyed) unless the file itself is being trashed.
- `restore_document_artifacts(processed_document_id)` → `... SET deleted_at=NULL WHERE processed_document_id=X`.
- `purge_document_artifacts(processed_document_id)` → the ONLY path that runs the real `.delete()` on chunks/pages/doc (embeddings cascade off chunk FK, intended here). Reuse/extend the existing purge twins `purge_source_artifacts`/`delete_source_artifacts` (`ingestion.py:1794+`).

**1.1b (V1 — mandatory):** convert the FILE-keyed `soft_delete_source_artifacts` (:1744) and `restore_source_artifacts` (:1773) from `valid_to` to the new `kg_chunks.deleted_at`. Today restore CLEARS `valid_to`, resurrecting superseded chunks — the exact conflation this spec forbids. Restore must clear only `deleted_at`.

**1.2 Wrap in `source_lifecycle`** — `aidream/services/documents/source_lifecycle.py`: add a doc-level entry (`source_kind='processed_document'`) so all callers use one authority. Keep the file-keyed path for `cld_file` cascade only.

**1.3 Convert the three library funcs** — `aidream/services/rag/library_queries.py`. Replace every `KgChunks…delete()`, `ProcessedDocumentPages…delete()`, `ProcessedDocuments…delete()` with `deleted_at` stamps via 1.2:
- `delete_library_document` :927, :931 (pages, doc)
- `bulk_delete_library_documents` :1036, :1040
- `delete_library_document_and_source` :1248, :1249, :1252 — and **soft-delete** `DataStoreMembers` (:1257-1260) via its existing `deleted_at` (`models_rag.py:454`) instead of hard `.delete()`; reverse on restore.

Critical: the doc row MUST become `UPDATE` — `docproc.processed_documents → rag.kg_chunks` FK is `ON DELETE CASCADE`, so a doc `.delete()` nukes chunks (and embeddings) regardless of the chunk line.

**Verify**: after soft-delete of doc D, `SELECT count(*) FILTER (WHERE deleted_at IS NULL) live, count(*) total FROM rag.kg_chunks WHERE processed_document_id='D';` → live=0, total unchanged; embeddings row count unchanged. Restore → live back to total.

Dependency: Phase 0.

---

## PHASE 2 — Close EVERY read surface (the leak surface)

`list_library_documents` (`library_queries.py:346`) is today the ONLY surface filtering `deleted_at`. Propagate.

**2.1 RAG search — 3 recall lanes + RLS** (matrx-rag `search.py`):
- Add `AND c.deleted_at IS NULL` to `_vector_recall` (:1389), `_lexical_recall` (:1489), entity/parent-expansion (:1709). The file-ACL visibility clause (`_build_visibility_clause` :1213) stays as-is.
- Add `deleted_at IS NULL` to every `rag.kg_chunks` SELECT RLS policy (`kg_chunks_owner_select`, `_org_member_select`, `_cld_share_select`, `_note_share_select`, `_global_library_select`, `_library_grant_select`).
- Fix unguarded parent fetch `rag_tool.py:~260` (applies neither `valid_to` nor ACL) — add both `deleted_at IS NULL` + ACL.

**Verify**: soft-delete D, run vector+lexical+entity search over its file → 0 hits from D; restore → hits return. `rag_get_chunk(chunk_id_of_D)` → not found while trashed.

**2.2 Central SECURITY DEFINER gate** — `public.can_read_processed_document` (and `can_curate_library_document`): add `AND d.deleted_at IS NULL AND d.archived_at IS NULL`. Provide a `purge`/`include_deleted` variant for the trash/restore surface only. This single change closes context_sources hop-1, resolver describe/materialize, curator + grant read paths.

**2.3 `processed_documents` RLS** (REWRITTEN per V2): add `AND deleted_at IS NULL` to the non-owner SELECT policies only — `_org_member_select`, `_curator_select`, `_library_grant_select` (review `_curator_update` too). **NEVER gate `_owner_all`** — it's `cmd=ALL`; gating it 42501s the soft-delete UPDATE itself, blocks restore/purge, and kills the owner Trash view (owner-sees-own-trash IS the Decision-5 `include_deleted` path).

**2.4 aidream tool/query read paths** — add `deleted_at__isnull=True` (or `.alive()`) at each:
- `document_content_tool.py`: `_document_visible` :173, `_document_source_file_id` :181, `_rep_text` :204, `_rep_pages` header :266; page reads :221-227/:270 resolve parent doc header with `deleted_at__isnull=True` first (pages have no own `deleted_at`). Same in `_rep_knowledge_assets`.
- `document_search_tool.py`: `_resolve_visible` :178 → `filter(id__in=…, deleted_at__isnull=True)` (closes both string lane :199-206 and semantic source_ids in one spot).
- `library_queries.py` shared gate `_LIBRARY_READ_GATE` :43 → `(deleted_at IS NULL AND (owner_id=$1 OR can_read_processed_document(id,$1)))`. Closes `get_library_document` :464/:493, `get_library_full_page` :765, `list_library_chunks` :819, `test_search_library_document` :1144, `get_library_reprocess_source` :1127.
- `library_summary` owner scans :676-677, :732 and `bulk_delete` status recompute :984 → add `deleted_at__isnull=True`.
- `browse.py` `list_data_store_members_rich`: `ProcessedDocuments.filter(id__in=…)` :690, canonical `pd_by_source` :657-663/660-672, pd_candidates fallback :675-681, and all page/chunk/oai count aggregations :706-728 → `deleted_at__isnull=True`.
- `writes.py` `read_file_extraction` (backs `file_read_tool.py`): hop-2 :302 and hop-3 pages :341 → `deleted_at__isnull=True`; hop-1 Files `.alive()`.
- `context_sources.py` `_canonical_processed_documents_for_files` hop-1 :338-344 (only hop-2 :354 filters today) and stored_pd path :498-501 → gate before seed.

**Verify (per surface)**: soft-delete D, hit each endpoint/tool by id → 404 / `has_extraction=False` / not in listing; restore → returns. One integration test per bullet.

Dependency: Phase 0 (column) + Phase 1 (something actually sets the marker).

---

## PHASE 3 — Canonical pointer integrity (DB triggers)

`files.canonical_processed_document_id` is first-writer-wins (`pdf_set_canonical_bridge`, AFTER INSERT, `WHERE … IS NULL`) and the FK is `ON DELETE SET NULL` (fires only on hard-delete). Soft-delete leaves it aimed at a trashed doc; purge SET-NULLs it forever and never reclaims.

**3.1** New trigger `AFTER UPDATE OF deleted_at ON docproc.processed_documents`: for `derivation_kind IN ('initial_extract','legacy_import')` + `source_kind='cld_file'`, recompute `files.canonical_processed_document_id = NEWEST non-deleted sibling for that source_id` (NULL if none; per Decision 3 / V3). Symmetric — covers soft-delete AND restore.

**3.2** Make `pdf_set_canonical_bridge` tolerant of NULL reclaim on re-ingest (drop the strict first-writer guard for the NULL-reclaim case).

**3.3 PURGE family-aware**: purge resolves all `(source_kind='cld_file', source_id=file)` siblings and hard-deletes as one atomic set (then NULL pointer is correct), OR promotes a surviving sibling + repairs `parent_processed_id`/`canonical_clean_id` in the same tx.

**Verify**: soft-delete canonical extract of F → `SELECT canonical_processed_document_id FROM files.files WHERE id='F'` points at newest live sibling (or NULL). Restore → points back. Purge family → file un-extracted, no dangling siblings.

Dependency: Phase 1 (soft-delete sets `deleted_at` the trigger reacts to).

---

## PHASE 4 — FE resolver (matrx-frontend)

`resolveCanonicalProcessedDocumentId` (`features/files/api/document-lookup.ts:131-142`) returns the raw pointer without validating the target's `deleted_at`; `usePdfSurfaceLinks.resolveIds` (`features/pdf/hooks/usePdfSurfaceLinks.ts:82-85`) trusts it → serves a trashed doc, while `lookupFileDocument` self-heals.

**4.1** In `resolveCanonicalProcessedDocumentId`, verify the canonical target's `deleted_at IS NULL` (join/check `docproc.processed_documents`); return `null` when trashed. Both callers already fall through to their `deleted_at`-filtered newest-doc query → one canonical answer.
**4.2** Defense-in-depth: `fetchProcessedDocumentPages` (`useProcessedDocumentPages.ts:123-130`) add `deleted_at` guard.

**Verify (browser)**: soft-delete canonical D of F; open a PDF surface for F → renders newest live sibling, never D.

Dependency: Phase 3 (or independent if 3a repoint chosen — still add the guard).

---

## PHASE 5 — Collapse cascade authorities + atomicity

Two authorities write different state: FE trigger `cascade_file_softdelete_to_processed_documents.sql` sets only `processed_documents.deleted_at`; aidream `source_lifecycle` also sets `valid_to`/`data_store_members`. Restore trigger keys on `metadata.deleted_via='file_cascade'` — a marker lifecycle rows never carry. Chunk-hide runs as fire-and-forget `detached_task` (`source_lifecycle.py:39-51`) whose `_run_logged` :27-36 swallows errors → doc marked deleted, chunks live.

**5.1** Make `source_lifecycle` the SOLE authority for `processed_documents` soft-delete/restore/purge (it already owns the full column set). Either delete the FE trigger and make file endpoints the sole caller for `cld_file`, OR extend the trigger to also set `kg_chunks.deleted_at` + `data_store_members.deleted_at` so it is a true inverse. Recommend: collapse onto `source_lifecycle` (valid_to/rag.* is matrx-rag-owned).
**5.2** Make chunk-hide **transactional** with the doc-stamp (same tx; fail the delete on chunk-hide error) — not best-effort async. If async is unavoidable, add defense-in-depth: gate the search `cld_file` owner clause (`search.py:1270`) on `files.files.deleted_at IS NULL` so a stranded live chunk of a soft-deleted file is never retrievable regardless of marker.
**5.3** Fix the restore trigger's `deleted_via='file_cascade'` gate so it restores lifecycle-deleted rows too (or drop the trigger per 5.1).

**Verify**: soft-delete a file via BOTH entry points → identical DB state (`deleted_at` on doc + chunks + members). Kill the process mid-delete → no state where doc.deleted_at set but chunk live-and-searchable.

Dependency: Phases 1–2.

---

## PHASE 6 — Reprocess / replace / archive coherence

**6.1 Reprocess tombstone-aware** (matrx-rag `ingestion.py`): `_existing_chunks_by_sha` must ignore/clear the hide marker so a rebuild of an identical file re-activates chunks. In the reuse-update block (~:835-855) set `deleted_at=NULL` on re-affirmed chunks, OR have `ingest_source` call `restore_document_artifacts` in the ingest tx. Otherwise a soft-delete→reprocess yields a doc that reports success but stays invisible.
**Verify**: soft-delete D → reprocess identical file → chunks return `deleted_at IS NULL`, search-visible.

**6.2 Replace/archive atomic retirement**: `archive_processed_document` (`dedup_service.py:912`) and `set_canonical_extract` replace path must retire the old extract's chunks (`kg_chunks.deleted_at=now()` scoped by `processed_document_id`, NOT `source_id`) in the same tx as the canonical repoint. Add recall guard OR rely on the `deleted_at` filter from Phase 2. Restore reverses by `processed_document_id`.
**Verify**: replace E1→E2 on file F → search returns only E2 chunks, never E1; both no longer double-count.

**6.3 bulk status-mode scope** (`library_queries.py:983-1027`): filter `parent_processed_id IS NULL` (top-level only, mirror the list) + family-aware (a derivation removed only when its parent is) + `deleted_at__isnull=True`. Never soft-delete a derivation whose parent stays live.

Dependency: Phases 0–2.

---

## VERIFICATION MATRIX (the acceptance gate)

For a doc D over file F with chunks+embeddings, after soft-delete assert ALL return empty/blocked, and after restore assert ALL return:

| Surface | Query/Test |
|---|---|
| RAG vector/lexical/entity | 0 hits from D's chunks (search.py 3 lanes) |
| `rag_get_chunk` / neighbor | not found (rag_tool.py) |
| `document_content` | `has_extraction=False` |
| `document_search` string+semantic | 0 D hits |
| library detail/pages/chunks/test-search/reprocess-source | 404 |
| library list + summary counts | D absent, counts exclude D |
| data-store browse + counts | D absent |
| `file_read` / read_file_extraction | no D body |
| agent context seed (canonical + stored_pd) | D not injected |
| direct supabase-js read (RLS) | D not returned |
| FE PDF surfaces | newest live sibling, not D |
| embeddings row count | UNCHANGED through soft-delete+restore |
| canonical pointer | repointed live / restored |

Plus: only `purge` produces any `.delete()`; `pnpm db-types` + `python db/generate.py` regenerated; both repos commit together.

**Build order (dependency): 0 → 1 → 2 → (3 ∥ 4) → 5 → 6.** Phase 2's central `can_read_processed_document` gate + the new `kg_chunks.deleted_at` filter in the 3 search lanes/RLS are the two highest-leverage single changes — they close the majority of read leaks at one choke point each.

Key file anchors: matrx-rag `search.py:1389/1489/1709`, `ingestion.py:1744/1773`; aidream `library_queries.py:43/346/927/1036/1248`, `writes.py:302`, `context_sources.py:338`, `document_content_tool.py:204`, `document_search_tool.py:178`, `rag_tool.py:222/260`, `browse.py:690`, `source_lifecycle.py:39/129`; DB `can_read_processed_document`, `pdf_set_canonical_bridge`, `cascade_file_softdelete_to_processed_documents.sql`; FE `document-lookup.ts:131`, `usePdfSurfaceLinks.ts:82`.