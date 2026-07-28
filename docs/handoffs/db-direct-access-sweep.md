---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
---

# DB-direct-access sweep — kill remaining "Python HTTP as a DB proxy" call sites

Arman's rule (root `CLAUDE.md`): the React client goes **direct to Supabase** for all data
(reads/writes/search/listings/CRUD via `supabase-js` + RLS + `SECURITY DEFINER` RPCs where needed).
Python (`aidream`) is for genuine work the browser can't do — LLM/AI, heavy processing, file bytes,
URL signing, an auth/anon boundary. A plain DB read/write routed through Python is pure waste and,
per this campaign's own findings, an extra unaudited surface.

## The conversion recipe (every item below)

1. Add a `SECURITY DEFINER` function (or an RLS policy, if a plain `.from()` suffices) keyed on
   `auth.uid()` **only** — never a client-supplied actor/user param. That exact shape is the
   vulnerability class this campaign already found twice (`rag.library_grant_*` trusted a
   caller-supplied `p_actor` and two were `EXECUTE`-granted to `anon`).
2. Apply the change with the Supabase MCP (project `txzxabzwovsujtloxrus`); mirror into
   `packages/matrx-rag/matrx_rag/migrations/` if it touches `rag` tables.
3. Rewrite the hook/service to call it via `supabase-js` (`ragDb()` / `codeDb()` / `iamDb()`
   helpers in `utils/supabase/`).
4. `pnpm db-types`.
5. **Live-verify against real rows** — `SET LOCAL ROLE authenticated` + a real user's JWT claims,
   an owner case AND a denied case. A "looks right" SQL function is unshippable until it's run;
   the first pass of this campaign shipped a `WITH CHECK` gap and a grant-visibility bug that only
   live verification caught.
6. Adversarially review before shipping.

## Remaining work

1. **`features/rag/api/document.ts`** — `GET /document/{id}`, `.../lineage`, `.../pages`,
   `.../page/{n}`, `.../chunks` still go through `apiGet`/`buildPath` (the typed OpenAPI client).
   NOT `pageImageUrl` — that's a legitimate signed-URL redirect, leave it. Read
   `aidream/api/routers/document.py` for the actual read gate before designing; it is probably
   `_LIBRARY_READ_GATE`-shaped (owner OR `public.can_read_processed_document`) but don't assume.
   Check whether one shared chunks function can also serve any other chunk reader.

2. **`features/rag/hooks/useLibrary.ts` — `useLibraryDoc` only.** Still hits `GET /rag/library/{id}`
   via the typed client; the file's own header names it as the deliberate remaining gap. The rest
   of the file is already direct (`public.rag_library_list` / `rag_library_summary_totals`).
   Follow that same `public.rag_library_*` naming convention here, not the `rag.fn_*` one.

3. **Files — folder + file metadata CRUD.** `features/files/api/folders.ts` (`listFolders`,
   `createFolder`, `patchFolder`, `deleteFolder`, `bulkMoveFolders`) and the metadata half of
   `features/files/api/files.ts` (`listFiles`, `getFile`, `getFileTree`, `patchFile`, `deleteFile`,
   `renameFile`, `copyFile`, `bulkDeleteFiles`, `bulkMoveFiles`, `listTrash`, `restoreFile`,
   `searchFiles`) plus their `features/files/redux/thunks.ts` callers.
   **NOT offenders — leave on Python:** anything moving bytes or signing (`uploadFile`,
   `downloadFile`, `getSignedUrl`, `/assets`).
   **Do this one with care, not speed.** `folders.ts` carries four explicit "left on the raw
   client" comments documenting real contract-vs-DB-row disagreements (`CreateFolderRequest` lacks
   `folder_name`/`parent_id`; `FolderRecord` ≠ `CloudFolderRow`; `BulkResponse.results[].error`
   optional vs required) — those are latent bugs the conversion must resolve, not inherit.
   Read `aidream/services/files/` for the exact ownership/ACL predicate first. This deserves its
   own pass and its own adversarial review, not a tail end of a batch.

## Resolved — NOT offenders (no action)

- **`features/kg-graph/service/kgGraphService.ts`** (`GET /kg/graph`, `.../entity/{id}/mentions`) —
  `aidream/services/knowledge_graph/graph.py` is a bounded-hop `WITH RECURSIVE` traversal with a
  visibility predicate baked into every recursion step, not a filtered `SELECT`. That counts as
  real processing. Porting a 488-line graph algorithm belongs in its own piece of work with full
  test coverage, never folded into a CRUD sweep.
- **`features/agents/services/agentService.ts`** (catalog reads) — the catalog-tree assembly is
  shared logic consumed by BOTH the REST surface and the AI Dream MCP server; centralizing it in
  `aidream/services/agent_service/` is the intended single source of truth. Duplicating it into
  SQL for one frontend surface trades one violation for a worse one.

## Done

- `rag/data-stores` — `features/rag/hooks/useDataStores.ts` direct via `rag.fn_list_user_data_stores`
  / `fn_get_user_data_store` / `fn_data_store_members_rich` + RLS fixes (migration
  `0161_rag_data_stores_direct_client_access.sql`). Fixed a live critical `p_actor` impersonation
  hole in `rag.library_grant_publish/_revoke/_subscribe/_unsubscribe` in passing (D31).
- `rag/library` list + summary — `useLibrary.ts` on `public.rag_library_*`.
- Data-store grants — `useDataStoreGrants.ts` on `rag` RPCs.
- Library catalog + subscribe/unsubscribe — `useLibraryCatalog.ts` on `rag` RPCs.
- Data-store candidates — `dataStoreCandidates.ts` on `rag.fn_list_user_data_stores`.
- Repositories listing — `RepositoriesPage.tsx` on a `code` RPC (the `/index` POST correctly
  stays on Python — real background processing).
- Library delete / bulk-delete / delete-with-source — `LibraryPage.tsx` on `rag` RPCs.
- Library doc rename — `LibraryDocDetailSheet.tsx` on `.schema("docproc").from("processed_documents")`.
- PDF-extractor chunk reads — `features/pdf-extractor/state/thunks.ts` on `rag.fn_list_library_chunks`.
- File + folder permissions — `features/files/api/permissions.ts` on `iam` RPCs.
- Share links — moved to canonical `platform.share_links` (`utils/permissions/shareLinks.ts`);
  `features/files/api/share-links.ts` deleted. `resolveShareLink` / `downloadSharedFile` correctly
  remain on Python (real byte work).
- KG inspector — `kgInspectorService.ts` on `rag.fn_kg_inspector_*`; the Python router is retired.
- KG cost — `kgCostService.ts` on `fn_kg_cost_*`.
