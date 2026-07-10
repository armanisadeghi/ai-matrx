# P2 — Shared Knowledge Admin Console (FE-heavy)

## Objective

Give super-admins one fast surface to run the whole issuance side: manage the industry
taxonomy, assign orgs to industries, see and mint every grant on every library store, ingest
new library content (via P1's endpoint), and audit who can reach what. Today the DB RPC family
exists and is verified, but `industry_upsert` has zero UI consumers, org-audience grants can be
listed but not created, and there is no `/administration` surface at all for this system.

## Scope

**In:**
1. **`/administration/shared-knowledge`** (admin route group, super-admin gated): tabs or
   sections for —
   - **Industries**: full CRUD on `iam.industries` (wire `upsertIndustry` →
     `industry_upsert` RPC; facets; ordering), member-org list per industry with
     assign/unassign (`industry_assign_org` / `industry_unassign_org` — reuse
     `features/industries/` service+hooks, extend don't fork).
   - **Stores & grants**: every `kind='library'` store; per-store grants list with publish
     (global | industry | **organization** — the missing audience tab) and revoke via the
     existing `/rag/data-stores/{id}/grants` HTTP family (`useDataStoreGrants` — extend it).
   - **Ingest**: upload/pick a file (canonical `fileHandler` — never a bespoke upload) and call
     P1's `POST /rag/library/stores/{id}/ingest`, streaming progress. Build against the day-1
     stub; wire live when P1 ships.
   - **Access explorer**: reverse lookup — pick an org (or user) → which stores/documents they
     can reach and via which grant (industry/org/global); pick a store → which orgs are
     entitled. Direct Supabase reads (`iam.*`, `rag.*` are PostgREST-reachable). For "which
     grant reaches user X on store Y", CONSUME P3's `library_grant_provenance` contract
     (README §2) — do NOT write your own provenance RPC; if you need an admin `_as(user)`
     variant, extend P3's function family in coordination, one primitive.
2. **`/rag/admin` FeatureAdminMap** page (doctrine: every Tier-1 feature has one; RAG is a
   conspicuous omission). Fill `FeatureAdminMap` config listing every rag route, panel, hook,
   RPC, and demo. Add the new admin routes to it.
3. Org-audience grant support end-to-end in `DataStorePublishPanel` (it lists/revokes org
   grants but cannot create them — add the org picker tab; the API already accepts
   `audience='organization'`).

**Out:** the ingest backend (P1), tenant-facing discovery (P3), new access rules (P4). No new
grant primitives — everything goes through the existing RPC/HTTP family; if you feel the need
for a new mutation path, stop and re-read the guardrail in `features/rag/FEATURE.md`.

## Deliverables / DoD

- A super-admin can, with zero SQL: create an industry, assign an org, publish/revoke all three
  audience kinds on any library store, ingest a document (once P1 lands), and answer "what can
  Castellano & Reyes read, and why?" from the access explorer.
- `DataStorePublishPanel` mints org grants. `/rag/admin` map exists and passes the drift
  warning check. Lucide-only, semantic colors, no emojis, ConfirmDialog for destructive ops.
- `tsc` clean; live browser verification with screenshots (real data, not mocks);
  FEATURE.md files (rag + industries + admin map) updated with change-log entries.

## Surfaces

`app/(admin)/administration/shared-knowledge/**` (new), `app/(core)/rag/admin/page.tsx` (new),
`features/industries/**` (extend service/hooks; wire `upsertIndustry`),
`features/rag/hooks/useDataStoreGrants.ts`, `features/rag/components/data-stores/
DataStorePublishPanel.tsx`, `features/admin/**` (FeatureAdminMap primitive — consume, don't
fork). DB: read-only; at most one new SECURITY DEFINER read RPC for the access explorer
(super-admin gated, migration applied + ledgered).

## Dependencies / contracts

Consumes: industry + grant RPC family, grants HTTP API, P1 ingest stub, P3's provenance RPC
(all in README §2). Blocked by nothing — build ingest UI against the stub. Honors admin-gate
doctrine (`selectIsSuperAdmin` / `requireSuperAdmin`; never invent a new gate). **You OWN
`features/industries/service.ts`/`hooks.ts` this wave** (README file-ownership map) — P3 will
not edit them.

## Verification

Form-login as admin@admin.com; click-test every flow against live data (California Workers'
Comp + AMA store exist); screenshot proof. Negative test: non-super-admin sees nothing.
Adversarial pass: attempt grant mutations from a non-admin session (must 403 in-DB, not just
hidden UI).
