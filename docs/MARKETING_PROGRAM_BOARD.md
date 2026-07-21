# Marketing Program Board — start here

One page that tells any agent (or Arman) what this program is, what's in motion, and where to pick up work. **Rules:** when you start something, add/claim a line in **In motion** (1–2 sentences, your name/session); when you finish, move it to Shipped in the [handoff](handoffs/marketing-brand-coverage-program.md) and delete your line here; found a bug or something you won't fix yourself → add it to **Parking lot** at the bottom so it's never lost. Keep everything to a sentence or two — detail lives in the linked docs, not here.

## The vision (Arman's words)

- "a website is only one of many assets a company has… they will also have an Instagram account, accounts on Facebook, an x, TikTok, and YouTube… Let's build this correctly right now… putting the structure in place today that we will be able to grow into tomorrow." **Brand** is the anchor entity; a website is one property among many.
- "get the core working where we can connect a site… properly reads the sitemap… if we're connecting to Google Search Console, where is that data going?… our canonical pages act as our anchors so that everything attaches to those… an exhaustive list of external links and internal links that all eventually reconcile somewhere."
- "give me FULL AND COMPLETE access to edit ALL editable things at that level. No hiding data from the user."
- Everything scraped is public data → **everyone gets view access** (live). Writes stay owner/org-scoped.
- Nothing fails silently — every error lands in the admin Error Inspector. Bar: better than Botify / Screaming Frog.
- Platform rule: **every page, section, card, and table carries Copy + Copy-for-AI** (`components/agent-copy`).

## Where to get what

| Need                                               | Go to                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Full work order, remaining items, decisions needed | [docs/handoffs/marketing-brand-coverage-program.md](handoffs/marketing-brand-coverage-program.md)                                |
| Feature truth (invariants, CRUD map, data model)   | [features/marketing/FEATURE.md](../features/marketing/FEATURE.md)                                                                |
| Scraper twin (commands, contracts, deployment env) | aidream `packages/matrx-scraper/matrx_scraper/web_crawl/FEATURE.md`                                                              |
| Copy/Copy-for-AI pattern                           | `features/marketing/lib/copy-payloads.ts` + the `agent-copy` skill; exemplar `components/pages/PageWorkspace.tsx`                |
| Scraper commands from the browser                  | `features/marketing/crawler/direct-client.ts`                                                                                    |
| DB                                                 | schema `web`, project `txzxabzwovsujtloxrus`; migrations via Supabase MCP + `public._schema_migrations` ledger + `pnpm db-types` |
| Test login                                         | `/login` admin@admin.com / Password1234#, or the dev-login URL your session hook prints                                          |

**DEV SERVER RULE (non-negotiable):** do NOT start your own `pnpm dev`. Check for a running server first (`lsof -nP -iTCP -sTCP:LISTEN | grep next` — there is usually one on **http://localhost:3050**) and share it. Multiple `.next` build dirs balloon memory and crash the machine. Never kill a server you didn't start.

**Ship rule:** small local commits as you go; push ONLY via `release.sh` (both repos). `pnpm type-check` must be green before any commit — the build does not check types.

## In motion

- **Claude (main session):** LIVE tonight: (1) web.* reads are constant-time for any authenticated user — per-row iam.has_access removed from every std_select (was 5k calls/query = statement timeouts, verified dead: All Green 4,020 pages renders instantly); (2) writes keep gates + super-admin override; (3) Arman's titaniumsuccess account is org-admin of his three orgs (write on All Green proven via RLS simulation); (4) GSC CardinalityViolation fix released in aidream v0.1.579 (domain property sc-domain:iopbm.com is the live binding — variant merge IS the sc-domain enabler). Watchers running: FE release when tree comes clean; PyPI scraper publish confirm. Remaining: ONE Sync click after scraper redeploys.
- **Claude (section-canonicalization session):** done for now — page-audit system + URL quality + site `.../audit` dashboard all shipped (handoff Done). NOTE for next release: aidream local commits add `audit_metrics` (incl. url section) stamping to the scraper; after deploy, re-run `scripts/marketing/backfill-snapshot-metrics.ts` to fill gap-window snapshots.
- **Arman:** GSC unblock — confirm `AIDREAM_URL` + `AIDREAM_SERVICE_TOKEN` env on the scraper service, reconnect Google at `/marketing/connections`, hit Sync. Then the full E2E on All Green Recycling.

## Up next (in order)

1. Fresh initialize on All Green (should clear the stale error panel — needs Arman or editor access).
2. GSC E2E once Arman reconnects (gsc_page_stat rows + pages Clicks/Impr/Pos + coverage Google cells).
3. Social routes (`brands/[id]/socials/...`) — property rows already created by discovery promotion.
4. Soft-delete restore-on-upsert sweep server-side (handoff item; the class rule is written there).

## Parking lot — grab one, note your name, go

Small, delegatable, not worth stopping the main line. Move to "In motion" when you take one; delete when shipped (record it in the handoff's Done).

- **Header overlap at 1500–1700px:** Marketing's 13-mode pill renders over the site name. Fix in the shared shell primitive `features/shell/components/header/RouteModeNav.tsx` / `EntityModeHeader.tsx`; test with the marketing site shell (longest mode list).
- **`/marketing` overview page** is a redirect to `/brands` — build the real workspace overview (list-first, per the feature-entry doctrine).
- **Access page grantee picker:** `/access` takes raw UUIDs; needs the platform user/org picker instead.
- **Brand-move human click-through:** SiteEditorDialog's Brand dropdown (`web.move_site_brand`) needs one human test — automation can't drive that Radix Select.
- **Duplicate test brands/sites** ("Titanium Success" ×2, "AI Matrx" ×2) now visible to everyone via public view — Arman deletes via UI, or an agent with his go-ahead.
- **Repo-wide sonner→`@/lib/toast` migration** — separate task chip exists; recipe in `lib/toast.ts` header.
- **Decisions waiting on Arman** (full context in the handoff's Decisions section): (a) captured-HTML retention — recommend content-hash dedupe; (b) public-view boundary — do GSC stats / cost / connections stay org-only?

- **Fetch-now on a redirecting page:** the snapshot lands on the FINAL URL's page row (crawl semantics), so the clicked page shows no new capture while the toast says success. Consider resolving the redirect and toasting/navigating to the landing page row. (`persistence.py` keys on `final_url`; `FetchPageButton` invalidates only the clicked pageId.)
- **Latent RSC trap:** `SectionCard`'s `copy` prop takes functions — the first SERVER component to pass it will hit a serialization error (`MarketingUi.tsx` has no "use client"). Fine today; worth a guard comment or client-only split if server usage grows.

<!-- Add new findings below this line: one bullet, file/route, one-sentence symptom, one-sentence suggested fix. -->

- **Snapshot with invalid artifact reference:** `web.snapshot` 7ab64ab8-b32e-4572-85f1-6a10cdbfb408 fails `snapshot_validate_artifact_files` on ANY update ("invalid canonical crawl artifact file 663f64c1-4ec4-4b74-bc84-9228254edd54") — its body_file_id no longer validates; decide whether to repair the files row or soft-delete the snapshot (it was the one row the metrics backfill could not stamp).

- **Public-by-default creation is broken:** the normal site flow hardcodes `p_visibility: "personal"`, the latest `web.create_site` RPC still defaults personal, and the brand editor defaults new brands personal, so records created after the public-view backfill become locked again; make every creation authority public by default and add a cross-user creation regression test.
- **Crawler scope escape:** `crawler.py::_registrable_domain()` treats the last two labels as the registrable domain, so `follow_subdomains=true` considers unrelated hosts such as `evil.co.uk` and `example.co.uk` the same site; use the package's existing `tldextract` dependency and add public-suffix tests.
- **No per-site active-run/monotonic-current guard:** `WebCrawlRepository.create_session()` permits overlapping writers, while page current pointers and negative reconciliation update unconditionally; atomically claim one active full crawl per site and make current-pointer writes timestamp-monotonic.
- **A running crawl is unmanageable after leaving the launch screen:** live UI verification showed `/crawls` with a running row, an enabled second `Start crawl`, a frozen duration, no open/cancel/resume action, and only `Delete`; implement persisted polling/reattach, one-active-run behavior, and cancel controls on history/detail.
- **Active-work deletion hazard:** `deleteSite()` / `deleteCrawlSession()` can soft-delete queued/running work without canceling it, after which the worker can continue writing while terminal updates and the stale-session reaper ignore the hidden session; enforce cancel-to-terminal before deletion in the database/command boundary.
- **Crawler input fails open:** invalid include/exclude regexes are accepted by `CrawlStartRequest` and silently skipped by `_compile_patterns()`, potentially widening a constrained crawl; validate all patterns at the request boundary and return 422 before creating a session.
- **Canonical page state corruption:** `_persist_failed_url_in_active_transaction()` marks an existing page `missing` for every fetch failure, including transient/network/render failures; keep failure on the crawl outcome and change canonical presence only from qualified negative evidence or authoritative HTTP results.
- **Crawl defaults are lossy:** Site settings omits valid server fields/modes and replaces the whole `crawl_defaults` object, deleting advanced values written elsewhere; round-trip the full typed contract and expose basic scope/depth/include/exclude/throttle controls.
- **The overview claims success before analysis exists:** the real site overview simultaneously renders `Site score — Awaiting analysis` and a green `Open findings 0 — No open issues`; represent this as `Not analyzed` until at least one qualifying analysis run exists.
- **Discovery review does not scale:** the inbox silently caps at 500 candidates and requires one-by-one confirm/dismiss with no selection or bulk action; add controlled pagination plus bulk confirm/dismiss/type assignment for high-confidence groups.
- **Brand asset authority is incomplete:** `brand_asset.file_id`/`source='uploaded'` exist but the editor creates URL-only manual rows, file-backed assets do not render through Files, and multiple assets can be primary without synchronizing brand/site identity; wire canonical upload/rendering and enforce one atomic primary per brand/type.
- **Brand/site soft-delete drift:** deleting a site leaves its live `property(kind='website')` row, allowing the owning brand to be deleted while a live property still points at the hidden site; make the lifecycle transition atomic across both authorities.
