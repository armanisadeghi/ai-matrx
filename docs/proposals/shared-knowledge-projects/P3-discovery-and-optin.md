# P3 — Discovery & Opt-in UX (FE)

## Objective

Make shared knowledge findable and adoptable by tenants: an org should discover what exists
(industry libraries, discoverable stores), opt in with one click where policy allows, and —
everywhere granted content appears — understand *why* they have it ("via California Workers'
Compensation"). Today the only tenant surface is a catalog pane on `/rag` (per-user subscribe),
org settings shows industries read-only, and provenance is invisible.

## Scope

**In:**
1. **Org-level opt-in surface** in org settings (extend `OrgIndustriesSection` area): show the
   org's industries, the stores those industries grant, and discoverable stores with
   subscribe/unsubscribe (`/rag/library-catalog` + subscribe endpoints — org-scoped action by
   an org admin, not just the current user's context). Respect decision #1 (README §4): if
   industry self-join is denied, build the "request to join industry" flow instead (loud,
   routed to super-admins — e.g. a notification/feedback row), never a silent dead end.
2. **Catalog as a first-class route** — promote the pane to `/rag/library-catalog` (list view
   doctrine: list → open → act), with store detail: description, member counts, sample/preview
   of what's inside (reuse `RichMemberTable` read-only + library preview routes), and a clear
   entitlement state chip (subscribed / via industry / global / not entitled).
3. **Provenance chips** — wherever granted content renders (RagHitCard, Source Inspector
   header, DataStoresPage 'granted' badge, file viewer redirect page): show the grant source
   ("Shared library · via ca-workers-comp"). **You OWN the provenance contract** (README §2):
   ship `public.library_grant_provenance(p_store uuid)` (SECURITY DEFINER, authenticated,
   returns only grants reaching `auth.uid()`) as a stub-with-real-signature on day 1 — P2's
   access explorer consumes it. Do NOT call `GET /rag/data-stores/{id}/grants` from tenant
   surfaces — it is owner/admin-only.
4. **Empty-state education**: a user in an entitled org who visits `/rag` with no personal
   content should see their shared libraries, not an empty dashboard.

**Out:** admin issuance (P2), public marketing "taste" pages + SEO (Wave 2), backend grant
changes (none needed — read-side only), billing.

## Deliverables / DoD

- An org admin can see and manage (or request) everything their org is entitled to from org
  settings; a member discovers the AMA library from `/rag` and `/rag/library-catalog` without
  being told it exists; every granted artifact displays its provenance.
- Mobile-responsive per house rules; `tsc` clean; live browser verification with the C&R org.
- FEATURE.md updates (rag + industries + organizations) with change-log entries.

## Surfaces

`features/rag/components/data-stores/LibraryCatalogPane.tsx` + `hooks/useLibraryCatalog.ts`
(extend), new `app/(core)/rag/library-catalog/page.tsx`, `features/industries/components/
OrgIndustriesSection.tsx` + org settings (`features/organizations/components/OrgManage.tsx`),
provenance touch-points: `features/rag/components/hit-card/RagHitCard.tsx`, source-inspector
pane header, `app/(core)/files/f/[fileId]/page.tsx`.

## Dependencies / contracts

Consumes the catalog/subscribe HTTP API and grant predicates (README §2) — no new mutation
paths. Publishes `library_grant_provenance` day 1 (one migration, applied + ledgered).
Decision #1 gates only sub-item 1's shape; everything else proceeds regardless. Shares
`RichMemberTable`/preview components with P2 — both consume, neither forks. **Do not edit
`features/industries/service.ts`/`hooks.ts` (P2 owns them this wave)** — touch only
`OrgIndustriesSection.tsx` / org-settings surfaces, or add new files.

## Verification

Two-account browser pass: entitled org member (admin@admin.com) sees catalog, provenance,
opens content; a non-entitled account sees none of it. Screenshots. Negative: subscribe on a
non-discoverable store must fail loudly (DB-gated).
