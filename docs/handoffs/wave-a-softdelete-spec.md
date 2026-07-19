---
status: active
updated: 2026-07-18
repos: [matrx-frontend, aidream]
vision: [see "Vision — Arman's words" below; original full spec + build history in git: `git log --oneline --grep=wave-a -i` in BOTH repos, and this file's history]
---

# Wave A — document/RAG soft-delete: deploy, verify, finish the edges

The build is DONE and live in the DB + committed in both repos (unpushed local commits on `main` in each). What remains is deploy + prod verification + a few scoped follow-ups. Read Vision first; it is the contract every follow-up must preserve.

## Vision — Arman's words

Origin: "a spec that was created to address our many issues with files and the extremely expensive processing we have." Reprocessing is expensive — deletes must never silently destroy chunks/embeddings; hard-delete is a deliberate, separate act.

His six decisions (verbatim, 2026-07-17):

1. **Chunk hide marker** — NEW `rag.kg_chunks.deleted_at` (do NOT reuse `valid_to`; it means supersession).
2. **Delete canonical extract directly — BLOCKED.** The `initial_extract` is only removable via the file path (delete/reprocess the file). Per-derivative delete is allowed for non-canonical derivations.
3. **Canonical repoint on soft-delete** — immediately repoint `files.canonical_processed_document_id` to the newest live sibling (NULL if none); symmetric on restore.
4. **"Delete file"** — soft-delete the WHOLE file family as one set (file + derivations + memberships), restore together.
5. **Trash surface** — owner-only Trash view (view + restore + purge) via an `include_deleted` read path.
6. **THE INVARIANT (load-bearing):** there is NO `active → deleted` path. Lifecycle is strictly **active → soft-deleted → deleted**. Hard-delete (purge) is reachable ONLY from the Trash view, on a row that is ALREADY soft-deleted. Enforced at the DB by a `BEFORE DELETE` guard.

(inferred, from Decision 4) A family member can't be purged individually either — the family is purged together via the file. The purge RPC + UI enforce this.

Documented deviation (V10, accepted by adversarial review): the BEFORE DELETE guard exists on `docproc.processed_documents` only, NOT on `rag.kg_chunks` — authenticated users are SELECT-only on chunks, and service-role rebuild machinery (reingest/derivation) legitimately delete-and-reinserts chunks inside transactions. Rationale recorded in `migrations/wave_a_before_delete_guard.sql`.

## Resources

- **The two markers:** `deleted_at` = trash (restorable); `valid_to` = bitemporal supersession (never cleared by restore). Every read path filters BOTH.
- **DB (all live, project `txzxabzwovsujtloxrus`):** migrations `migrations/wave_a_*.sql` (6 files, ledgered in `public._schema_migrations`, source `matrx-frontend`). Live objects: `_guard_harddelete` + `trg_canonical_repoint_on_softdelete` + `trg_canonical_repoint_on_delete` on `docproc.processed_documents`; `_cascade_softdelete_documents` on `files.files` (true inverse: docs + chunks + members, marker-gated restore via `metadata.deleted_via='file_cascade'`); RPC family `rag.fn_list_library_trash / fn_restore_library_document / fn_purge_library_document / fn_delete_library_document / fn_bulk_delete_library_documents / fn_delete_library_document_and_source`; gate fns `public.can_read_processed_document` (+`_any` trash variant), 6 `rag.kg_chunks` RLS policies gate `valid_to`+`deleted_at`; `processed_documents_owner_all` is deliberately UNGATED (owner-sees-own-trash IS the include_deleted path; gating cmd=ALL would 42501 the soft-delete UPDATE — the platform's known RLS class).
- **FE:** Trash UI `features/rag/components/library/LibraryTrashSheet.tsx` (opens from `/rag/library` header); delete flows call the `rag.fn_*` RPCs (never Python, never hard delete); resolver guards in `features/files/api/document-lookup.ts`, `features/pdf/hooks/usePdfSurfaceLinks.ts` + the V7 read sites (pdf-extractor studio/history/lineage, notes ingest status, pages hooks).
- **aidream:** lifecycle authority `aidream/services/documents/source_lifecycle.py` (doc-level + file-level soft/restore/purge; purge pre-stamps `deleted_at` to satisfy the guard); matrx-rag primitives `packages/matrx-rag/matrx_rag/ingestion.py` (`*_document_artifacts`, `*_source_artifacts`); search filters in `packages/matrx-rag/matrx_rag/search.py` (3 lanes + leaf predicate); converted library funcs `aidream/services/rag/library_queries.py`; gated tools `aidream/tools/{document_content,document_search,rag}_tool.py`, `services/rag/{browse,writes,context_sources,admin_queries}.py`; Phase 6 coherence in `ingestion.py` (sha-reuse clears `deleted_at`) + `dedup_service.py` (archive/replace retire chunks).
- **Test:** `http://localhost:3000/login` → `admin@admin.com` / `Password1234#` → `/rag/library` (Trash = trash-can icon in header). Verification matrix = the table in this file's git history (`git show 33ebe8345:docs/handoffs/wave-a-softdelete-spec.md`).
- **Docs:** `features/rag/FEATURE.md` (trash lifecycle section + Change Log). Skills: `type-safety`, `finalize-and-ship`, `db-change` if touching DDL.

## Remaining work (priority order)

1. **Deploy aidream to prod, then re-verify server-side surfaces.** Until deployed, prod search/tools rely on RLS + RPCs only (safe but belt-less), and prod library deletes still run the OLD hard-delete Python code — this is the one dangerous gap. Deploy, then against prod spot-check: soft-delete a doc → vector/lexical/entity search return 0 hits from it; `document_content` reports `has_extraction=False`; library list/summary exclude it; restore reverses all. Ship the FE release in the same window (release.sh).
2. **Regenerate FE API types after deploy:** `pnpm sync-types` (picks up `LibraryDeleteResponse.skipped_canonical` etc. from the OpenAPI). Until then FE ignores the new field — harmless.
3. **Multi-sibling canonical repoint is untested end-to-end.** No file in the live DB had 2+ extract siblings, so "repoint to NEWEST live sibling" was verified only by reading `recompute_canonical_for_file`. Create a fixture file with two `initial_extract` siblings, soft-delete the canonical, assert the pointer moves to the newest LIVE sibling (not NULL), restore, assert it returns.
4. **File-family purge path (trash-empty) does not exist.** Family-trashed docs are restore-only today (per-doc purge correctly raises). Build "purge file family": a `rag.fn_purge_library_file(p_file_id)` that verifies the file is trashed + owned, then purges every family doc (pre-stamp is already there) + the `files.files` row + storage sweep hook, surfaced from the files trash UI (`app/(a)/files/trash` — note its restore UI is itself listed as unwired in `features/files/CLOUD_FILES_RPC_DISPOSITIONS.md`). Keep THE INVARIANT: reachable only for already-trashed files.
5. **Trash has no retention/auto-purge** — deliberate for now (see Decisions). Don't add one without the decision below.

Known traps for whoever picks this up: (a) never clear `valid_to` on restore — that resurrects superseded chunks; (b) never add `deleted_at` filters to `processed_documents_owner_all` or any authenticated UPDATE policy (42501 class, fixed platform-wide 2026-07-04); (c) parallel agent sessions rewrite `main` constantly — rebase, don't assume; (d) the DB is already migrated — a `.sql` file edit does nothing until re-applied via Supabase MCP + ledger update.

## Done

- Phase 0-1 — `kg_chunks.deleted_at` + doc/file lifecycle authority, `valid_to`→`deleted_at` conversion — `packages/matrx-rag/matrx_rag/ingestion.py`, `aidream/services/documents/source_lifecycle.py`.
- Phase 2 — every read surface gated (search lanes, RLS ×6, gate fns, ~25 ORM sites incl. 7 found by adversarial round 1) — `migrations/wave_a_softdelete_read_surfaces.sql` + aidream tools/services.
- Phase 3 — canonical repoint triggers (soft-delete/restore/purge → newest live sibling) — `migrations/wave_a_canonical_repoint.sql`.
- Phase 4 — FE resolver + V7 read-site guards — `features/files/api/document-lookup.ts` and friends.
- Phase 5 — one transactional cascade authority on `files.files`, marker-gated restore — `migrations/wave_a_file_cascade_true_inverse.sql`.
- Phase 5.5 — owner Trash surface (list/restore/purge, family lock) — `LibraryTrashSheet.tsx` + `migrations/wave_a_library_trash_rpcs.sql`; browser-verified.
- Phase 6 — reprocess re-activates chunks; archive/replace retire chunks; bulk delete top-level only — `ingestion.py`, `dedup_service.py`.
- Capstone — BEFORE DELETE guard live + purge pre-stamping; FE hard-delete RPCs converted (adversarial catch: Python conversion alone left the FE RPCs hard-deleting).
- Two full adversarial passes (4 Sonnet rounds) — all findings fixed or recorded as V10.

## Decisions needed (Arman)

1. **Situation:** Trashed library documents currently stay in the trash forever; nothing auto-purges them, and chunks/embeddings keep their storage. **Decide:** retention policy — (a) keep forever until manual purge (current), (b) auto-purge after N days (30?), or (c) auto-purge only when storage pressure. If (b)/(c), a cron + the existing purge authority is all that's needed.
2. **Situation:** A file deleted with "Delete file" lands in the trash as a family and can only be restored — there is no way to permanently erase it and its extraction data (the per-document purge correctly refuses family members). **Decide:** where family purge should live — (a) files trash (`/files/trash`) purges the file and its whole document family together (recommended), or (b) also allow it from the library Trash sheet on the family row.
