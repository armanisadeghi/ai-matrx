# Marketing Program Board — start here

One page that tells any agent (or Arman) what this program is, what's in motion, and where to pick up work. **Rules:** when you start something, add/claim a line in **In motion** (1–2 sentences, your name/session); when you finish, move it to Shipped in the [handoff](handoffs/marketing-brand-coverage-program.md) and delete your line here; found a bug or something you won't fix yourself → add it to **Parking lot** at the bottom so it's never lost. Keep everything to a sentence or two — detail lives in the linked docs, not here.

## The vision (Arman's words)

- "a website is only one of many assets a company has… they will also have an Instagram account, accounts on Facebook, an x, TikTok, and YouTube… Let's build this correctly right now… putting the structure in place today that we will be able to grow into tomorrow." **Brand** is the anchor entity; a website is one property among many.
- "get the core working where we can connect a site… properly reads the sitemap… if we're connecting to Google Search Console, where is that data going?… our canonical pages act as our anchors so that everything attaches to those… an exhaustive list of external links and internal links that all eventually reconcile somewhere."
- "give me FULL AND COMPLETE access to edit ALL editable things at that level. No hiding data from the user."
- **Access = the platform standard, nothing bespoke.** `web.site`/`web.brand` are entities; every child (page, snapshot, gsc_page_stat…) is a registered *component* whose access resolves through its parent site/brand — children carry no org_id and no rules of their own. Policies come ONLY from `iam.apply_rls`; never hand-write them. `visibility='public'` is a READ GRANT to every authenticated user, not a display flag. A super admin gets NO extra marketing rows, exactly as they get no extra chats or agents.
- Nothing fails silently — every error lands in the admin Error Inspector. Bar: better than Botify / Screaming Frog.
- Platform rule: **every page, section, card, and table carries Copy + Copy-for-AI** (`components/agent-copy`).

## Where to get what

| Need                                               | Go to                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Access model, RLS, visibility — read before touching any of it** | [docs/handoffs/marketing-brand-coverage-program.md](handoffs/marketing-brand-coverage-program.md) (Access model section — the former access-and-rls handoff is merged there) |
| Full work order, remaining items, decisions needed | [docs/handoffs/marketing-brand-coverage-program.md](handoffs/marketing-brand-coverage-program.md)                                |
| Module shape: pillars, reserved routes, nav, landing | [docs/handoffs/marketing-module.md](handoffs/marketing-module.md)                                                                |
| Page workspace authoring layer | [docs/handoffs/marketing-page-workspace-evolution.md](handoffs/marketing-page-workspace-evolution.md)                            |
| Feature truth (invariants, CRUD map, data model)   | [features/marketing/FEATURE.md](../features/marketing/FEATURE.md)                                                                |
| Scraper twin (commands, contracts, deployment env) | aidream `packages/matrx-scraper/matrx_scraper/web_crawl/FEATURE.md`                                                              |
| Copy/Copy-for-AI pattern                           | `features/marketing/lib/copy-payloads.ts` + the `agent-copy` skill; exemplar `components/pages/PageWorkspace.tsx`                |
| Scraper commands from the browser                  | `features/marketing/crawler/direct-client.ts`                                                                                    |
| DB                                                 | schema `web`, project `txzxabzwovsujtloxrus`; migrations via Supabase MCP + `public._schema_migrations` ledger + `pnpm db-types` |
| Test login                                         | `/login` admin@admin.com / Password1234#, or the dev-login URL your session hook prints                                          |

**DEV SERVER RULE (non-negotiable):** do NOT start your own `pnpm dev`. Check for a running server first (`lsof -nP -iTCP -sTCP:LISTEN | grep next` — there is usually one on **http://localhost:3050**) and share it. Multiple `.next` build dirs balloon memory and crash the machine. Never kill a server you didn't start.

**Ship rule:** small local commits as you go; push ONLY via `release.sh` (both repos). `pnpm type-check` must be green before any commit — the build does not check types.

## In motion

- **Claude (marketing consolidation session, 2026-07-28):** merged the access-and-rls handoff into the brand-coverage program doc, groomed the marketing doc family, collapsing the duplicate public-tools index onto `marketing-nav.ts`, shipping `/marketing/ranks` (cross-site rank hub).

## Up next (in order)

1. Component-RLS: RULED 2026-08-08 (THE COMPONENT-ACCESS PRECEDENT, `common-docs/systems/access-architecture/FEATURE.md`) — once-per-query parent membrane via `iam.apply_rls`; implementation chip dispatched. **GSC is UNBLOCKED and synced** (70,945 `gsc_page_stat` rows across 7 sites through 2026-07-26, verified in DB 2026-07-28) — the old GSC-unblock lines here are done.
2. Social routes (`brands/[id]/socials/...`) — property rows already created by discovery promotion.
3. Soft-delete restore-on-upsert sweep server-side (handoff item; the class rule is written there).
4. `/marketing/campaigns` — the highest-leverage reserved surface (schema design needs Arman; see marketing-module handoff).

## Parking lot — grab one, note your name, go

Small, delegatable, not worth stopping the main line. Move to "In motion" when you take one; delete when shipped (record it in the handoff's Done).

- **Header overlap at 1500–1700px:** Marketing's 13-mode pill renders over the site name. Fix in the shared shell primitive `features/shell/components/header/RouteModeNav.tsx` / `EntityModeHeader.tsx`; test with the marketing site shell (longest mode list).
- **Access page grantee picker:** `/access` takes raw UUIDs; needs the platform user/org picker instead.
- **Brand-move human click-through:** SiteEditorDialog's Brand dropdown (`web.move_site_brand`) needs one human test — automation can't drive that Radix Select.
- **Duplicate test brands/sites** ("Titanium Success" ×2, "AI Matrx" ×2) now visible to everyone via public view — Arman deletes via UI, or an agent with his go-ahead.
- **Repo-wide sonner→`@/lib/toast` migration** — separate task chip exists; recipe in `lib/toast.ts` header.
- ~~Decisions waiting on Arman~~ — all RULED 2026-08-08 (see the handoff's Decisions section): component-RLS precedent set · org-scoped visibility IS the end state (the "everyone views scraped data" line was a retracted misreading) · content-hash dedupe approved (in flight) · analysis workers commissioned (chip).

- **Fetch-now on a redirecting page:** the snapshot lands on the FINAL URL's page row (crawl semantics), so the clicked page shows no new capture while the toast says success. Consider resolving the redirect and toasting/navigating to the landing page row. (`persistence.py` keys on `final_url`; `FetchPageButton` invalidates only the clicked pageId.)
- **Latent RSC trap:** `SectionCard`'s `copy` prop takes functions — the first SERVER component to pass it will hit a serialization error (`MarketingUi.tsx` has no "use client"). Fine today; worth a guard comment or client-only split if server usage grows.

<!-- Add new findings below this line: one bullet, file/route, one-sentence symptom, one-sentence suggested fix. -->

- **Snapshot with invalid artifact reference:** `web.snapshot` 7ab64ab8-b32e-4572-85f1-6a10cdbfb408 fails `snapshot_validate_artifact_files` on ANY update ("invalid canonical crawl artifact file 663f64c1-4ec4-4b74-bc84-9228254edd54") — its body_file_id no longer validates; decide whether to repair the files row or soft-delete the snapshot (it was the one row the metrics backfill could not stamp).

- **Public-by-default creation is broken:** the normal site flow hardcodes `p_visibility: "personal"`, the latest `web.create_site` RPC still defaults personal, and the brand editor defaults new brands personal, so records created after the public-view backfill become locked again; make every creation authority public by default and add a cross-user creation regression test.
- ~~**Crawler scope escape**~~ — DONE 2026-08-08 (scraper v0.1.90): `_registrable_domain()` uses tldextract's offline PSL snapshot; co.uk/com.au/github.io separation tested.
- **No per-site active-run/monotonic-current guard:** MOSTLY DONE 2026-08-08 (scraper v0.1.90–92): `prepare_start` reaps stale sessions then 409s on a live full/list session, with a create-then-re-list loser election as the race backstop; cancel of an orphaned queued session goes terminal instead of extending the block; FE routes to the live run instead of offering a second Start. Still open: timestamp-monotonic current-pointer writes, and an airtight DB partial-unique arbiter if the app-level election ever proves insufficient.
- ~~**A running crawl is unmanageable after leaving the launch screen**~~ — DONE 2026-08-08 (browser-verified against a live run): `/crawls` running rows tick duration live and carry Cancel, Start becomes "Open live crawl" while one runs, crawl summary has Cancel + Watch live + 5s poll fallback; launch-screen reattach was already live via `useSiteCrawlActivity`.
- **Active-work deletion hazard:** FE half DONE 2026-08-08 — deleting an active crawl session (or a site with one) cancels-to-terminal first and refuses the delete if cancel fails; queued-orphan cancel now goes terminal server-side (v0.1.91). Still open: a DB/command-boundary guard rejecting soft-delete of a live-leased session (defense in depth behind the FE flow).
- ~~**Crawler input fails open**~~ — DONE 2026-08-08: FE validates inline and refuses to submit; server 422s in `CrawlStartRequest` before a session exists (v0.1.90), and `_compile_patterns` emits a durable crawl_warning if a bad pattern ever reaches it. Known limitation: FE validates with JS RegExp, server with Python re — Python-only idioms like `(?i)` are blocked client-side (file separately if it bites).
- ~~**Canonical page state corruption**~~ — DONE 2026-08-08 (v0.1.90–91): presence changes only on authoritative HTTP evidence — 410 immediate gone, 404 debounced via the shared consecutive-miss counter (single-counted across failure path + reconcile), transient/network/5xx/429 failures never touch an existing page's status; already-trashed pages are never re-soft-deleted.
- ~~**Crawl defaults are lossy**~~ — DONE 2026-08-08: ONE canonical round-trip (`features/marketing/crawler/crawl-defaults.ts`, full contract, merge-not-replace, all render modes) consumed by Site settings + launch form; settings now expose depth/throttle/pattern controls.
- **The overview claims success before analysis exists:** the real site overview simultaneously renders `Site score — Awaiting analysis` and a green `Open findings 0 — No open issues`; represent this as `Not analyzed` until at least one qualifying analysis run exists.
- ~~**Discovery review does not scale**~~ — DONE 2026-08-08 (browser-verified dismiss/restore round-trip): `listDiscoveredItems` is now controlled pagination with a true exact count (id tie-break ordering, 50/100/250 page sizes, honest "Showing X–Y of Z" pager); the inbox has per-row/per-category/page multi-select with bulk confirm (routed through the canonical per-item promotion functions; Other-typed items are skipped with an explicit toast because Other requires a per-item label), bulk dismiss, bulk restore, bulk type-assign (enabled only when the selection shares one type pool), and confirm-gated bulk delete.
- ~~**Brand asset authority is incomplete**~~ — DONE 2026-08-08 (`migrations/web_brand_asset_primary_and_site_property_lifecycle.sql`, live + trigger-tested): `BrandAssetEditorDialog` uploads through the canonical file handler (`source='uploaded'`, staged preview, replace-file on edit); cockpit tiles render `file_id` assets via `CaptureThumb`/`InlineMediaRef` (opens the platform file viewer); one primary per (brand, kind) is atomic at the DB (`_single_primary` BEFORE-trigger demotes live siblings + partial unique index), and a primary logo/favicon/og_image/twitter_image with a public `source_url` syncs the brand identity columns via `_sync_brand_identity` (file-only assets deliberately never write identity URLs — those must be the brand's own public URLs).
- ~~**Brand/site soft-delete drift**~~ — DONE 2026-08-08 (same migration): `_cascade_website_property` soft-deletes/restores the site's `property(kind='website')` row atomically with the site (restore matches the exact cascade stamp, so independently-deleted properties stay deleted); `_soft_delete_guard` on `web.brand` refuses delete while ANY live site or property remains (FE `deleteBrand` preflights both for friendly copy); the 7 drifted live properties on deleted sites/brands were backfilled to deleted.
