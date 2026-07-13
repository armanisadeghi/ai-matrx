---
status: active
updated: 2026-07-11
repos: [matrx-frontend, aidream]
---

# DB-direct-access sweep — kill remaining "Python HTTP as a DB proxy" call sites

Arman's rule (root `CLAUDE.md`): the React client goes **direct to Supabase** for all data
(reads/writes/search/listings/CRUD via `supabase-js` + RLS + `SECURITY DEFINER` RPCs where needed).
Python (`aidream`) is for genuine work the browser can't do — LLM/AI, heavy processing, file bytes,
URL signing, an auth/anon boundary. A plain DB read/write routed through Python is pure waste and,
per this campaign's own findings, an extra unaudited surface.

## Status

**Done — `rag/data-stores` (2026-07-11).** [`features/rag/hooks/useDataStores.ts`](../../features/rag/hooks/useDataStores.ts)
now calls Supabase directly. Migration: `aidream/db/migrations/0161_rag_data_stores_direct_client_access.sql`
(mirrored in `packages/matrx-rag/matrx_rag/migrations/`, applied + ledgered on project
`txzxabzwovsujtloxrus`). Added 3 `SECURITY DEFINER` functions in `rag` schema
(`fn_list_user_data_stores`, `fn_get_user_data_store`, `fn_data_store_members_rich` — all keyed on
`auth.uid()` only, no client-supplied actor param) + 4 RLS policy fixes on `rag.data_stores` /
`rag.data_store_members`. Also fixed **a live critical vulnerability found in passing**:
`rag.library_grant_publish/_revoke/_subscribe/_unsubscribe` trusted a caller-supplied `p_actor` over
the real session identity and 2 of them (super-admin-gated) were `EXECUTE`-granted to `anon` — see
matrx-frontend `KNOWN_DEFECTS.md` D31. All of this was live-verified (`SET LOCAL ROLE authenticated`
+ a real user's JWT claims against real rows) and adversarially reviewed — the review caught 2 real
bugs in the first pass, both fixed and re-verified.

**Pre-existing, found during this sweep — `rag/library` (list + summary) already converted.**
[`features/rag/hooks/useLibrary.ts`](../../features/rag/hooks/useLibrary.ts) already calls
`public.rag_library_list` / `public.rag_library_summary_totals` directly via `supabase.rpc(...)`
(no `.schema()` — these live in `public`). Someone already did this half of the file; only
`useLibraryDoc` (the detail read) is called out in that file's own header comment as "left for a
follow-up" — it still hits `/rag/library/{id}` over HTTP. **Follow the SAME naming convention**
(`public.rag_library_*`) for any new function in this area, not the `rag.fn_*` convention used
for data-stores — pick the convention native to whichever surface you're extending.

**Blocked mid-sweep — Supabase MCP tooling went unreachable (`MCP server "claude.ai Supabase" is
not connected`, repeated retries over sustained polling, never recovered this session).** Every
item below is scoped and ready to execute, but none of them shipped, because none of them were
live-verified — and this campaign's own adversarial review proved that skipping live verification
on RLS/RPC work here produces real, shippable bugs (a `WITH CHECK` gap and a grant-visibility bug,
both in the first, unreviewed pass on data-stores). **Do not convert anything below without live DB
verification** (`SET LOCAL ROLE authenticated` + a real JWT claim against real rows, exactly as
`0161_...sql`'s development process did) — treat a "looks right" SQL function as unshippable until
you've actually run it.

Two of the offender-scan's "UNSURE" candidates are resolved, NOT offenders — see bottom.

## Remaining offenders — one entry each, ready to execute

For every item: (1) add a `SECURITY DEFINER` function (or RLS policy, if a plain `.from()` suffices)
keyed on `auth.uid()` only — **never** a client-supplied actor/user param, that exact shape is the
vulnerability class already found twice in this campaign (see D31 in `KNOWN_DEFECTS.md`); (2) apply
+ ledger the migration (mirror into `packages/matrx-rag/matrx_rag/migrations/` if it touches `rag`
tables, per that package's `CLAUDE.md` rule 6); (3) rewrite the hook/service to call it via
`supabase-js`; (4) regenerate `types/database.types.ts` (`pnpm db-types`); (5) live-verify against
real rows for at least an owner case and a denied case; (6) adversarially review before shipping —
this campaign found real bugs on the FIRST conversion and would have shipped them without it.

1. **`features/rag/hooks/useDataStoreGrants.ts`** — `GET/POST/DELETE /rag/data-stores/{id}/grants`.
   Publish/revoke already route through the now-fixed `rag.library_grant_publish`/`_revoke` RPCs —
   just call them directly via `.schema("rag").rpc(...)`. The LIST needs a new function: the
   existing RLS `dsg_select_entitled` policy is for *consumers* (can I see a grant that entitles
   me?), not *store managers* (owner/org-member wants to see every grant on their own store to
   manage it) — those are different visibility rules. Add `rag.fn_list_data_store_grants(p_store_id
   uuid)`, gate identical to `aidream/services/rag/access.py::assert_can_access_data_store` (owner
   OR org-member OR `is_super_admin`), join `iam.industries`/`iam.organizations` for the label
   columns (mirror `library_grants.py::_grants_query`).

2. **`features/rag/hooks/useLibraryCatalog.ts`** — `GET /rag/library-catalog`,
   `POST/DELETE /rag/library-catalog/{id}/subscribe`. Subscribe/unsubscribe already have RPCs
   (`rag.library_subscribe`/`_unsubscribe`, now fixed) — call directly; they take an explicit
   `organization_id` and re-validate membership internally, so passing an org the caller doesn't
   belong to just 403s, it isn't a spoof vector. Frontend already has an "effective org" selector —
   `selectEffectiveOrganizationId` (`lib/redux/slices/appContextSlice.ts`, used by
   `useLibrary.ts`) — use that instead of resolving personal-org server-side. LIST needs a new
   `rag.fn_list_library_catalog()` mirroring `aidream/services/rag/library_grants.py::list_catalog`
   (discoverable + active stores, member count subquery, `subscribed` = exists a grant for the
   caller's effective org).

3. **`features/rag/service/dataStoreCandidates.ts`** — `GET /rag/data-stores`. Trivial: this is the
   exact same read as `useDataStores`' list. Swap to `rag.fn_list_user_data_stores` (already built
   and shipped in item 1 of Done). The file's own comment citing "viable only after per-table RLS
   parity" is now stale — the RPC already achieves that parity; update/remove the comment.

4. **`features/rag/components/RepositoriesPage.tsx`** — `GET /rag/repositories` (listing only; the
   `POST /rag/repositories/{id}/index` stays on Python — genuine background processing). Owner-only
   read (`code.code_repositories` + `code.code_files` counts, indexed-count via `EXISTS` against
   `rag.kg_chunks`) — see `aidream/services/rag/browse.py::list_repositories` (has its own
   schema-drift note worth reading: ownership is `created_by`, not `user_id`). Add e.g.
   `code.fn_list_repositories()`, `auth.uid()`-keyed, no client param.

5. **`features/rag/components/library/LibraryPage.tsx`** — THREE offenders found reading the
   Python side, not just the one the original scan flagged:
   - `POST /rag/library/bulk-delete` (`bulk_delete_library_documents`) — cascading delete
     (`kg_chunks` → `processed_document_pages` → `processed_documents`) by explicit id list OR by
     derived status, owner-gated.
   - `DELETE /rag/library/{id}` (`delete_library_document`) — same cascade, single doc.
   - `DELETE /rag/library/{id}/full` (`delete_library_document_and_source`) — same cascade +
     soft-deletes the source `cld_files` row. **This does NOT touch S3** (a background sweep job
     does that later) — despite the name/comment sounding like real file-bytes work, it is still a
     pure DB write and belongs on the direct path.
   All three gate on `_LIBRARY_CURATE_GATE` in `aidream/services/rag/library_queries.py`
   (`owner_id = user OR public.can_curate_library_document(id, user)` — that helper is an existing
   Postgres function, reuse it). Build one `rag.fn_delete_library_documents(p_ids uuid[],
   p_delete_source boolean DEFAULT false)` (or three functions if you prefer the narrower surface)
   replicating the cascade + the `data_store_members` dead-pointer cleanup that `.../full` also does.

6. **`features/rag/components/library/LibraryDocDetailSheet.tsx`** — `PATCH /rag/library/{id}`
   (rename). Straightforward — once the read side (`useLibraryDoc`, below) is on RLS/RPC, this is
   very likely a plain `.from("processed_documents").update({name}).eq("id", docId)` gated by
   existing/new RLS mirroring `_LIBRARY_CURATE_GATE`.

7. **`features/rag/api/document.ts`** — `GET /api/document/{id}`, `.../lineage`, `.../pages`,
   `.../page/{n}`, `.../chunks` (NOT `pageImageUrl` — that one's a legitimate signed-URL redirect,
   leave it). Different router than `/rag/library/*` (check `aidream/api/routers/document.py` or
   wherever `/api/document` is mounted) but almost certainly the same read-gate shape as library
   (`_LIBRARY_READ_GATE`: owner OR `public.can_read_processed_document`). Read the actual service
   file before designing — don't assume it's identical to library_queries.py.

8. **`features/rag/hooks/useLibrary.ts`** (`useLibraryDoc` only — the rest of this file is already
   done, see Status above) — `GET /rag/library/{id}`. The file's own header names this as the
   deliberate remaining gap. Follow the `public.rag_library_*` naming convention already
   established in this same file for consistency.

9. **`features/pdf-extractor/state/thunks.ts`** — `GET /rag/library/{docId}/chunks?limit=&page_number=`.
   Plain paginated read over `rag.kg_chunks`, once the read-gate function exists (likely shares
   logic with item 7/8 — check whether one shared `rag.fn_get_document_chunks(p_doc_id, p_page,
   p_limit)` can serve both this and `document.ts`'s chunks read instead of building it twice).

10. **`features/files/redux/thunks.ts`** + `features/files/api/{files,folders,permissions,share-links}.ts`
    — the highest-risk item on this list; **do this one with the most care, not the least.**
    Permission grant/revoke and share-link create/deactivate are the exact "privileged mutation
    dressed as a plain API call" shape as the impersonation bug found in this same campaign — a
    mistake here leaks or exposes private files. Offenders (grep confirmed): `listFilePermissions`,
    `grantFilePermission`, `revokeFilePermission`, `listFolderPermissions`, `grantFolderPermission`,
    `revokeFolderPermission` (`permissions.ts`); `listFileShareLinks`, `createFileShareLink`,
    `listFolderShareLinks`, `createFolderShareLink`, `deactivateShareLink` (`share-links.ts`);
    `listFolders`, `createFolder`, `patchFolder`, `deleteFolder`, `bulkMoveFolders` (`folders.ts`);
    plus the rename/move/delete/bulk-delete/bulk-move dispatched from `thunks.ts`. **NOT
    offenders** (real file/byte work): `resolveShareLink`, `downloadSharedFile` in `share-links.ts`
    — leave those on Python. `share-links.ts`'s own existing comment ("reading via supabase-js is
    preferred... exposed here for parity") shows the original author already intended this
    conversion — you're finishing their plan, not inventing one. Read
    `aidream/services/files/` (or wherever these routers delegate) for the exact ownership/ACL
    predicate before writing any SQL; this is a big enough surface it may deserve its own
    dedicated review pass rather than folding into this sweep's adversarial-review batch.

11. **`features/administration/kg-inspector/service/kgInspectorService.ts`** — `GET
    /kg-inspector/entities`, `/kg-inspector/mentions`, `/kg-inspector/edges/top`. Confirmed
    `ctx.is_admin`-gated, paginated/filtered `SELECT`s, no LLM/processing
    (`aidream/api/routers/kg_inspector.py`). Admin-gating is a reason for the RPC to check
    `is_super_admin_user(auth.uid())` (or whatever the equivalent `admin.admins` check is) inside
    the function body — it is NOT a reason to route through Python. Build
    `rag.fn_kg_inspector_entities/mentions/edges_top(...)`, admin-checked internally,
    `EXECUTE`-granted to `authenticated` (the function's own admin check is the real gate, same
    pattern as every other admin RPC in this repo).

12. **`features/administration/kg-cost/service/kgCostService.ts`** — `GET /kg-cost/summary`,
    `/kg-cost/orgs`, `/kg-cost/orgs/{id}`, `/kg-cost/batches/pending`, `/kg-cost/batches/{id}`.
    Same shape as #11 — confirmed `ctx.is_admin`-gated read-only aggregates
    (`aidream/api/routers/kg_cost.py`). Same fix pattern.

## Resolved — NOT offenders (no action)

- **`features/kg-graph/service/kgGraphService.ts`** (`GET /kg/graph`, `.../entity/{id}/mentions`) —
  read `aidream/services/knowledge_graph/graph.py` (488 lines): the graph payload is a genuine
  bounded-hop `WITH RECURSIVE` traversal with a visibility predicate baked into every recursion
  step, not a plain filtered `SELECT` — the file's own comment says "no `QueryBuilder` equivalent
  exists (or should — a recursive graph walk is not a composable filter/join shape)". This is real
  enough to count as "processing" per the architecture doctrine's own carve-out. It's technically
  *possible* to port to a `SECURITY DEFINER` `WITH RECURSIVE` function, but porting a 488-line
  graph algorithm without live testing is reckless — if this is ever tackled, it should be its own
  dedicated piece of work with full test coverage, not folded into a broad CRUD sweep.
- **`features/agents/services/agentService.ts`** (catalog reads: `listAgents`, `getAgent`,
  `listVersions`, `getVersion`) — the file's own header states the intentional design: "agent field
  CRUD stays direct-to-Supabase... This client is for the SERVER-ONLY capabilities... plus the
  catalog read model." Per `aidream/CLAUDE.md`'s Agent Service section, this catalog-tree assembly
  (permissions + cross-table joins across model/tool/skill registries) is shared logic consumed by
  BOTH the REST surface and the AI Dream MCP server — centralizing it in `aidream/services/agent_service/`
  is the intended single source of truth, not a violation. Duplicating it into SQL purely for this
  one frontend surface would trade one violation (extra hop) for a worse one (two divergent
  implementations of admin-sensitive catalog logic).

## Recommended order for whoever picks this up

Items 1–3 first (cheapest — 1 & 2 mostly reuse already-fixed RPCs, 3 is a one-line swap). Then 8–9
(same read-gate, do together). Then 4–7 (each needs its own new function but is low external
attack surface — owner/curator-gated). Then 11–12 together (identical admin-gated pattern, batch
them). **Item 10 (files permissions/share-links) last, and alone** — highest risk, deserves an
undivided pass with its own live verification and its own adversarial review, not a rushed tail end
of a long batch.
