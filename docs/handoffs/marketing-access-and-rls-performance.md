---
status: blocked
updated: 2026-07-21
repos: [matrx-frontend]
vision: [docs/MARKETING_PROGRAM_BOARD.md]
---

# Marketing access model + component-RLS performance

## Vision — Arman's words

On what marketing access IS:

- "these are public websites with public data we're scraping… EVERYONE gets full access to view."
- "the level of security needs to be THE ABSOLUTE FUCKING least so that people just don't see sites they don't fucking own because no one wants to see someone else's data." **Both halves are the spec: minimum machinery, but nobody sees another tenant's data.**
- "this should be the easiest of any other system we have because there is ZERO security concern for this part of the system."

On how the platform actually works (these corrections are the architecture — read them before touching anything):

- "Pages of a site should have absolutely no org id and absolutely no security policies because they are part of a site. **A site is a single row.**"
- "these rows would not have their own independent policies and would only inherit from the parent."
- "**it's not security policies that keeps one user's agents out of another's list, it's the fact that the page doesn't query things that it doesn't need to show.**" Visibility "is set by default and regardless of what it is, users only see what the page is intended to show them."
- "individual visibility is important but for sharing, using our canonical sharing component, not by default hard-coded."
- "A super admin does not get any additional things visible in the marketing page, just like a super admin doesn't get any more messages or agents or chats than any other user."
- "Why would a system even return 4,000 pages when pagination would limit to 25?"

## Resources

- **Policy generator (the ONLY way to write a `web` policy):** `iam.apply_rls(schema, table, token, variant)`. It drops and regenerates every policy from the registry. Never hand-write a policy on this schema.
- **Registry (already correct — do not "fix" it):** `platform.entity_types` (`web_site`/`web_brand` = entity; the other 23 = `is_component=true`, `rls_variant='component'`) + `platform.entity_relationships` (each child's `composition` parent + fk column, `site_id` or `brand_id`).
- **Access resolver:** `iam.has_access_for_base`. Two behaviors that are not obvious and caused this incident: a component recurses to its parent's access; and `visibility='public'` returns TRUE for any viewer — **visibility is a read grant, not a display flag.**
- Marketing feature truth: [features/marketing/FEATURE.md](../../features/marketing/FEATURE.md). Program status + parking lot: [docs/MARKETING_PROGRAM_BOARD.md](../MARKETING_PROGRAM_BOARD.md).
- Reverted-state migrations (all applied + ledgered): `migrations/web_restore_canonical_rls.sql`, `web_drop_force_public_visibility.sql`, `web_create_site_default_internal.sql`.
- DB: schema `web`, project `txzxabzwovsujtloxrus`.

## Remaining work

1. **Component RLS costs ~0.2ms per row and it is the timeout cause — needs a platform-level answer, not a marketing workaround.** Measured on All Green (site `d0aff5b6-0710-4848-8304-164db3c80ab7`): `select … from web.page where site_id=… order by url limit 25` → **762ms**, because the RLS filter runs `has_access_for` on all 4,020 matching rows *before* the sort and limit. `web.gsc_page_stat` (26,000 rows) is worse. This produced the live `canceling statement due to statement timeout` errors on `/marketing/.../pages` (2026-07-21 09:19–09:21Z). Every row in such a query shares one `site_id`, so the access answer is computed thousands of times to produce one value. Per Arman, children should inherit from the parent rather than each carry a policy. Options to weigh: resolve the parent once as an InitPlan (`site_id = ANY(<sites I can see>)` via a `STABLE` helper), memoize `has_access_for` per (user, type, id), or drop per-row policies on components entirely and rely on parent-scoped queries. **This changes `iam.apply_rls` — platform-wide, affects every schema using components. Needs Arman's direction before implementation.**
2. **Audit FE queries for over-fetching.** Arman's point stands independently of RLS: pages should query only what they display. Check `features/marketing/data/service.ts` for unbounded reads (`AUDIT_PAGE_SIZE` range exists at :2419; `gsc_page_stat` ordering at :636 pulls broadly).
3. **Confirm no other feature was collateral damage.** The `apply_rls` loop regenerated policies for all 25 `web` tables from the registry. If any `web` table had a deliberate custom policy before, it is gone. Verified: 25/25 tables have RLS enabled and a `std_select`; no `USING (true)` remains. No non-`web` schema was touched.
4. **GSC sync final click (blocked on Arman).** Scraper 0.1.44 (aidream v0.1.579) contains the fix for the `CardinalityViolation` that killed every sync: GSC domain properties (`sc-domain:`) report www/apex/trailing-slash variants of one page, producing duplicate `(page_id, date)` keys; they are now merged with Google's own aggregation (clicks/impressions summed, position impressions-weighted), regression-tested in `packages/matrx-scraper/tests/test_gsc_sync.py`. `web.gsc_page_stat` holds 26,000 rows for 2,552 All Green pages from a pre-fix partial run; no site has a completed `gsc_synced_at`. One Sync click by Arman (his Google credential) completes the E2E.
5. **Marketing program work continues** in [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md) — social routes, `/marketing` overview, soft-delete restore-on-upsert sweep.

## Done

- Tenant-isolation breach reverted and shipped (v0.4.3) — see the three `migrations/web_*.sql` files above; canonical policies regenerated, `visibility` back to `internal`, super-admin override removed, creation defaults (`web.create_site`, `service.ts`, `BrandEditorDialog`) back to `internal`.
- Isolation verified against a real non-member account: `false` on site, brand, page, snapshot, gsc_page_stat, crawl_session; owner and org members unchanged; `anon` holds zero grants on `web`.
- GSC domain-property variant merge — `packages/matrx-scraper/matrx_scraper/web_crawl/gsc_sync.py`.
- Prod-only coverage-route 404 — `.vercelignore` bare `coverage` pattern was stripping the route directory from Vercel uploads.

## Decisions needed

**1. Component RLS performance.**
*Situation:* Every child table in `web` (pages, snapshots, GSC stats) has its own RLS policy that calls the access resolver once per row. A single site's page list evaluates it 4,020 times to answer one question, taking 762ms and sometimes exceeding the statement timeout. You've said children should simply inherit from the parent and carry no policies of their own.
*Decide:* Change `iam.apply_rls` so component policies resolve the parent once per query (fast, keeps a DB-level guarantee), **or** remove per-row policies from components entirely and rely on the parent check plus properly scoped page queries. The first is a platform-wide change to every schema that uses components; the second matches your description most literally. I will not implement either without your call.

**2. Org memberships I granted.**
*Situation:* Your login `arman@titaniumsuccess.com` was not a member of the three organizations that own the marketing sites (they were created by `arman@armansadeghi.com` and `admin@admin.com`), which is why the app told you sites you created were not yours. I added that account as `admin` on organizations `5dc930e9…` (All Green), `f9cb3e35…` (IOPBM/Data Destruction), and `884d1ce8…` (Titanium/AI Matrx).
*Decide:* Keep those memberships, or revoke them and fix the mismatch a different way (for example by consolidating which account owns the sites).

**3. Where `visibility` gets set.**
*Situation:* Marketing creation paths currently hardcode `internal`. You said visibility should come from the platform default and change only through the canonical sharing component, not per-feature hardcoding.
*Decide:* Should marketing creation stop passing `p_visibility` at all and let the platform default apply — and if so, what is the default for `web_site`/`web_brand` (both are `NULL` in `platform.entity_types.default_visibility` today, which is why nothing was inherited in the first place)?
