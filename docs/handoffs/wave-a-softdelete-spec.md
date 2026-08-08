---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: [see "Vision — Arman's words" below; original full spec + build history in git: `git log --oneline --grep=wave-a -i` in BOTH repos, and this file's history]
---

# Wave A — document/RAG soft-delete: finish the edges

The build is DONE, live in the DB, and **deployed in both repos** (prod aidream serves the wave-a commits). What remains is one untested path, one missing purge path, and one retention decision. Read Vision first; it is the contract every follow-up must preserve.

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

1. **Merge + ship branch `claude/wave-a-finish`** (PR #50, this repo): the functional `/files/trash` surface (hydration + restore + delete-forever) and `rag.fn_purge_library_file` (live in DB, ledgered). Merge to `main`, run `./scripts/release.sh`.
2. **Deploy aidream** — `origin/main` carries the purge-from-trash 404 fix (`delete_file` now resolves trashed files, commit 94510c37d); prod still serves an older SHA, so "Delete forever" on a file currently fails with an honest "File not found" toast and rolls back. After deploy, re-run the purge flow on `/files/trash` and confirm the row + S3 bytes go away.
3. **Bulk trash ops** — BulkActionsBar is hidden in trash; multi-select Restore / Delete forever is a follow-up (see also the files-surface value-mapping chip already spawned for Arman).
4. **Mobile `/files/trash` is the generic browser, not a trash view** — `PageShell` returns `MobileStack` before any trash logic and `MobileStack` has no section handling. Give it a trash mode consuming the same `loadTrash`/`restoreFile`/`purgeFile` thunks (chip spawned).
5. **Realtime echo can vanish a row from an open trash view** — `realtime-middleware.ts:375-378` dispatches `removeFile` on ANY update echo carrying `deletedAt`, including while the user sits on `/files/trash` (self-heals on re-entry). Fix belongs in a `supabase-realtime`-skill pass over that middleware (chip spawned); don't patch it casually.
6. **Trash has no retention/auto-purge** — deliberate for now (see Decisions). The old fictional "purged after 30 days" copy was removed; don't add a policy without the decision below.

Known traps for whoever picks this up: (a) never clear `valid_to` on restore — that resurrects superseded chunks; (b) never add `deleted_at` filters to `processed_documents_owner_all` or any authenticated UPDATE policy (42501 class, fixed platform-wide 2026-07-04); (c) parallel agent sessions rewrite `main` constantly — rebase, don't assume; (d) the DB is already migrated — a `.sql` file edit does nothing until re-applied via Supabase MCP + ledger update.

## Done

- Phase 0-1 — `kg_chunks.deleted_at` + doc/file lifecycle authority, `valid_to`→`deleted_at` conversion — `packages/matrx-rag/matrx_rag/ingestion.py`, `aidream/services/documents/source_lifecycle.py`.
- Phase 2 — every read surface gated (search lanes, RLS ×6, gate fns, ~25 ORM sites incl. 7 found by adversarial round 1) — `migrations/wave_a_softdelete_read_surfaces.sql` + aidream tools/services.
- Phase 3 — canonical repoint triggers (soft-delete/restore/purge → newest live sibling) — `migrations/wave_a_canonical_repoint.sql`.
- Phase 4 — FE resolver + V7 read-site guards — `features/files/api/document-lookup.ts` and friends.
- Phase 5 — one transactional cascade authority on `files.files`, marker-gated restore — `migrations/wave_a_cascade_true_inverse.sql`.
- Phase 5.5 — owner Trash surface (list/restore/purge, family lock) — `LibraryTrashSheet.tsx` + `migrations/wave_a_library_trash_rpcs.sql`; browser-verified.
- Phase 6 — reprocess re-activates chunks; archive/replace retire chunks; bulk delete top-level only — `ingestion.py`, `dedup_service.py`.
- Capstone — BEFORE DELETE guard live + purge pre-stamping; FE hard-delete RPCs converted (adversarial catch: Python conversion alone left the FE RPCs hard-deleting).
- Two full adversarial passes — all findings fixed or recorded as V10.
- Shipped to prod — both repos pushed and deployed (aidream `/health/version` serves the wave-a commits); FE API types regenerated (`LibraryDeleteResponse.skipped_canonical` is in `types/python-generated/api-types.ts`).
- Multi-sibling canonical repoint E2E-verified (2026-08-08, rollback-only fixture: insert→D1, soft-delete canonical→D2 newest-live, restore→stays newest-live, delete both→NULL).
- Family purge built + tested — `rag.fn_purge_library_file` (owner gate, belt-stamp, live; `migrations/wave_a_purge_library_file.sql`) + `/files/trash` made functional (it rendered "empty" forever — deleted rows never reached Redux): `loadTrash`/`restoreFile`/`restoreFolder`/`purgeFile`/`purgeFolder` thunks, trash-mode row menus, honest empty-state copy — browser-verified E2E on branch `claude/wave-a-finish`.
- Rollback crash class killed — `toCloudFilePartial` strips immer-frozen runtime fields before re-upsert (features/files/redux/thunks.ts).

## Decisions needed (Arman)

1. **Situation:** Trashed library documents currently stay in the trash forever; nothing auto-purges them, and chunks/embeddings keep their storage. **Decide:** retention policy — (a) keep forever until manual purge (current), (b) auto-purge after N days (30?), or (c) auto-purge only when storage pressure. If (b)/(c), a cron + the existing purge authority is all that's needed.
2. **Situation:** Family purge now lives in the files trash (`/files/trash` → row menu → "Delete forever" purges the document family + the file + S3) — implemented per the recommended option since it follows the files doctrine; noted as an assumption. **Decide (only if you disagree):** should the library Trash sheet's family rows ALSO offer purge, or stay restore-only (current)?
