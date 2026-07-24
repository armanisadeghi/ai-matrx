# Shared Knowledge Resources — Master Plan

**Status date: 2026-07-23** (full re-audit against live DB, prod API, and both repos after a
13-day pause). Entry point: [`docs/handoffs/shared-knowledge-access.md`](../../handoffs/shared-knowledge-access.md)
— Arman's vision in his own words + open decisions. This file is the status of record + the
contracts every brief builds against. Supersedes the two Cursor plans and
`docs/rag-access-convo-dump.md` (both describe a bug that is fixed).

**Vision.** Matrx curates system-owned knowledge (canonical: AMA Guides 5th Ed) once and issues
READ to whole audiences — an industry, an org, everyone — through one grant primitive
(`rag.data_store_grants`). A grant on the container must confer read on *everything inside it*:
source file bytes, OCR/clean text, pages, page images, chunks, derivations, extractions. Access
rides the platform spine (`platform.associations` → `platform.reachability` →
`iam.has_access_for`), never per-feature exceptions. Grants issue **viewer** only; curation
stays with owner/curator.

---

## 1. Verified status (2026-07-23)

### DONE — proven live, build on this

| Layer | Fact | Proof |
|---|---|---|
| Access kernel | ONE resolver: `iam.has_access_for(user,type,id,level)`. `iam.has_access` (auth.uid) and `iam.has_access_as` (service-role) are thin wrappers; `has_access_for` dispatches `file`→`files.has_access_for`, else `iam.has_access_for_base`. The 150-line duplicate policy body that used to live in `has_access_as` is gone | aidream `0159`/`0160`; live `pg_get_functiondef` |
| Cascade | Grants reach files through `platform.reachability` (233 `file→data_store` viewer rows). Edges: `file→data_store` (library_member), `processed_document→file` (source_file), page-image `file→file`. Triggers mirror membership with OLD-edge cleanup | live `platform.reachability` / `associations` |
| Judge behavior | Entitled reader: file viewer ✅ / editor ❌; store viewer ✅ / editor ❌; `can_read_processed_document` ✅ / `can_curate_library_document` ❌. Non-entitled user: all false | live probes, 2 users incl. a non-admin control |
| RLS | docproc docs/pages, `rag.kg_chunks` (6 policies incl. library-grant), extraction jobs/runs/page-runs/results, and now `rag.data_stores` + `data_store_members` all admit grant readers additively | `pg_policies`; PostgREST reads with real JWTs |
| **Prod e2e** | As the entitled reader: `GET /files/{ama}/download` **200, 3.86 MB**; `/rag/library/{doc}/page/1` 200; `/chunks` 200; `/rag/library-catalog` 200. Direct PostgREST: source file 1, processed docs 1, pages 500+, chunks 1000+, extraction jobs 1, page-image files 5 | curl + PostgREST, 2026-07-23 |
| aidream | All byte/metadata paths ride the kernel (`download`, `stream`, `assets`, `versions`, `/document/*`, `/rag/library/*`); writes curator-gated | audit w/ file:line |
| Deploy | Prod **provably includes** `195ad916e` (grants-list gating): prod OpenAPI fingerprints commit `b31d6fe86` (07-23 14:28), of which `195ad916e` is an ancestor | prod `/openapi.json` diffing |
| Direct-access | Library surfaces converted off Python HTTP onto `rag.fn_*` RPCs (`0162`/`0163`): grants list, catalog, doc detail, full page, chunks, delete family. Reads are deliberately SECURITY INVOKER so RLS (incl. the grant branch) does the gating | aidream migrations + FE hooks |
| Wave A | Soft-delete/trash preserves the grant branch; grant reader reads ✅, delete/purge/restore ❌ | `wave_a_*` migrations, live probes |

### Fixed in this pass (2026-07-23)

- **`rag.data_stores` judge/RLS contradiction** — `has_access('data_store',…,'viewer')` returned
  true while the table's RLS returned **zero rows**: the container was invisible although
  everything inside it was readable. Additive SELECT on `data_stores` + `data_store_members`
  (`migrations/data_stores_grant_reader_select.sql`, applied + ledgered; verified 0→1 rows
  entitled, still 0 non-entitled, editor still false).
- `features/rag/FEATURE.md` truth-up: grants/catalog hooks are direct-to-Supabase (not HTTP);
  recorded that the catalog pane is now the only discovery path.

### NOT STARTED — the four projects

**P1–P4 are all untouched.** Nobody picked up `ASSIGN.md`; the only post-07-10 edit to this
folder was a one-line documentation correction. Every marker is absent: no
`/administration/shared-knowledge`, no `/rag/admin` map, no `/rag/library-catalog` route, no
`library_grant_provenance`, no provenance chips, no acceptance-matrix or drift-guard script,
`upsertIndustry` still has zero callers, `DataStorePublishPanel` still offers only
industry + global.

### Open defects (owned by the briefs, not yet fixed)

| # | Defect | Owner |
|---|---|---|
| D-A | Non-`cld_file` store members create **no** association edge (`source_kind='cld_file'` hard-coded in every trigger/backfill) — a library of notes/transcripts conveys nothing | P4 |
| D-B | `page_extraction.py:157` hand-rolls `owner_id ==` + ANY-admin bypass on a **paid** endpoint, violating the repo's own "never hand-roll an ownership comparison" rule | P4 (see Decision 4) |
| D-C | Two different gates answer "who may list a store's grants" — the HTTP endpoint (any admin tier + owner/editor) and the RPC the FE actually uses (super-admin + **any member of the owning org**) | P2 (see Decision 2) |
| D-D | `can_read_processed_document` gained `archived_at is null` but `can_curate_library_document` did not — a grant reader loses read on an archived doc while curators keep curate. Dormant (0 archived docs) | P4 |
| D-E | RAG/library list surfaces are neither ListScope-scoped nor in `scripts/access-guards/allowlist.json` — outside the new access-guard regime, unexamined | P3 |
| D-F | Orphan `data_store_members` rows survive their file's deletion (2 of 4 live members point at deleted files) | P4 |
| D-G | aidream has **no build/version endpoint** — "what commit is prod?" is only answerable by fingerprinting `/openapi.json` | P1 (ops) |
| D-H | Several repo migration files are stale vs live (`web_crawl_artifact_*`): the on-disk SQL no longer matches the deployed function bodies | P4 |

---

## 2. Day-1 contracts (frozen — consume, never redefine)

| Contract | Signature / rule | Owner |
|---|---|---|
| Access kernel | `iam.has_access_for(user,type,id,level)` — the ONE resolver. `iam.has_access` = auth.uid wrapper; `public.has_access_as` = service-role only (anti-impersonation guard). **Never hand-roll an owner/permission ladder** | frozen |
| Grant predicates | `public.user_can_read_data_store_via_grant(user,store)` · `public.can_read_processed_document(doc,user)` · `public.can_curate_library_document(doc,user)` (write side) | frozen |
| Edge dictionary | roles `library_member`, `source_file`, `page_image`; direction little→big; **register the `association_types` rule BEFORE writing edges** (the auto-orient trigger rejects wrong-way writes) | P4 extends |
| Data path | The FE reads library data **direct via `rag.fn_*` / `public.rag_library_*` RPCs**, not Python HTTP. New reads follow the naming convention native to the surface. The HTTP endpoints still exist for non-Supabase clients (extension/external) — do not reintroduce them into FE code | frozen |
| Grant mutations | `rag.library_grant_publish` / `_revoke` / `library_subscribe` / `_unsubscribe` (SECURITY DEFINER, identity re-validated server-side; anon EXECUTE revoked). Never write `rag.data_store_grants` directly | frozen |
| Industry taxonomy | `industry_upsert` / `industry_assign_org` / `industry_unassign_org` / `industry_curator_grant` / `industry_curator_revoke` | P2 consumes |
| Provenance RPC (NEW) | `public.library_grant_provenance(p_store uuid) → {audience, industry_id, industry_name, organization_id}[]` — only grants that reach `auth.uid()`, never the full grant list. **P3 owns and publishes it day 1; P2 consumes it** (admin `_as(user)` variant extends the same family) | **P3** |
| Admin ingest (NEW) | `POST /rag/library/stores/{store_id}/ingest` `{file_id, profile?}` → system-owned ingest, streamed | **P1 publishes stub day 1**; P2 wires UI |

### File-ownership map (projects run in parallel on `main`)

- `features/industries/service.ts` + `hooks.ts` + taxonomy UI → **P2**. P3 touches only `OrgIndustriesSection.tsx` / org-settings surfaces, or adds new files.
- All `rag.*` / `docproc.*` **trigger DDL** → **P4**. P1's ownership rehome goes in the `add_member` Python path, not a competing trigger.
- `scripts/` guards + acceptance matrix → **P4**.
- FEATURE.md change logs are append-only one-liners; conflicts there are trivial.

---

## 3. Waves

**Wave 1 (parallel):** P3 · P2 · P4 · P1 — in that priority order if agents are limited.

**Convergence A — "full lifecycle":** a super-admin creates an industry → ingests a document
into a library store through the admin UI (P1+P2) → publishes it to that industry (P2) → an org
is assigned or opts in (P2/P3) → its member finds it in the catalog, searches, opens the
citation, reads PDF + pages + extractions, and sees *why* they have it (P3) → the acceptance
matrix is green (P4). **DoD:** the whole loop clickable on prod with a fresh document and a
fresh org, zero hand-written SQL.

**Wave 2 (unlocked by A):** industry taste/marketing pages + SEO · industry→scope-template
seeding · per-industry tooling · entitlement/billing on premium stores · non-file library
content UX.

---

## 4. Decisions

The four open decisions live in the handoff
([`docs/handoffs/shared-knowledge-access.md`](../../handoffs/shared-knowledge-access.md)
§ Decisions needed) so Arman answers them in one place: industry self-join, who may list
grants, ownership rehome, and paid actions for grant readers. **Record answers there, then
reflect them here as settled contract rows.**
