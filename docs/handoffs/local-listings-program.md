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
1. **Observed-listing capture via DataForSEO Business Data** — today `location_listing.observed`
   is only written manually. The implementation map is fully scouted (2026-08-18): add
   `DataForSeoOperationName` members + `_op(...)` entries for `business_data/business_listings/
   search/live` + `google/my_business_info` in `packages/matrx-seo` `contracts.py`/`operations.py`
   (`family="business_data"`, `SeoCapability.RAW_PROVIDER`, `raw_only=True`, pricing keys
   `business_listing`/`business_profile` already in the pricing catalog); request builder beside
   `aidream/services/seo/dataforseo.py:27`; service via `run_collection("dataforseo", request)` +
   `OrmSeoRepository().load_raw_payload` (budget guard is automatic — never call the client
   directly); non-streaming endpoint modeled on `lookup_site_competitor` (seo_collections.py:653);
   persist into `location_listing.observed` + `last_checked_at` + `source='dataforseo'` via
   `matrx_scraper.db.models_web.LocationListing` managers. The FE audit engine renders verdicts
   the moment data lands. Note `validate_live_cardinality`: one task per LIVE call.
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
