# features/marketing/tracking — Tag Manager tracking on the site record

**Tier 2, inside `features/marketing`.** Product truth for the campaign lives at
`../../../../common-docs/projects/google-native/PLAN.md` §4.10 and the U-M2 scope census
(`SCOPE-U-M2.md`). This file is the local mechanics.

## Purpose

Answer, on the site record, the question a Tracking Auditor answers on its own screen — *is this
site's tracking actually set up?* — and answer it honestly. Our edge over that champion is
placement: the verdict sits beside everything else about the site, for the owner, not in a
separate audit tool nobody opens.

## 🚨 The one law this feature exists for

**A Tag Manager container is a CLAIM until we look at the live page.** Everything the Tag Manager
read API exposes is the container's current **workspace draft**. A grade built from that alone
reads as "this site is tracked" when the container may not be on the site at all.

So the server takes a snapshot in two halves (`aidream/services/google_sync/`):

1. `snapshot_tag_manager` grades the container's live (non-paused) tags — GA4 installed, GA4 not
   double-counted, conversion tracked, consent configured.
2. `page_reconciliation.py` fetches the site's root URL as **raw HTML, live, in this process** and
   looks for this container's own id, a different container's loader, and a bare `gtag(`.
   **There is no Markdown door**: our stored page text is the crawler's extracted Markdown, which
   by construction carries no `<script>`, so a Markdown-sourced reconciliation would mark every
   correctly instrumented site in the portfolio as uninstrumented.
   **When no live fetch is possible the verdict is `not_checked` with the reason** — never a
   `pass` (which would claim we looked) and never a `fail` (which would accuse a site that was
   merely down).

   🚨 **And that fetch runs no JavaScript** (a plain HTTP GET). A snippet injected at runtime by
   a bundle, a consent wrapper or a tag-management layer is not in those bytes, so the read can
   prove PRESENCE but never ABSENCE: a container it does not find is `not_checked` carrying
   *"we read the page WITHOUT RUNNING ITS SCRIPTS"*, never `fail` (V-27 NEW-4). The finding
   carries `javascript_executed`, and the `fail` branches return the day a browser-backed fetch
   mints the page.

`not_checked` is a first-class verdict all the way to the screen. `parseTrackingFindings` reads an
**unrecognised** verdict word as `not_checked` too, so a server that grows a fourth word can never
be read here as "everything is fine".

## 🚨 The caveats are DATA, and every one of them is printed

The server declares what its read cannot see — three sentences, named ONCE at
`aidream/services/google_sync/kinds.py::TAG_MANAGER_READ_CAVEATS`, carried on the snapshot payload
as `caveats` and on the `tracking_health` tool answer as the same list. **The panel prints all of
them, verbatim, and selects among them never.** The second one is the one that matters most:
without it the headline *"GA4 not installed · conversion not tracked"* reads as a verdict on the
whole site rather than on one container, which is the exact misread this feature exists to
prevent (V-27 NEW-3).

**This repo authors no caveat sentence, not even a paraphrase and not even in a comment**
(V-28 NEW-3). The freshness line's provider-lag slot used to hold a frontend-written summary of
caveat #1 for `tag_manager`, printed directly above the server's own list — a fourth copy that
drifts the moment the server edits its words. `PROVIDER_LAG_SENTENCE` now has no `tag_manager`
entry at all; the panel hands `DataFreshnessLine` the finding's own `caveats`, and its first
sentence takes that slot verbatim. `trackingSurfaces.test.ts` greps every non-test source file
under `features/marketing` for the caveats' words and fails on any copy.

**A payload whose caveats were never declared says so** (V-28 NEW-2). A pre-2026-09-20 row
carries a singular `caveat` string, or none at all; reading either as `[]` renders no caveat
block and hands the reader a confident grade with its limits silently removed. `parseCaveats`
keeps whatever words the payload has and appends `CAVEATS_NOT_DECLARED` — *"The server did not
declare its caveats for this snapshot … re-check to refresh it."* — so the list is never empty
and absence is never silence. That stand-in is not a caveat: it says nothing about what the read
can see.

## Files

| File | What it owns |
|---|---|
| `types.ts` | The `tag_manager_findings` payload parser. `__kind` is kept, never stripped; a payload that does not declare it returns `null` and the panel says it cannot read that snapshot. |
| `health.ts` | **THE ONE tracking verdict.** Pure, no clock of its own. The chip, the status board and the panel all read it, so they cannot disagree. It also carries `thresholdUnavailable` — the knob reader's own sentence when the staleness threshold could not be read — so every surface prints the same stand-in through ONE channel. |
| `service.ts` | The two doors: the direct Supabase read of the newest `web.tag_manager_snapshot`, and `POST /google-sync/tag-manager/snapshot` through `postGoogleBackend`. |
| `hooks.ts` | ONE query key, so the chip on a row and the panel in a window make the same read — and **`useSiteConnectionStatuses`, the ONE way any surface gets the six connection statuses**. The snapshot read is gated on the container binding, so a portfolio of unbound sites costs no queries. |
| `knobs.ts` | `google.tracking.snapshot_max_age_hours` (168). A missing row raises by design; this turns the raise into a printed stand-in. The reason travels with the value — `useSiteTrackingStatus` passes both into the verdict, so the chip can never read as a silent "never stale". |
| `components/SiteTrackingPanel.tsx` | **THE canonical panel.** Every surface renders this — the settings card and the window body both wrap it. |
| `__tests__/` | 41 tests over the derivation, the panel in each graded state, and the three shared primitives U-M2 extended. |

## Where it surfaces

- **The sixth connection chip, on five surfaces.** `lib/site-status.ts` gained the key
  `tracking`, derived through `trackingHealth`. 🚨 **The tracking input is REQUIRED and is read
  where the statuses are derived** — `useSiteConnectionStatuses` — so the site record's
  Connections board, the brand's site table and cards, the brand workspace's site list, the site
  peek and the site surface's agent context all carry the same verdict and the same reason when
  the staleness knob cannot be read. It was an optional second argument until 2026-09-20 and four
  of those five never passed it, so `thresholdUnavailable` was `null` by construction and an
  unreadable knob announced itself on the panel alone (V-28 NEW-1). A surface that renders no
  tracking verdict at all (the Search Console checklist, the intake wizard) calls
  `siteProviderStatuses`, which returns the five and cannot silently omit the sixth.
- **The settings card.** `components/settings/SiteTrackingCard.tsx` — a pure
  `<SiteTrackingPanel />`, mounted in `SiteIntegrationsWorkspace`.
- **The window.** `features/window-panels/windows/marketing/SiteTrackingWindow.tsx`, overlay
  `siteTrackingWindow`, address `?panels=site_tracking:<siteId>`. The frame only: it wraps the
  canonical panel `variant="bare"`, proven by
  `features/window-panels/__tests__/siteTrackingWindowWrapsThePanel.test.tsx`.
- **The binding.** `data/integrations-schema.ts` gained `googleTagManager`. `resourceRef` is the
  **PUBLIC** container id (`GTM-ABC1234`) and the schema refuses anything else, because the
  numeric internal id never appears in the site's own snippet and so could never be reconciled.
- **The connector health row.** `features/connectors` already carried the `tag_manager` product;
  U-M2 only gave its `firstAction` a real destination, since a surface now exists.

## Invariants & gotchas

- **One panel, one verdict.** A second renderer of a tracking grade would drop the reconciliation
  — that is the part a copy always drops — and print a confident grade of a container the page
  does not use. `SiteTrackingCard` and `SiteTrackingWindow` are doors, never bodies.
- **The freshness line's third provider is a POINT IN TIME.** A snapshot has no "data through"
  day, so `describeFreshness` contributes no range clause for `tag_manager`; printing "no data
  stored yet" beside a snapshot we are holding would be a lie about a record in hand. Its lag
  slot holds the SERVER's first caveat when one is declared and **nothing at all** when none is —
  never a frontend guess at what the read does not cover.
- **The chips need a React Query client.** They read the snapshot and the knob themselves, so a
  host that renders them outside `QueryClientProvider` throws rather than quietly showing a chip
  derived from nothing. Every route has one; a test that renders a list presentation must supply
  one (`site-list-presentation.test.tsx` does).
- **Re-check is expensive and says so.** It spends a Tag Manager API request AND fetches the
  customer's own homepage. The confirm names both before it runs.
- **The rollout sentence is only said when the rollout is what is blocking.** A product can be
  generally available and still not connected on this account; printing "generally available"
  beside "not switched on" is two sentences that contradict each other. The row's own `reason` and
  `remedy` are the honest words otherwise.
- **No agent runs behind any control on this surface**, so it declares no `agentRole` (and would
  never show a visible agent chip if it did).

## Owed

- **The knob row is not applied.** `migrations/google_tracking_knobs.sql` is written; this
  container holds no `SUPABASE_MATRIX_*` credentials, so the chair applies it. Until then the
  panel states when the snapshot was taken and prints the named stand-in instead of a staleness
  verdict — it never invents 168 and calls it the organization's setting.
- **No screen was walked.** This container cannot reach the app host, so every claim here rests on
  jest over fixtures and on reading the live table's generated types.

## Change log

- **2026-09-20** — **V-28 NEW-1, NEW-2 and NEW-3 closed, at the class.**
  (1) **NEW-1, shipped:** `siteConnectionStatuses(site, tracking?)` took the tracking input as an
  OPTIONAL second argument and four of the five chip surfaces never passed it, so the knob's
  failure reason reached the panel and nothing else — on the site record's Connections board, the
  brand's site table and cards and the brand workspace list, `thresholdUnavailable` was `null` by
  construction. The argument is required now; `siteProviderStatuses` serves the two surfaces that
  render no tracking verdict; and every UI caller goes through the new
  `useSiteConnectionStatuses`, which does the snapshot and knob reads where the statuses are
  derived. Caller census (before → after): `SiteConnectionChips` (was the only one passing it,
  now reads it itself so no host can forget), `SiteOverview` ×2 (board + agent scope, both on the
  hook), `site-surface-base` (hook), `siteSetupChecklist` + `SiteIntakeWizard`
  (`siteProviderStatuses`), `SitePeekBody` (the prop is gone). (2) **NEW-2:** a payload with no
  `caveats` key — including a pre-`dba5c976` row's singular `caveat` — parsed to `[]` and printed
  no caveat block at all; it now keeps what words it has and appends `CAVEATS_NOT_DECLARED`.
  (3) **NEW-3:** the fourth frontend copy of caveat #1
  (`google/freshness.ts::PROVIDER_LAG_SENTENCE.tag_manager`) is deleted; the lag slot reads the
  server's own caveats off the same finding, and a grep guard in `trackingSurfaces.test.ts` fails
  on any caveat wording authored under `features/marketing`.
  Red first: **12 tests failed** on the pre-change source (the chip surfaces with an unreadable
  knob; the absent and singular caveat cases; the deleted lag sentence; both grep guards), all
  green after.

- **2026-09-20** — **V-27 NEW-3 and NEW-5 closed.** (1) The panel printed ONE of the server's
  three caveats because the payload hardcoded one sentence. `caveat: string | null` is now
  `caveats: string[]`, the server declares the whole list, and the panel and the Copy-for-AI
  payload print every one verbatim — including the "tracking outside Tag Manager is invisible
  here" sentence, which had never reached a screen. (2) `TrackingHealth.thresholdUnavailable` was
  documented as printed-never-hidden and hardcoded `null` at all three exits, while
  `useSiteTrackingStatus` dropped `knob.unavailableReason` on the floor — so an unreadable knob
  silently stopped calling anything stale and the chip announced nothing (Law 4). The reason now
  goes IN through `TrackingHealthInput` and comes OUT on the verdict; the panel reads it there
  (not off the hook), and the chip's tooltip appends it after the verdict it already carried.
  Red first: 6 tests failed on the pre-change source (the two missing caveats absent from the
  rendered panel; `thresholdUnavailable` `null`; the chip's detail with no mention of the knob;
  `caveats` `undefined`), all 41 green after. `npx jest features/marketing/tracking
  features/marketing/components` → 181 passed; `pnpm check:parse` OK over 17,144 files.

- **2026-09-19** — Created (U-M2). The panel, the card, the window, the chip, the binding, the
  knob reader and 35 tests. Red-then-green: three planted defects (the reconciliation stops gating
  the verdict; an unknown verdict word reads as a pass; the server's caveat is dropped from the
  panel) turned 6 tests red, green after.
