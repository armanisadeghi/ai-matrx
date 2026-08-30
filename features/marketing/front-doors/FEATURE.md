# Marketing front doors

**Status:** live (shipped 2026-08-19)
**Routes:** `/marketing/outreach` · `/marketing/email` · `/marketing/monitoring`
**Code:** `features/marketing/front-doors/`

## Purpose

A **front door** is a Marketing pillar route whose capability already ships
somewhere else — in `/crm/*`, or inside a website's own workspace. Its entire
job is THE DOOR LAW: name what exists, count it, and open it.

It exists because of a specific, expensive failure: the whole outreach product
(campaigns, sequences, the unified inbox, the Chasebox, sending identities,
five prospecting methods, coverage monitoring, AI-visibility panels, outcome
attribution) shipped and was **live-proven**, while the three Marketing pillar
routes that promise it still rendered `MarketingComingSoon`. A user exploring
Marketing was told outreach did not exist while it was running.

## The one rule

**A front door never re-renders the workspace it opens.** `docs/handoffs/outreach-system.md`
§7 names "a separate outreach console" as a trap — outreach belongs beside the
records. The same reasoning covers monitoring (coverage / link changes / AI
visibility / reputation all belong to a site) and email (the mailbox, the
templates and the sequences each already have an owner surface).

If a front door starts growing tables, filters, or writes, it has become the
second console and must be cut back to doors.

## The parts

| File | Role |
|---|---|
| `MarketingDoorBoard.tsx` | The only visual primitive: `MarketingDoorCard` (a door, optionally with a live count), `MarketingDoorBoard` (a titled grid), `MarketingFrontDoorPage` (the page frame, matching the `/marketing` hub geometry), `MarketingFrontDoorPromise` (an unbuilt remainder, copy read from the coming-soon registry) |
| `FrontDoorSiteSelect.tsx` | Site scoping via `?site=`, same contract as `/marketing/capabilities`. `useFrontDoorSite()` falls back to the first site rather than forcing a choice; with no sites at all the control becomes an "Add your first website" door |
| `OutreachFrontDoor.tsx` | Campaign / queue / mailbox counts + the five Chasebox queues + recent confirmed wins |
| `MonitoringFrontDoor.tsx` | The four site-scoped monitoring views |
| `EmailFrontDoor.tsx` | Lane B email (mailbox, templates, sequences) + per-org template libraries |
| `BrandScopedOutreach.tsx` / `BrandScopedEmail.tsx` / `BrandScopedMonitoring.tsx` | The client-workspace mounts: bind the canonical door to `useMarketingBrand()` and pass the brand down. The pages under `/marketing/[brandId]/**` mount THESE, never the bare door |

## Invariants

- **A count is a door.** Every number rendered here reaches the records behind
  it. `count: null` means loading; `undefined` means this door has no count;
  `0` is a real, honest answer and renders as `0`.
- **Scope honesty.** The outreach counts use `makeScope("mine")` because that is
  the scope the Chasebox itself opens on. A front door that counted a wider
  scope than the destination would lie by arithmetic.
- 🚨 **Scope honesty part two: the brand is the tenant, and what cannot be
  scoped says so.** A front door mounted inside `/marketing/<brand>/**` scopes
  everything the data model lets it scope — websites carry `brand_id`, so the
  site picker and every site-scoped door see only that client's sites
  (`useFrontDoorSite(brandId)`); sending identities carry an org, so the
  mailbox count takes the brand's `organizationId`. Everything else on these
  pages (outreach campaigns, Chasebox queues, the reply inbox, earned-placement
  wins, message templates, the per-org template libraries) has NO brand link in
  the data model. Those doors are **kept and labelled** — inside a brand each
  one names its real reach ("across your clients", "in <client>'s
  organization"). Never fake a filter we cannot apply, and never delete a
  working door to make the page look tidy: a door removed is a dead end, a door
  mislabelled is a lie.
- **aidream is optional to the page, not to the count.** The mailbox count is
  the one non-Supabase read. A failure drops the *number*, never the door.
- **Unbuilt remainders stay registered.** `/marketing/email` prints
  `marketing.email.opt-in-campaigns` (Lane A) and `/marketing/monitoring` prints
  `marketing.monitoring.alerts` (review monitoring + alerting). Both are
  registry rows, listed in `marketing-nav.test.ts`'s `NON_ROUTE_PROMISES`
  because they live inside a live page rather than at a reserved URL. **Never
  delete the Lane A promise** — it is committed vision, deliberately sequenced
  after Lane B (`outreach-system.md` §5.1).
- **Guests never see this.** `app/(core)/marketing/layout.tsx` serves
  `MarketingLanding` to anonymous visitors on every `/marketing/*` URL, so these
  components only ever render for a signed-in user.

## Inventory (what was searched, found, and reused)

Searched: `features/crm/**` services, `features/marketing/data/**`,
`features/marketing/lib/routes.ts`, `site-subviews.ts`, `lib/list-scope`,
`lib/coming-soon`, `components/official`, `MarketingHub`.
Reused unchanged: `fetchOutreachLists`, `fetchChaseboxCounts`,
`CHASEBOX_QUEUE_META`, `listSendingIdentities`, `useCrmContext`,
`useSiteOptions`, `marketingRoutes.site`, `outcomeVerdict`, `makeScope`,
`getComingSoon`, `MarketingUi`'s `QueryError` / `InlineQueryError` /
`formatCompactDate` / `LoadingSurface`.
Newly built: the door primitive above, and ONE new read —
`listRecentWins` in `features/crm/outcomes/service.ts`, because every existing
outcome read is single-campaign and this page asks "did outreach work lately"
across all of them.

## Change log

- **2026-08-19** — Created. The three Marketing pillar placeholders became real
  front doors; `marketing.outreach` deleted from the coming-soon registry
  (fulfilled), `marketing.email` and `marketing.monitoring` replaced by the
  narrower promises that are genuinely still open.
- **2026-08-30** — Brand-scoped for the agency model. `BrandScopedOutreach`
  added and mounted at `/marketing/[brandId]/pr/outreach` (it was still picking
  the first website on the PLATFORM, so one client's page sent the operator
  prospecting on another client's site); `OutreachFrontDoor` gained optional
  `brandId` / `brandName` / `organizationId` / `basePath`, and its mailbox count
  now takes the org the way `EmailFrontDoor` already did, so the two doors can
  never disagree. `EmailFrontDoor` gained `brandName` and now names this
  client's own template library first. Everything with no brand link stayed and
  gained an honest scope label — see the scope-honesty invariant above. All
  props default to the org-wide behaviour, so the flat legacy doors are
  unchanged.
