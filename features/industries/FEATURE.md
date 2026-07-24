# Industries — faceted platform taxonomy

**Status:** v1 (foundation). Powers Shared Knowledge Resources entitlement; scope-template seeding + public industry pages are later phases.

## What this is

A platform-curated, **faceted** taxonomy of industries/sub-industries — separate from per-tenant scopes. Industry is two things at once:

1. **An access-control input** — it gates [Shared Knowledge Resources](../rag/FEATURE.md#shared-knowledge-resources): a resource published to industry X is readable by every org in X.
2. **A classification spine** — it seeds default scope templates onto an org (`industries.default_template_id → ctx_templates`) and structures per-industry tooling and (later) public "taste" pages.

The **taxonomy** (`industries` rows) is **admin-curated** — tenants cannot invent industry nodes. **Org membership** (`org_industries`) is **org-admin editable** — owners/admins pick which curated nodes their org belongs to. That is the load-bearing reason industry is NOT modeled on `ctx_scope_*` (those are free-form user-authored dimensions).

## Faceted, not a rigid tree

Each node carries a `facet` (`domain | practice_area | jurisdiction | specialty`) and an optional self `parent_id` for nesting **within** a facet. An org/resource is tagged with **multiple** nodes, so the same leaf ("Legal → Workers' Comp → California") is reachable by any ordering as a *navigation* path — never duplicated rows. **Entitlement matching is single-node set membership** (org has node N), not facet intersection — intersection is a classification/navigation concern, kept out of the hot ACL path.

## Data model (DB)

| Table | Holds |
|---|---|
| `public.industries` | taxonomy nodes (slug, name, facet, parent_id, default_template_id, …) |
| `public.org_industries` | M2M: an org belongs to ≥ 0 industries (is_primary) |

Reads are PostgREST-exposed (anon-readable taxonomy, drives public pages later). **Writes go only through SECURITY DEFINER RPCs**, audited to `public.library_audit_log`:

| RPC | Who |
|---|---|
| `industry_upsert` | Matrx **super-admin** only (taxonomy) |
| `industry_assign_org` / `industry_unassign_org` | **Org owner/admin** of that org, or Matrx super-admin |

Auth is always `auth.uid()` — never trust `p_actor` for authorization.

Migrations: `aidream/db/migrations/0116_industries_taxonomy.sql` (+ `0118` RPCs, `0119` seed); gate relax: `migrations/industry_assign_org_admin_gate.sql`.

## Entry points (FE)

- `types.ts` — `Industry`, `OrgIndustry`, `IndustryFacet`.
- `service.ts` — Supabase reads + the RPC writes (never a raw insert).
- `hooks.ts` — `useIndustries()`, `useOrgIndustries(orgId)` (+ `assign`/`unassign`).
- `components/OrgIndustriesSection.tsx` — manage one org's memberships; rendered in `features/organizations/components/OrgManage.tsx`. Org owner/admin (or Matrx super-admin) edits; members see read-only.

Consumed by the RAG publish panel (`features/rag/components/data-stores/DataStorePublishPanel.tsx`) for the industry audience picker.

## Doctrine

- Industry **assignment** is a gated mutation (ACL input) — one path (the RPCs), one audit log; never `.from('org_industries').insert()`. Gate = org admin of that org **or** Matrx super-admin.
- Industry **taxonomy** stays Matrx super-admin only (`industry_upsert`).
- Reads direct-Supabase (public schema); writes via `supabase.rpc(...)`.
- Reconcile-later: the marketing `IndustryId` enum (`features/pricing/.../industries.ts`) and the `INDUSTRY_CATEGORIES` template keys (`features/agent-context/constants.ts`) are NOT force-merged in v1 — the DB taxonomy is the source of truth they converge onto in the template-seeding phase.

## Change log

- 2026-07-23 — P2: `upsertIndustry` finally has callers — the Shared Knowledge admin console (`/administration/shared-knowledge`, Industries tab) does full taxonomy CRUD via `industry_upsert` (slug = immutable upsert key), facets + ordering, and per-industry org assign/unassign via `industry_assign_org`/`_unassign_org` with `ConfirmDialog`. Added `fetchAllOrgIndustries` (service) + `useAllOrgIndustries` (hook) — platform-wide assignments readable by super-admins under the existing `org_industries` RLS; powers the console's org lists + access explorer. Verified live; `industry_upsert` refuses a non-super-admin (DB probe).
- 2026-07-23 — P3 legibility: `OrgIndustriesSection` now shows what each assigned industry UNLOCKS (shared libraries entitled via that industry, linked to `/rag/library-catalog?store_id=…`) plus a "Shared knowledge libraries" block listing every discoverable store with the org's entitlement chip and subscribe/unsubscribe (`rag.library_subscribe`/`_unsubscribe` via `useLibraryCatalog(orgId)` — evaluated against the section's org, not the active org). Self-serve join stays per Decision 1 (never read-only, no approval flow). Only the component changed — `service.ts`/`hooks.ts` untouched (P2 owns them this wave).
- 2026-07-10 — Org owner/admin (not only Matrx super-admin) can assign/unassign industries via `industry_assign_org` / `industry_unassign_org`; taxonomy upsert stays super-admin. Auth against `auth.uid()` only.
- 2026-07-10 — Shared Knowledge open path: industry grants on a library store cascade via platform reachability (`file→data_store` Conveys viewer) into `iam.has_access` / file download / Source Inspector. See [`features/rag/FEATURE.md`](../rag/FEATURE.md#shared-knowledge-resources).
- 2026-06-21 — v1: faceted `industries` + `org_industries`, RPC family, seed taxonomy (legal / workers-comp / ca-workers-comp / medical / us-ca), FE feature + org-assignment section. Powers Shared Knowledge Resources entitlement.
