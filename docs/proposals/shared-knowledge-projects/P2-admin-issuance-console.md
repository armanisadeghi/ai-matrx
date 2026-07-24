# P2 — Shared Knowledge Admin Console (FE) — **PRIORITY 2**

> Read [`README.md`](README.md) and the [handoff](../../handoffs/shared-knowledge-access.md)
> first. Status: **NOT STARTED** as of 2026-07-23.

## Objective

Arman: *"We need better management of the industry data we assign: FE administration interface
that quickly and easily allows access to anything we have and can issue."* Today the database
can express every kind of issuance and the UI can express almost none: there is no way to create
an organization-audience grant, no way to create or rename an industry (`upsertIndustry` is
exported with **zero callers** — it will read as "already built" to a careless agent), no way to
answer "why does this org see this document?", and no `/administration` surface for any of it.
This project is the issuance and audit cockpit.

## Scope

**In:**

1. **`/administration/shared-knowledge`** (super-admin gated, `(admin)` route group):
   - **Industries** — full CRUD on `iam.industries` via `industry_upsert` (wire the existing
     dead `upsertIndustry`), facets, ordering; per-industry org list with assign/unassign
     (`industry_assign_org` / `_unassign_org`). Extend `features/industries/**` — you own those
     files this wave; never fork them.
   - **Stores & grants** — every `kind='library'` store; per-store grant list with publish and
     revoke for **all three audiences including `organization`**, which no UI can create today
     (the API and CHECK constraint already accept it; `DataStorePublishPanel` has only
     industry + global tabs). Extend `useDataStoreGrants` — it is already direct-to-Supabase
     (`rag.fn_list_data_store_grants`, `rag.library_grant_publish/_revoke`).
   - **Ingest** — pick or upload a file through the canonical `fileHandler` (never a bespoke
     uploader) and call P1's `POST /rag/library/stores/{id}/ingest`, streaming progress. Build
     against P1's day-1 stub; wire live when it ships.
   - **Access explorer** — the "why" tool: pick an org or user → which libraries/documents they
     reach and through which grant; pick a store → which industries/orgs are entitled. Consume
     P3's `library_grant_provenance` family (README §2) — **do not write a second provenance
     RPC**; if you need an admin `_as(user)` variant, extend P3's family.
2. **Delete the stale comment at `aidream/api/routers/rag.py:674`** — it claims "The FE calls
   these over HTTP because rag.* is not PostgREST-exposed." Both halves are false since `0162`:
   `rag` **is** exposed and the FE calls the RPCs directly. It contradicts README §2's frozen
   data-path rule and will send the next reader the wrong way.
3. **Resolve D-C (the two-gate fork)** — "who may list a store's grants" is currently answered
   differently by the HTTP endpoint (any admin tier + owner/editor) and by the RPC the FE
   actually uses (super-admin + **any member of the owning org**). Implement Arman's answer to
   Decision 2 (handoff) as ONE rule in both places, and delete the divergence. If the decision is
   still open when you reach it, implement the recommended option behind a clearly-named
   predicate and flag it — do not ship two rules.
4. **`/rag/admin` FeatureAdminMap** — RAG is a conspicuous Tier-1 omission (15 other features
   have one). Fill `FeatureAdminMap` (`features/admin/types/featureAdminMap.ts`) with every rag
   route, panel, hook, RPC, migration and demo, including the new admin routes.

**Out:** ingest backend (P1), tenant-facing discovery (P3), new access rules/edges (P4). **No new
grant primitives** — everything goes through the existing RPC family. If you feel the need for a
new mutation path, re-read the guardrail in `features/rag/FEATURE.md`.

## Deliverables / DoD

- With zero SQL a super-admin can: create/rename an industry, assign an org, publish and revoke
  all three audience kinds, ingest a document (once P1 lands), and answer "what can Castellano &
  Reyes read, and why?".
- One gate for grant listing, in both the RPC and the HTTP endpoint; a test proves a non-entitled
  member cannot enumerate grants.
- `/rag/admin` map exists and its drift warnings are clean.
- House rules: Lucide icons only, semantic colors, no emojis, `ConfirmDialog` for destructive
  actions, `selectIsSuperAdmin` / `requireSuperAdmin` (never a new gate primitive).
- `pnpm type-check` clean; live browser verification with screenshots; FEATURE.md updates (rag,
  industries, admin map).

## Surfaces

New `app/(admin)/administration/shared-knowledge/**` · new `app/(core)/rag/admin/page.tsx` ·
`features/industries/**` (owned) · `features/rag/hooks/useDataStoreGrants.ts` ·
`features/rag/components/data-stores/DataStorePublishPanel.tsx` · `features/admin/**` (consume
the primitive, don't fork) · aidream `aidream/api/routers/rag.py` + `services/rag/access.py` and
the `0162` RPC for the D-C fix.

## Dependencies / contracts

Consumes: industry + grant RPC families, P1's ingest stub, P3's provenance RPC (README §2).
Blocked by nothing — build the ingest UI against the stub. Owns `features/industries/service.ts`
and `hooks.ts` this wave (P3 will not touch them).

## Verification

Form-login as `admin@admin.com`; exercise every flow against live data (California Workers'
Compensation + the AMA-G5 store exist). Negative tests: a non-super-admin sees nothing and, more
importantly, **cannot** mutate via the RPC directly (the DB gate must refuse, not just the hidden
UI). Adversarially review the D-C change before shipping — it is a security gate.
