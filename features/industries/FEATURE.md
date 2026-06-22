# Industries — faceted platform taxonomy

**Status:** v1 (foundation). Powers Shared Knowledge Resources entitlement; scope-template seeding + public industry pages are later phases.

## What this is

A platform-curated, **faceted** taxonomy of industries/sub-industries — separate from per-tenant scopes. Industry is two things at once:

1. **An access-control input** — it gates [Shared Knowledge Resources](../rag/FEATURE.md#shared-knowledge-resources): a resource published to industry X is readable by every org in X.
2. **A classification spine** — it seeds default scope templates onto an org (`industries.default_template_id → ctx_templates`) and structures per-industry tooling and (later) public "taste" pages.

Because it is an ACL input, it is **admin-curated, never tenant-editable** — a tenant must not grant itself industry resources by typing a string. This is the load-bearing reason it is NOT modeled on `ctx_scope_*` (those are user-authored, per-tenant dimensions).

## Faceted, not a rigid tree

Each node carries a `facet` (`domain | practice_area | jurisdiction | specialty`) and an optional self `parent_id` for nesting **within** a facet. An org/resource is tagged with **multiple** nodes, so the same leaf ("Legal → Workers' Comp → California") is reachable by any ordering as a *navigation* path — never duplicated rows. **Entitlement matching is single-node set membership** (org has node N), not facet intersection — intersection is a classification/navigation concern, kept out of the hot ACL path.

## Data model (DB)

| Table | Holds |
|---|---|
| `public.industries` | taxonomy nodes (slug, name, facet, parent_id, default_template_id, …) |
| `public.org_industries` | M2M: an org belongs to ≥ 0 industries (is_primary) |

Reads are PostgREST-exposed (anon-readable taxonomy, drives public pages later). **Writes go only through SECURITY DEFINER RPCs**, super-admin gated, audited to `public.library_audit_log`:
`industry_upsert` · `industry_assign_org` · `industry_unassign_org`.

Migrations: `aidream/db/migrations/0116_industries_taxonomy.sql` (+ `0118` RPCs, `0119` seed).

## Entry points (FE)

- `types.ts` — `Industry`, `OrgIndustry`, `IndustryFacet`.
- `service.ts` — Supabase reads + the RPC writes (never a raw insert).
- `hooks.ts` — `useIndustries()`, `useOrgIndustries(orgId)` (+ `assign`/`unassign`).
- `components/OrgIndustriesSection.tsx` — manage one org's memberships; rendered in `features/organizations/components/OrgManage.tsx`. Super-admin edits; members see read-only.

Consumed by the RAG publish panel (`features/rag/components/data-stores/DataStorePublishPanel.tsx`) for the industry audience picker.

## Doctrine

- Industry assignment is a **protected operation** (ACL input) — one mutation path (the RPCs), one audit log; never `.from('org_industries').insert()`.
- Reads direct-Supabase (public schema); writes via `supabase.rpc(...)`.
- Reconcile-later: the marketing `IndustryId` enum (`features/pricing/.../industries.ts`) and the `INDUSTRY_CATEGORIES` template keys (`features/agent-context/constants.ts`) are NOT force-merged in v1 — the DB taxonomy is the source of truth they converge onto in the template-seeding phase.

## Change log

- 2026-06-21 — v1: faceted `industries` + `org_industries`, RPC family, seed taxonomy (legal / workers-comp / ca-workers-comp / medical / us-ca), FE feature + org-assignment section. Powers Shared Knowledge Resources entitlement.
