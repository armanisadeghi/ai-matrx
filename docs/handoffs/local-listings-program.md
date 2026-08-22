---
status: open
owner: none
updated: 2026-08-21
---

# Local & Listings — from live pillar to Yext-class listings management

**Vision:** a listings-management product better than the incumbents (Yext / BrightLocal / Moz Local
for management breadth; Yoast Local SEO for on-page structured data — we already exceed Yoast:
they generate LocalBusiness schema, we generate it AND track/audit real directory presence).
🚨 **2026-08-18 strategic pivot — read `common-docs/systems/marketing/local-listings/VISION.md` FIRST.**
Agent-guided native listings (AI logs in as the business via the persistent cloud browser + Vault,
writes unique per-site content) are now the PRIMARY strategy; aggregator cascade is demoted to a
secondary tactic. This changes what Class C (browser-agent forms) is for — it's no longer the
long-tail fallback, it's the product.
Program plan (four automation classes, workstreams, Codex access briefs): `common-docs/systems/marketing/local-listings/PLAN.md`. Research SoR: `common-docs/systems/marketing/local-listings/RESEARCH.md` (publisher tiers, API accessibility,
the practical sequencing path — still valid, now secondary strategy). Naming: "Location / Listing
/ Publisher" are working labels — lexicon ruling reserved for Arman.

## Live today (2026-08-18, browser-verified end-to-end)

Three certified-canonical tables (`web.business_location` component of brand, `web.listing_publisher`
system registry (research-seeded, agent-grown, 740 live rows as of 2026-08-21), `web.location_listing` component of location) ·
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
2. ~~Endowment analysis → registry + task queue~~ SHIPPED 2026-08-21: the Endowment
   Model now produces WORK, not prose. `/marketing/local` → "Endowment analysis" card has
   TWO paths off one input set, both DB-bound Mandates sharing the call-site Provision
   `marketing.local_endowment`:
   - **Read the analysis** (`marketing.endowment_analysis`) — the narrative pass, streamed
     into the floating run window. Unchanged.
   - **Build portfolio** (`marketing.endowment_portfolio` → DB agent `Endowment Portfolio
     Builder`, `a96508ce-84a0-4671-b142-5824f6320a35`) — structured output (per-endowment
     verdicts, ranked artifacts, registry-shaped platforms, Tier-3 concepts), streamed
     inline via `useLiveAgentRun` + `<LiveRunDisplay>`, then rendered as actionable rows:
     **Add to registry** writes a `web.listing_publisher` row through the WS7 intake
     contract (`addDiscoveredPublisher`: upsert by slug, system org, `visibility='public'`,
     dedup by DOMAIN first against a `readAllRows` complete read, re-checked at write time
     so two tabs can't race in duplicates; sort_rank 420-470 so discovered rows land below
     the curated registry); **Queue as task** turns an accepted artifact into an idempotent
     `wsp_upsert_system_task` row (`origin='agent'`, `source_type='marketing_brand'`,
     source_id = brand, dedupe key = brand + artifact title) linked back to this surface.
     Pure layer + 25 tests: `features/marketing/local/endowment-portfolio.ts`.
   **Found and fixed en route:** `marketing.endowment_analysis` (added 2026-08-18) declared
   no input contract, so aidream's `client_mandates.py` raised at import, the boot-time
   mandate sync never ran, and NEITHER endowment mandate row existed in the database — the
   shipped card was launching a mandate key that wasn't there. Both rows are live now.
   **Open on this line:** the registry write is super-admin-only by the table's RLS
   (`std_insert` gates system-org inserts on `is_super_admin()`); a non-admin sees every
   verdict and can queue every artifact but gets a reason instead of the registry button.
   If agent-guided discovery should be open to normal operators, that is an access decision
   for Arman, not a thing to widen unilaterally. Also unbuilt: nothing yet reads the
   `metadata.discovered_by` provenance back out (per-row provenance surface, PLAN.md WS7
   "later hardening"), and Tier-3 concepts are displayed but have no action of their own.
3. **AI enrichment (mandates only)** — a location-description writer and a category suggester as DB
   agents on new mandates (NO hardcoded prompts); assists chips on the workspace
   (`<AssistStrip surfaceName>` + a `marketing-local` surface manifest, which is also still owed for
   agent runtime values — follow `surface-authoring` skill).
4. **Publisher write paths, in research order** — Google Business Profile API (needs the access
   application: verified GBP 60+ days old; HUMAN gate for Arman), Meta Pages OAuth (existing
   Google/Meta OAuth + Unified Credential Vault precedents; dormant `google_business_profile_access`
   credential definition already exists in aidream), Data Axle + Foursquare open APIs, then
   Bing/Apple partner applications (HUMAN gates: partneronbp@microsoft.com, Apple Third-Party
   Partner registration). Every submission requires owner authorization — consent flow first.
5. **Reviews + map-pack integration** — surface `local_pack` rank targets (already live in
   `/marketing/ranks`) inside the location workspace (both directions per canvas rung 6); review
   snapshots via DataForSEO `google/reviews` as append-only observations.
6. **Location pages** — connect locations to the content plan's `location-page` type
   (`plan.profile.schema_org_map` already maps it to LocalBusiness; nothing reads it yet) so the
   generated JSON-LD ships ON a page instead of via copy-paste; opening-hours/special-hours editor
   UI (fields exist, no editor yet — jsonb is written but only creatable via agents/SQL today).
7. **Adversarial pass + mobile check** — run the ui/mobile patrols on the workspace; the matrix
   table is a plain table, not `MatrxDataTable` (deliberate v1: 29 fixed config rows with inline
   controls) — revisit when the registry grows or needs sort/filter.

## Decisions reserved for Arman

- Naming: Location / Listing / Publisher (and whether `web.listing_publisher` should fold into
  `web.provider` — recommended NO: different role per db-rules §1a).
- GBP API access application (human-gated, ~7-14 days) — when to file it and under which GBP.
