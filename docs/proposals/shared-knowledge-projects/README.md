# Shared Knowledge Resources — Master Plan (fleet decomposition)

**Status date: 2026-07-10.** Author: Claude (vision-to-fleet pass). Supersedes the two Cursor
plans (`grant-aware_file_reads_*.plan.md`) and `docs/rag-access-convo-dump.md` — the P0 access
bug those documents describe is **fixed and live-proven on prod** (see §1). This folder is the
source of truth for the remaining work: one brief per project, assignable blind.

**Vision (one paragraph).** Matrx curates system-owned knowledge (canonical: AMA Guides 5th Ed)
once, and issues READ access to whole audiences — an industry, an org, everyone — through one
grant primitive (`rag.data_store_grants`). A grant on the container (`data_store`) must confer
read on *everything inside it*: source files (bytes), OCR/clean text, pages, page images,
chunks, derivations (tables, Q&A, summaries), extractions — exactly like a War Room thread
share cascades to its children. Access rides the platform spine (`platform.associations` →
`platform.reachability` → `iam.has_access`/`has_access_as`), never per-feature exceptions.
Writes never cascade from grants: viewer only; curation stays owner/curator.

---

## 1. Reality audit (verified 2026-07-10, live DB + both repos + prod e2e)

### DONE — verified, build on this

| Layer | Fact | Proof |
|---|---|---|
| DB spine | `library_store_file_reachability_cascade.sql` + `library_reachability_cascade_hardening.sql` applied + ledgered (2026-07-10 07:51 UTC). Edges `file→data_store` (library_member), `processed_document→file` (source_file), page-image `file→processed_document` — all Conveys viewer; sync triggers mirror `rag.data_store_members` / `docproc.processed_documents` / `..._pages` into `platform.associations` with OLD-edge cleanup; `entity_row_access_attrs` handles `owner_id`-shaped tables; `public.has_access_as` is service_role-only with an anti-impersonation guard | migrations in `migrations/`; `_schema_migrations` rows |
| DB judge | `iam.has_access` + `iam.has_access_as` admit data_store grant holders (direct + via reachability); `user_can_read_data_store_via_grant` is the single grant predicate | live SQL: grant user viewer=true/editor=false on AMA file; stranger=false |
| DB RLS | docproc docs/pages additive SELECT via `can_read_processed_document`; `rag.kg_chunks` has 6 SELECT policies incl. library-grant; extraction jobs/runs/page-runs/results grant-read (`page_extraction_library_grant_read.sql`, 2026-07-10); `files.files` `std_select` delegates to `iam.has_access` | pg_policies, live |
| aidream | `PermissionsManager.check_async` → `public.has_access_as` (viewer→read only) for ALL byte paths (download, stream, versions, assets); `document.py` → `can_read_processed_document`; library read endpoints grant-aware, writes curator-gated | aidream audit, commit `8bfc2bc86` on origin/main |
| **Prod e2e** | Grant user (admin@admin.com / Castellano & Reyes / ca-workers-comp): `GET /files/{ama}/download` → **200, 3.8 MB**; `/rag/library/{doc}/page/1` → 200; direct PostgREST read of `processed_document_pages` returns rows | curl with real JWT, 2026-07-10 |
| FE | Source Inspector (PDF/Clean/Raw/Match tabs) has zero ACL branching — DB enforces; `DataStoresPage` + `DataStorePublishPanel` (industry/global, super-admin); `LibraryCatalogPane` + subscribe on `/rag`; org↔industry assignment in org settings (super-admin); denied-but-entitled file route redirects to `/rag/viewer` | FE audit, paths in `features/rag/FEATURE.md` |

### Fixed in this pass (2026-07-10, this session)

- Extraction tables grant-aware SELECT (Extractions tab was empty for grant readers) — applied + ledgered + committed. **DB-read only**: aidream's extraction API (`page_extraction.py` `owner/ctx.is_admin` gate) still 403s grant readers on server-side extraction routes — P4 scope.
- `GET /rag/data-stores/{id}/grants` was readable by any tenant (audience enumeration) — now owner/org-member, with `ctx.is_admin` (ANY admin tier, not just super) passing (aidream `195ad916e`, **deploy pending**).
- Doc truth-ups: catalog mislabeled "Phase 2" (it's shipped); stale `public.*`→`iam.*` industries docstring; stale `cld_get_effective_permission` docstring.

### IN FLIGHT — owned elsewhere, do not absorb

- `features/rag/api/ingest.ts` generic `ingestSource` refactor (uncommitted, another session).
- aidream local main carries other sessions' commits ahead of origin (ai-catalog, cms, matrx-ai seam work).
- aidream `sync_engine.py` hard-delete/purge refactor (`hard_delete_and_purge`, `_purge_uris_from`) — another session's work that rode along in commit `195ad916e`; complete and self-consistent, do not revert or re-commit.

### File-ownership map (Wave 1 runs in parallel on main — respect this)

- `features/industries/service.ts` + `hooks.ts` + taxonomy UI → **P2**. P3 touches only `OrgIndustriesSection.tsx` / org-settings surfaces; if P3 needs a new industries read, add a new file, don't edit P2's.
- ALL trigger/DDL on `rag.*` and `docproc.*` tables → **P4**. P1 implements rehome in the `add_member` Python path + its new endpoint, never via a competing DB trigger.
- Shared FEATURE.md change logs are append-only; merge conflicts there are expected and trivially resolved — keep entries one-line-per-change.

### MISSING — the four projects below

1. Publish lifecycle is not productized: no admin ingest endpoint (AMA went in via a one-off script as Arman-owned), no ownership rehome on publish, chunks owner_id=Arman.
2. No admin issuance console: industry taxonomy CRUD RPC has **zero UI consumers**; no org-audience grant creation UI; no `/administration` surface; no `/rag/admin` FeatureAdminMap.
3. Discovery is thin: catalog pane exists but no org-level opt-in surface, no provenance ("you have this via ca-workers-comp"), no industry taste pages.
4. Cascade only covers `cld_file` members: store members of kind `note|transcript|scraped|research|code_file` create **no association edge** (trigger returns early), so non-file library content will NOT cascade; no drift guards proving the tree stays connected.

---

## 2. Day-1 contracts (frozen — consume, never redefine)

| Contract | Signature | Owner |
|---|---|---|
| Access judge | `iam.has_access(type,id,level)` (RLS/auth.uid) · `public.has_access_as(user,type,id,level)` (service-role only) | platform (frozen) |
| Grant predicate | `public.user_can_read_data_store_via_grant(user,store)` · `public.can_read_processed_document(doc,user)` | platform (frozen) |
| Edge dictionary | roles `library_member`, `source_file`, `page_image`; direction little→big; register `association_types` BEFORE writing a new edge shape | P4 extends |
| Grants API | `GET/POST /rag/data-stores/{id}/grants`, `DELETE .../grants/{gid}` (audience `global|industry|organization`); `GET /rag/library-catalog`, `POST/DELETE .../subscribe`. **The grants GET is owner/admin-only after `195ad916e` — tenant surfaces must NOT call it; tenant provenance uses the RPC below** | exists; P2 consumes |
| Provenance RPC (NEW) | `public.library_grant_provenance(p_store uuid) → {audience, industry_id, industry_name, organization_id}[]` — grants on a store that REACH `auth.uid()` (never the full grant list). SECURITY DEFINER, authenticated. **P3 owns and ships it day 1; P2's access explorer consumes it (with an `_as(user)` variant if needed, service/admin-gated)** | **P3 publishes day 1** |
| Industry RPCs | `industry_upsert`, `industry_assign_org`, `industry_unassign_org`, `library_grant_publish/revoke`, `library_subscribe/unsubscribe` (SECURITY DEFINER, super-admin/member-gated in-DB) | exists; P2 consumes |
| Admin ingest (NEW) | `POST /rag/library/stores/{store_id}/ingest` `{file_id, profile?}` → `{processed_document_id, member_id}`; system-owned output; 202+stream per stream-everything | **P1 publishes stub day 1**; P2 wires UI against it |

## 3. Waves

**Wave 1 (all four in parallel):** P1 publish pipeline · P2 admin console · P3 discovery/opt-in · P4 cascade generalization + guardrails.

**Convergence A — "full lifecycle" (after Wave 1):** super-admin creates an industry → ingests a PDF into a library store via the ADMIN UI (P1+P2) → publishes to the industry (P2) → an org opts in / is assigned (P3) → its member searches, opens citation, reads PDF/pages/extractions, sees provenance (P3) → automated acceptance matrix green (P4). DoD: the whole loop clickable on prod with a fresh document and a fresh org, zero SQL by hand.

**Wave 2 (unlocked by A):** industry taste/marketing pages + SEO; industry→scope-template seeding (`apply_template` safe wrapper); per-industry tooling; entitlement/billing hooks on premium stores; non-file library content (notes/transcript members) end-to-end UX.

## 4. Open decisions (asked of Arman 2026-07-10 — record answers here)

1. **Org-admin industry self-join** — may an org admin join their org to an industry, or is industry membership super-admin-issued only (org admins only subscribe to discoverable stores)? *Recommendation: super-admin-issued (it's an ACL input), plus a "request to join" flow.* → PENDING
2. **Ownership rehome on publish** — when a personal file becomes a library-store member, rehome `files.files.organization_id` to Matrx Library (keep `created_by` as attribution)? Contributor then sees it under Library, not "my files". *Recommendation: yes, for `kind='library'` stores only.* → PENDING
3. **Hierarchy ratified?** — `data_store` above `file` (file = baby of store), as Arman provisionally accepted. → PENDING confirmation
4. **Grant-reader visibility of a store's member list** — full rich member table read-only (current) vs. search-only. Current = read-only visible. → PENDING (default: keep)
