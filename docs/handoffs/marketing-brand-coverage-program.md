---
status: active
updated: 2026-07-20
repos: [matrx-frontend, aidream]
vision: []
---

# Marketing — Brand-first platform + coverage program

## Vision — Arman's words

- "a website is only one of many assets a company has that a marketing company has to manage… they will also have an Instagram account, accounts on Facebook, an x, TikTok, and YouTube… Let's build this correctly right now… Let's think about putting the structure in place today that we will be able to grow into tomorrow."
- Brand is the anchor name: "the name 'Brand' makes a lot more sense" — built for marketing companies, but "for 95% of our orgs, it's actually their own brand or brands they're managing."
- Discovery review: "having this page that is this highly dynamic UI that allows a user who's a marketing expert to go through everything we have found and essentially tell us what these things are… oh, wow. That's the company's logo."
- Routing: "marketing/brands/[id]/sites/[id]… That would then leave room for… marketing/resources, marketing/tools/meta-tile-checker… marketing/brands/[id]/socials/instagram/[id]".
- Core-first: "I'm not focused on the AI integration parts because we still need to just get the core working where we can connect a site… properly reads the sitemap and that you can click to see the sitemaps and we can actually manage them… if we're connecting to Google Search Console, where is that data going?… we need to have our canonical pages act as somewhat of our anchors so that then everything attaches to those… an exhaustive list of external links and then also internal links and that they all eventually reconcile somewhere."
- Editing doctrine: "give me FULL AND COMPLETE access to edit ALL editable things at that level. No hiding data from the user… easy and direct to edit either directly in the table or via a window panel component or both."
- Errors: nothing silent, ever; everything lands in the admin Error Inspector. Bar: "BETTER be better than" Botify/Screaming Frog-class tools.

## Resources

- [features/marketing/FEATURE.md](../../features/marketing/FEATURE.md) — authoritative; read before any code. Invariants: routes only via `lib/routes.ts`, statuses only via `lib/site-status.ts`, toast only via `@/lib/toast`, machine writes → `discovered_item` only, no hover-underline name-links (whole-row click).
- Data layer: `features/marketing/data/service.ts` (+hooks.ts) — follow its exact patterns (column-list constants, bounded ranges, id tie-breaks, batched `.in()` enrichment).
- Scraper commands: `features/marketing/crawler/direct-client.ts` (streamCommand; auto-captures failures to the Error Inspector, source `marketing-crawler`).
- Server twin: aidream `packages/matrx-scraper` — `web_crawl/sitemap_sync.py`, `web_crawl/service.py`, `web_crawl/FEATURE.md`. All logic in importable service functions (future workflow nodes).
- DB: schema `web` on project `txzxabzwovsujtloxrus`. New-table recipe (registry rows in `platform.entity_types`/`entity_relationships` → `iam.apply_rls` → grants → base triggers) is modeled in [migrations/web_sitemaps.sql](../../migrations/web_sitemaps.sql). Migrations: apply via Supabase MCP + upsert `public._schema_migrations` (source matrx-frontend, sha256 checksum, duration_ms 0) + `pnpm db-types`. ON CONFLICT arbiters must be plain (NULLS NOT DISTINCT) uniques — partial/expression indexes broke the scraper twice.
- Test login: `http://localhost:<port>/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/marketing/brands` (session hook prints the URL) or `/login` admin@admin.com / Password1234#. Turbopack trap: new/moved route dirs sometimes need a dev-server restart (stale route-graph cache reports phantom conflicts).

## Remaining work

1. **Land the in-flight fleet (dispatched 2026-07-20, may already be committed — verify, don't redo):**
   - aidream agent: discovered-items ON CONFLICT retarget to `(brand_id, category, guessed_kind, url, value_hash)` (index already live; value_hash is a stored generated column — never inserted), Wave 2 GSC sync (`web.gsc_page_stat` + `site.gsc_synced_at`/`gsc_sync` via aidream migrations; command `sites/{id}/gsc/sync`), Wave 4 link resolution (`link_edge.target_page_id` + `sites/{id}/links/resolve`).
   - matrx-frontend agent: Wave 3 Coverage matrix (`/coverage` route, source-disagreement tiles → filtered pages lists), Wave 5 page-workspace rebuild (SERP/social previews, headings, indexability, content stats — kills the JsonPreview dumps), Wave 2 FE (GSC sync button, freshness in site-status, clicks/impressions columns).
2. **Deploy the scraper service** (scraper.app.matrxserver.com) from aidream main — sitemap sync, initialize screenshot fix, and the fleet's server work are all dormant until deployed. Then E2E on All Green Recycling: initialize (expect 4 screenshots + discovered items + zero `initialization.errors`), sitemaps sync (expect ~33 docs / ~3.7k pages), review discovery inbox, GSC sync.
3. **Editors for the deeper levels** — properties, brand assets, business facts currently have no edit/delete UI (create-by-promotion only). Per the editing doctrine: full-field editors + delete, table-inline or window panel. Build once real discovery data flows (post-deploy) so they edit real rows.
4. **Social properties lifecycle** — confirming a discovered social profile should ALSO create/attach the `web.property` row (today confirmation only writes `business_fact`). Then `brands/[id]/socials/...` routes per Arman's URL sketch.
5. **`/marketing` overview page** — currently a redirect to `/brands` (deliberate stopgap). Build the real workspace overview when the coverage data exists to populate it.
6. **Repo-wide sonner→`@/lib/toast` migration** — running as separate user-started task (task chip); if it stalls, the recipe is in `lib/toast.ts`'s header + ESLint ban.
7. **Backlog (post-coverage):** GSC-submitted-sitemaps vs ours diff UI; external-link domain rollup UI (Wave 4 FE); analysis/finding workers (score columns intentionally hidden until then); brand-level discovery inbox aggregation; duplicate "Titanium Success"/"AI Matrx" test sites+brands in other orgs — Arman deletes via UI.

## Done

- Brand layer live — `web.brand/property/brand_asset/business_fact/discovered_item`, canonical RLS, `create_site` creates-or-reuses brand; see migrations/web_brand_layer*.sql.
- Brand-first routing — `/marketing/brands/[brandId]/sites/[siteId]/**`, legacy flat URLs client-redirect; see `lib/routes.ts`, `app/(core)/marketing/`.
- Brands hub + cockpit + full brand CRUD (all-fields editor dialog, delete guarded by owned sites), site Danger-zone delete — `components/brands/`.
- Discovery inbox with confirm→asset/fact promotion, verified E2E — `components/discovery/`.
- Sitemaps vertical (tables + workspace + per-sitemap page lists + sync command) — `components/sitemaps/`, server `sitemap_sync.py`.
- Site overview rebuilt (initialize flow, connections board, identity edit-in-place, loud per-step failure panel).
- Error capture: `marketing-crawler` red source at scraper chokepoints; captured sonner wrapper `lib/toast.ts` (marketing migrated).
- Constraint fixes from first prod run (screenshot kinds, discovered value_hash dedup) — migrations/web_initialize_constraint_fixes.sql.

## Decisions needed

*(none — deploy in item 2 is an action, not a decision)*
