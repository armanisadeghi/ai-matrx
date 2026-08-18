# Press Room (`ui-refine` bake-off entry)

**Status:** bake-off entry · **Tier:** 2 · **Route:** `/marketing/pr/refine`

The Press & PR workspace: what is newsworthy about a business, the proof each
story still needs, the journalists asking for it right now, and the coverage it
produced.

## Why it looks the way it does

Modelled on **Linear's issue list** (ranked queue, dense row, in-place
expansion), **Muck Rack / Prowly** (journalist-request inbox, pitch board) and
**Prezly** (coverage log). The posture is `ui-refine`: it reuses the Marketing
house patterns rather than inventing a parallel one — `PageHeader` chrome,
`bg-textured` body, `MetricCell` KPIs, `MarketingUi` loading/error states,
`EntityRef` doors, `CopyButtons` payloads.

## The three problems it solves explicitly

1. **Five 0–100 scores per row is noise.** `priority` becomes the ORDER of the
   queue; the other four collapse into one "Pitch readiness" number with a
   declared, un-configurable weighting (`scoring.ts`), kept visible as a
   fixed-footprint four-bar meter and opened out in full inside the row.
2. **`proof_required` / `missing_evidence` must read as momentum.** The proof
   panel is a progress bar and a to-do list, never red. Red is reserved for
   `contradictions`, the only field that means something is actually wrong.
   Every outstanding item ships with a copy pair that writes the exact request
   to send to whoever owns the gap.
3. **Deadlines are the one time-critical thing.** One page clock
   (`useMinuteClock`, an external store so SSR and hydration agree), fixed-width
   countdown chips so a ticking row never reflows, and a panel-level escalation
   bar plus a red KPI door for anything inside six hours.

## Data

Real reads on the canonical client path (browser → Supabase direct,
`.schema("seo")`) against `story_angle`, `source_request` and `coverage_mention`.
Those first two tables have no seeded rows, so when the reads settle empty the
workspace renders `fixtures.ts` and says so in an unmissable banner. Fixture
rows are typed as the GENERATED DB row types, so deleting that one file is the
only change needed to go live.

`coverage_mention` has **no** FK to `story_angle`. The tie is read from
`metadata.story_angle_id` in exactly one place — `angleIdFromMention` in
`data.ts`. A mention without one says so rather than rendering nothing.

## Doors (THE DOOR LAW)

- Journalist on a source request → `EntityRef token="party"` (`crm.party` →
  `/crm/[partyId]`), new tab. No `party_id` → says the contact is not in the CRM.
- Coverage author → `EntityRef token="party"` via `author_party_id`.
- Media lists → `/crm/outreach-lists` (a static route, passed as an explicit
  `href` on a Button — the registry has no token for the list index).
- Site → `EntityRef token="web_site"`.
- Original query → `external_url`; the published piece → `url`.
- Every count in the KPI strip filters or scrolls to the rows it counts; every
  pipeline card and coverage row opens its angle, and the queue guarantees the
  opened angle survives the active filter.

## Known gaps

- Status writes (`Pitch this`, `Accept`, `Dismiss`) are not wired. The button is
  **disabled with an explanation** rather than faked; the copy pair is the real
  action available today.
- No nav entry: `features/marketing/lib/marketing-nav.ts` is out of scope for
  this entry, so the route is reachable only by URL.
- Site-scoped variants (`/marketing/brands/[brandId]/sites/[siteId]/pr`) are not
  built; the hub carries a URL-synced brand + site picker instead.

## Change log

- 2026-08-18 — Initial build (`ui-refine` bake-off entry).
