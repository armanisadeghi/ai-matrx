# Site Intake Wizard — the first-run GSC interview

**Status:** Live (2026-08-08). **Route:** `/marketing/brands/[brandId]/sites/[siteId]/intake` ("Intake" tab in the site layout nav). **Server:** `aidream/services/seo/site_intake.py` (`POST /seo/sites/{site_id}/intake/run` + `/intake/apply`). **Design of record:** aidream `docs/handoffs/content-ir-agent-slots.md` item 7 + `common-docs/systems/agent-slots/FEATURE.md`.

The platform vision in miniature: the SEO expert's doctrine lives in the
intake agent (`seo.site_intake` agent slot, content-ir kinds
`gsc_site_intake_bundle` → `gsc_site_intake_proposal`, both dual-gated); the
AI reads four trajectory periods of the site's real GSC history; the human
answers ONLY what data cannot answer. Every confirmed ruling persists as
durable business truth — never chat-only.

## Parts

| Part | Path |
|---|---|
| Wizard | `SiteIntakeWizard.tsx` (steps: Connect → Import → Interview → Apply → Done) |
| Compute calls + stream shapes | `intake-service.ts` (`runSiteIntake` / `applySiteIntake` / stage labels) |
| Route page | `app/(core)/marketing/brands/[brandId]/sites/[siteId]/intake/page.tsx` |
| Nav entry | `MarketingSiteLayoutClient.tsx` ("Intake", Compass icon) |
| Dashboard entry | `SearchConsoleWorkspace.tsx` empty state — "Start intake interview" |
| On-bind auto-import | `SiteIntegrationsWorkspace.tsx` `kickGscFirstImport` |

## Invariants

- **UX doctrine (Arman, 2026-08-08):** no page title/intro prose (the tab
  says Intake — data starts at the top); the analysis AUTO-STARTS on load;
  every bundle slice streams onto the screen the moment the server has it
  (`seo.intake_bundle_period` events → `PeriodPreviewCard`); exactly ONE
  activity indicator exists at any time (the status-line spinner); the page
  owns its scroll (`h-full overflow-y-auto` — the site layout is
  overflow-hidden and pages that skip this cannot scroll at all).
- **The interview run is a DURABLE command** (`seo.collection_run`,
  provider `aidream`, operation `sites.intake_interview`, target = site id).
  A non-forced start (including the auto-start) replays the NEWEST
  completed analysis instantly, whatever identity ran it (zero paid calls);
  `force_refresh` ("Re-run analysis") mints a fresh run. A dropped stream
  loses nothing — reloading the page shows the finished result.
- **One write path per truth.** Keyword rulings → `seo.gsc_set_keyword_class`
  (the SAME RPC the classification-review UI calls; stamps
  `site_keyword_value.traffic_class` + `notes`, the resolver's top-precedence
  verbatim rung). Topic valuations → the Site Strategy Interviewer
  (`seo.site_topic_value`, P8 inheritance). Brand aliases →
  `web.brand.profile.brand_aliases` (the deterministic brand rung's source).
  The wizard NEVER writes valuation columns client-side.
- **On-bind auto-import:** the moment a GSC binding is first configured
  (either the auto-match connect flow or the manual form save) and
  `site.gsc_synced_at` is null, the FULL ~16-month backfill plus a forward
  sync fire server-side (detached — leaving the page never stops them).
  Google deletes history past ~16 months; every unfetched day is eventually
  lost. Progress narrates from server state (`useGscBackfillStatus` /
  `useGscFreshness`), never client memory.
- **Cost is surfaced, never hidden**: the run result carries the agent call's
  billed `cost_usd` (shown next to the Re-run button) and a priced estimate
  for the bulk classifier sweep (`classify_estimate`, tokens priced from the
  live catalog — `est_cost_usd` is null rather than fabricated when pricing
  cannot resolve).
- The proposal mirrors the `gsc_site_intake_proposal` content-ir kind; the
  agent may only cite sample terms that exist in the bundle, and the wizard
  turns each ACCEPTED group into per-term rulings carrying the group's worded
  reasoning.

## Change log

- 2026-08-08 — Created: wizard + service + nav + on-bind auto-import,
  verified end-to-end against datadestruction.com (16 rulings, 6 valuations,
  2 aliases through the live product flow).
