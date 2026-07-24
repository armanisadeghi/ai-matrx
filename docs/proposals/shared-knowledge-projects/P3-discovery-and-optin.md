# P3 — Discovery & Opt-in (FE + one RPC) — **PRIORITY 1**

> Read [`README.md`](README.md) (status + contracts) and the
> [handoff](../../handoffs/shared-knowledge-access.md) (vision + decisions) first.
> Status: **NOT STARTED** as of 2026-07-23.

## Objective

Entitled content is invisible. Two independent hardening passes closed every listing surface to
grant readers — by design — without anyone building the surface that was supposed to replace
them. `files_listing_owner_grant_only.sql` (07-20) bars reachability-conveyed rows from every
file tree, search, and picker; `list_library_documents` scopes to owner/curator. The result: an
org that opted into California Workers' Compensation has full read access to the AMA Guides and
**exactly one way to find it** — an unlabeled pane near the bottom of `/rag`. This project makes
shared knowledge discoverable, adoptable, and self-explanatory. Arman: *"easy ways for users and
orgs to find and opt into these resources."*

## Scope

**In:**

1. **`public.library_grant_provenance(p_store uuid)` — publish day 1** (contract, README §2).
   SECURITY DEFINER, `authenticated`, returns ONLY grants that reach `auth.uid()`
   (`{audience, industry_id, industry_name, industry_slug, organization_id}`) — never the full
   grant list (that is the admin view and a different gate; see README D-C). Mirror the audience
   logic in `public.user_can_read_data_store_via_grant`; do not fork a second predicate. Apply +
   ledger + `pnpm db-types`. P2's access explorer consumes this family.
2. **`/rag/library-catalog` as a real route** — promote `LibraryCatalogPane` to a list-view
   destination per feature-entry doctrine (list → open → act): search/filter, entitlement chip
   (`subscribed` / `via <industry>` / `global` / `not entitled`), and a store detail view
   (description, member count, read-only member table, preview links). Keep the `/rag` pane as a
   teaser that links here. Read via `rag.fn_list_library_catalog` (direct, already live).
3. **Org-level opt-in in org settings** — an org admin must see the org's industries, the
   libraries those industries grant, and discoverable stores with subscribe/unsubscribe
   (`rag.library_subscribe`/`_unsubscribe`, which re-validate membership server-side; pass the
   org from `selectEffectiveOrganizationId`). **Gated on Decision 1** (handoff): if unanswered
   when you start, build the read-only view + a "request to join industry" action that notifies
   super-admins, and flag it — never a dead end.
4. **Provenance everywhere granted content appears** — `RagHitCard`, Source Inspector header,
   the `'granted'` badge on `DataStoresPage`, and the `/files/f/[id]` → `/rag/viewer` redirect
   page: show "Shared library · via California Workers' Compensation". Thread it through
   existing types; no parallel fetch layer.
5. **Entitled empty states** — a user in an entitled org with no personal content must see their
   shared libraries on `/rag`, not an empty dashboard.
6. **Close D-E** — bring the library/catalog list surfaces into the access-guard regime: either
   scope them with the `ListScope` primitive (`lib/list-scope/`) or add a justified entry to
   `scripts/access-guards/allowlist.json`. They are currently neither, which means the next
   VIEW-LAW sweep will treat them as unexamined.

**Out:** admin issuance UI (P2), the ingest pipeline (P1), new access rules or edge kinds (P4),
public marketing/taste pages (Wave 2). **No new mutation paths** — subscribe/unsubscribe RPCs
already exist.

## Deliverables / DoD

- `library_grant_provenance` live, ledgered, typed, and consumed by at least the Source Inspector
  and hit cards.
- A member of an entitled org, starting from `/rag` with zero personal content, can find the AMA
  Guides, open it, read it, and see why they have access — without being told it exists.
- An org admin can see everything their org is entitled to and act (subscribe, or request to
  join per Decision 1).
- Library list surfaces are scoped or explicitly allowlisted; `pnpm check:access-guards` reads
  zero.
- `pnpm type-check` clean; live browser verification with **two** accounts (entitled +
  non-entitled) and screenshots; FEATURE.md change-log entries (rag, industries, organizations).

## Surfaces

`features/rag/components/data-stores/LibraryCatalogPane.tsx` · `features/rag/hooks/useLibraryCatalog.ts`
· new `app/(core)/rag/library-catalog/page.tsx` · `features/industries/components/OrgIndustriesSection.tsx`
+ org settings (`features/organizations/components/OrgManage.tsx`) ·
`features/rag/components/hit-card/RagHitCard.tsx` · `features/rag/components/source-inspector/SourceInspectorPane.tsx`
· `app/(core)/files/f/[fileId]/page.tsx` · `lib/list-scope/` · one migration.

## Dependencies / contracts

Consumes the catalog/subscribe RPCs, grant predicates, and the access kernel (README §2).
**Publishes `library_grant_provenance` day 1** — P2 is waiting on the signature, so ship the
signature before the UI. **Do not edit `features/industries/service.ts` / `hooks.ts`** (P2 owns
them this wave). **Do not call the `/rag/data-stores/{id}/grants` HTTP endpoint** from tenant
surfaces — it is admin/owner-gated and returns the full grant list.

## Verification

Two-account browser pass (entitled `admin@admin.com` vs non-entitled `arman26@gmail.com` — note
the former is also a super_admin, so any pass must be paired with the non-admin control; for
DB-level probes use the clean grant-only user `elliesadeghijd@gmail.com`). Prove:
catalog lists the AMA store for the entitled user and not the other; provenance chip names the
industry; subscribe to a non-discoverable store fails loudly (DB-gated); the org-settings view
shows the correct entitlements. Screenshots in the summary.
