---
status: open
owner: none
updated: 2026-08-18
---

# Local & Listings — from live pillar to Yext-class listings management

**Vision:** a listings-management product better than the incumbents (Yext / BrightLocal / Moz Local
for management breadth; Yoast Local SEO for on-page structured data — we already exceed Yoast:
they generate LocalBusiness schema, we generate it AND track/audit real directory presence).
Research SoR: `common-docs/systems/local-listings/RESEARCH.md` (publisher tiers, API accessibility,
the practical sequencing path). Naming: "Location / Listing / Publisher" are working labels —
lexicon ruling reserved for Arman.

## Live today (2026-08-18, browser-verified end-to-end)

Three certified-canonical tables (`web.business_location` component of brand, `web.listing_publisher`
system registry with 29 research-seeded rows, `web.location_listing` component of location) ·
guarded FE CRUD + hooks · NAP audit engine (normalized field verdicts, weighted citation coverage,
profile gaps — `features/marketing/lib/local-listings-audit.ts`, 14 tests) · LocalBusiness JSON-LD
generator · `/marketing/local` workspace (org-agnostic brand picker, URL-synced selection, profile
editor with gap explainers, per-publisher matrix with doors, KPI strip). Coming-soon promise
deleted; review row `9489536a-fa7d-41a6-b252-e41e4ae2e4e3` awaits Arman.

## Open, dependency-ordered

0. ~~On-site verification~~ SHIPPED 2026-08-18: the workspace's "On-site structured data" card
   reads the latest homepage crawl snapshot (keyed on `path='/'` — never URL equality; www/apex
   twins), detects LocalBusiness JSON-LD (@graph-aware, `findLocalBusinessJsonLd`) and audits the
   declared NAP against the canonical profile. Live-verified against aimatrx.com's real crawl.
   Baseline measured across all 12 crawled sites: only 3 declare LocalBusiness (blancacleaningdfw,
   cosmeticinjectables, pbw-law); aimatrx.com declares NOTHING.
1. ~~Google listing reads~~ SHIPPED 2026-08-18, live-proven: DataForSEO Business Data ops
   registered in matrx-seo (`business_data.google.my_business_info` + `business_listings.search`,
   RAW_PROVIDER/raw_only, budget-guarded), `aidream/services/seo/local_listings.py`
   (keyword ladder → learns `google_cid`/`google_place_id` into `business_location.identifiers`
   on first hit so refreshes are deterministic `cid:` lookups; "No Search Results" = not_listed,
   never an error), endpoint `POST /seo/local/locations/{id}/google-listing`, FE per-row
   "Fetch live data" button + per-listing observed-NAP verdict line. Proof: Titanium Success's
   real Google listing (780 Roosevelt, Irvine; place_id ChIJM2Cx…) fetched live and persisted to
   `web.location_listing` with `source='dataforseo'`. Next on this line: scheduled refresh sweep
   (all locations, staleness-driven), Bing/Apple read equivalents, `business_listings/search`
   coordinate-based discovery for candidate matching when the keyword ladder misses.
2. **AI enrichment (mandates only)** — a location-description writer and a category suggester as DB
   agents on new mandates (NO hardcoded prompts); assists chips on the workspace
   (`<AssistStrip surfaceName>` + a `marketing-local` surface manifest, which is also still owed for
   agent runtime values — follow `surface-authoring` skill).
3. **Publisher write paths, in research order** — Google Business Profile API (needs the access
   application: verified GBP 60+ days old; HUMAN gate for Arman), Meta Pages OAuth (existing
   Google/Meta OAuth + Unified Credential Vault precedents; dormant `google_business_profile_access`
   credential definition already exists in aidream), Data Axle + Foursquare open APIs, then
   Bing/Apple partner applications (HUMAN gates: partneronbp@microsoft.com, Apple Third-Party
   Partner registration). Every submission requires owner authorization — consent flow first.
4. **Reviews + map-pack integration** — surface `local_pack` rank targets (already live in
   `/marketing/ranks`) inside the location workspace (both directions per canvas rung 6); review
   snapshots via DataForSEO `google/reviews` as append-only observations.
5. **Location pages** — connect locations to the content plan's `location-page` type
   (`plan.profile.schema_org_map` already maps it to LocalBusiness; nothing reads it yet) so the
   generated JSON-LD ships ON a page instead of via copy-paste; opening-hours/special-hours editor
   UI (fields exist, no editor yet — jsonb is written but only creatable via agents/SQL today).
6. **Adversarial pass + mobile check** — run the ui/mobile patrols on the workspace; the matrix
   table is a plain table, not `MatrxDataTable` (deliberate v1: 29 fixed config rows with inline
   controls) — revisit when the registry grows or needs sort/filter.

## Decisions reserved for Arman

- Naming: Location / Listing / Publisher (and whether `web.listing_publisher` should fold into
  `web.provider` — recommended NO: different role per db-rules §1a).
- GBP API access application (human-gated, ~7-14 days) — when to file it and under which GBP.
