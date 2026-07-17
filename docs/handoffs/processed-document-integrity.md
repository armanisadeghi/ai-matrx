# Handoff — processed_document / file / association integrity

Canonical model: one `files.files` binary → one canonical `initial_extract`
(`files.canonical_processed_document_id`) → many expensive derivations
(clean, `synthetic_qa`, `agent_structured_json`, `chunked_*`, `user_fork`), all
dual-anchored to the file via `source_kind='cld_file'` + `source_id`. **The
canonical pointer is the ONLY resolution rule — never "newest per source_id."**

## DONE (2026-07-17, live + committed)

- **Canonical resolution everywhere.** FE `lookupFileDocument`, `usePdfSurfaceLinks`,
  `ProcessedDocumentBody`; aidream `_canonical_processed_documents_for_files`,
  `seed_conversation_attachments` (pd-edges re-canonicalize via `metadata.file_id`),
  `rag/browse.py`. Three "newest-picker" call sites were the class; all now canonical-first.
- **Association GC on hard-delete** of `processed_documents` (was the only entity missing
  `platform._gc_entity_associations`) — no more edges pointing at vanished docs.
  Hard-delete only (soft keeps edges for restore).
- **File+derivations = one set** through soft-delete/restore (cascade trigger + marker
  `metadata.deleted_via='file_cascade'`).
- Data healed: 1 mis-pointed attach edge → canonical, 2 dangling file-edges removed,
  2 null-canonical files backfilled, 15 file-orphaned derivations reconciled.

## TODO — Wave A: never destroy expensive derivations (HIGHEST — the real catastrophe)

The AMAGuides loss (~2,400 LLM calls) was a `processed_document` **hard-delete**
(`delete_library_document`, `aidream/services/rag/library_queries.py:900,1245`) —
`.delete()` on the row + `KgChunks.delete()` (cascades embeddings). Irreversible.

- Flip document delete to **soft-delete** (set `deleted_at`; do NOT hard-delete chunks).
  BLOCKER to design first: RAG search must exclude chunks of soft-deleted docs — verify
  `matrx_rag` search joins/filters `processed_documents.deleted_at` (else soft-deleted
  content leaks into results). This is why it wasn't a one-line change.
- Restore UI + a separate, deliberate **purge** (admin/confirmed) for true hard-delete.
- Hard purge should reuse the GC trigger (already fires on real DELETE).

## TODO — Wave B: reprocess protection (Arman's detailed direction)

Reprocessing = re-running extraction/clean/RAG. Must NEVER happen unintentionally.
DB already has `processed_documents_canonical_extract_idx` (unique initial_extract per
`org/owner + source_kind + file_content_hash + extractor`) — but only when
`file_content_hash IS NOT NULL`. `STRICT_DEDUP_BACKEND` reuse is opt-in/off.

1. **Dedup on every normal UI path**: an extract/ingest for a file that already has a
   live extract is REJECTED with a structured signal (not silently re-run). Turn on the
   content-hash dedup by default; backfill `file_content_hash` where null so the unique
   index actually protects every file.
2. Client shows "already processed — pick up where you left off" and offers an explicit
   "I need to reprocess" escape → routes to a **dedicated reprocess UI**.
3. Dedicated UI = full impact analysis BEFORE anything runs: what will be **orphaned**,
   what will be **replaced**, approx job size + cost (LLM-call estimate), and a hard confirm.
4. On confirmed reprocess = **Replace**: new extract becomes canonical, old is **archived
   (soft-delete, never hard)**, and **all associations on the old canonical are migrated to
   the new one** (the orphaned-associations problem is the crux — re-associate, don't drop).
5. Most flows should favor **resume/"pick up where we left off"** over redo.

## TODO — Wave C: attach stores a file-edge, not a frozen pd-edge (Arman approved, with guards)

Today attach freezes `processed_document → conversation`; read paths now heal it, but the
stored pointer can still drift. Switch attach to write `file → conversation` and resolve
canonical at read time (one language everywhere).

Hard guards (Arman):
- **Must remain LAZY** — "in context / available to the agent on request" must NOT fetch or
  cache the bytes. A 120GB file in context is a pointer, never a download. aidream already
  seeds lazy `ContextObject`s (`content=None`); preserve that exactly.
- Must trigger the **same downstream server behavior** as the current pd-edge attach.
- Must work with the new `PdfNamedSurfaceSwitcher` / `ProcessedDocumentTitle` drawer.
- Migrate existing `processed_document → conversation` edges → `file → conversation`
  (keep `representation` in metadata).

## Guard/verify queries (all should read 0)

```sql
-- dangling pd/file edges; canonical drift; conv-attach pointing at non-canonical
-- see the session that shipped this for the full battery
```
Add these to `lib/integrity/checks.ts` (admin integrity surface) so drift is visible.
