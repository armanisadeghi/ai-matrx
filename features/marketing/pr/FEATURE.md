# Press Room

**Status:** shipped · **Tier:** 2 · **Route:** `/marketing/pr` (`marketingRoutes.press()`)

The Press & PR workspace: what is newsworthy about a business, the proof each
story still needs, the journalists asking for it right now, and the coverage it
produced.

This is the ONE canonical implementation. It came out of a four-posture bake-off
(`ui-refine`, `ui-sharp`, `ui-dense`, `ui-reimagine`); `ui-refine` won on its
real Supabase read path, its brand/site scoping and its depth of reuse, and the
best ideas from the other three were grafted in during consolidation. What was
grafted, and from where, is listed at the bottom.

## Two backend facts the UI is honest about

These are live and final. They shape the default view, the ranking, the empty
states and the fixture distribution — not just a tooltip.

1. **`recommended_action` is gated.** An angle is only ever `pitch_now` when it
   has NO `missing_evidence`, NO `proof_required`, NO `contradictions`, AND
   `evidence_quality >= 50`. Everything else arrives as `develop_evidence` with
   `requires_human_review = true`. **So work-to-do is the COMMON case, not the
   exception.** The default view is live work, the "Building proof" view is the
   biggest bucket, the evidence ladder counts UP ("3 of 4 in hand", "One thing
   away from pitchable"), nothing about a gap is painted destructive-red, and
   the "Ready to pitch" empty state explains that emptiness there is normal
   rather than treating it as a failure. The fixture dataset mirrors the real
   distribution: mostly `develop_evidence`, two genuinely pitchable angles, and
   two human-ruled states (`hold_for_timing`, `needs_expert_input`) that carry a
   `human_ruling` because only a person can set them.
2. **`seo.source_request.status` reaches `expired` and `passed`,** not just
   `new` / `matched` / `drafted` / `submitted` / `won`. An `expired` or `passed`
   request has `draft_response = null` and no subject line — it cannot be
   answered. So **no send or submit affordance is rendered for those** (nor for
   `submitted` / `won`, which are also done: see `isAnswerable` in `types.ts`).
   What is rendered instead is WHAT HAPPENED (`CLOSED_REQUEST_STORY`), and the
   original query door (`external_url`) stays open, because on a closed request
   that link is the only thing left worth opening. Closed rows are also excluded
   from the six-hour escalation bar and the "closing in 24h" KPI.

## Why it looks the way it does

Benchmarked against **Linear's issue list** (ranked queue, dense row, in-place
expansion), **Muck Rack / Prowly** (journalist-request inbox, pitch board) and
**Prezly** (coverage log).

It reuses the Marketing house system rather than inventing a parallel one —
`PageHeader` chrome, `bg-textured` body, `MetricCell` KPIs, `MarketingUi`
loading/error states (`LoadingSurface`, `QueryError`, `InlineQueryError`),
`EntityRef` doors, `CopyButtons` payloads, `SearchInput`, and
`useBrandSites` / `useVisibleBrandOptions` for scope.

## The four problems it solves explicitly

1. **Five 0–100 scores per row is noise.** One "Pitch readiness" number with a
   declared, un-configurable weighting (`scoring.ts` → `SCORE_MODEL`), beside a
   five-bar **comb** — a shape the eye compares across twenty rows without
   reading a digit. All five stored scores are on the comb, `evidence_quality`
   included; `priority` is on it too but carries weight ZERO and says so,
   because priority is the ORDER of the queue, not a readiness signal. The comb
   has a fixed footprint in both dimensions, and the same five appear labelled,
   weighted and in the open inside the expanded row — a hover is not a door on
   a touch screen.
2. **`proof_required` / `missing_evidence` must read as momentum.** The
   **evidence ladder** (`ladder.ts` + `components/EvidenceLadder.tsx`) joins
   `proof_required` × `missing_evidence` × `evidence_refs` by key into rungs
   that count up. Every gap ships with its fix: the concrete `how_to_get`, the
   owner, the effort, a one-click "I have this" that moves the item into
   `evidence_refs` and recomputes readiness across the page, and a copy pair
   that writes the exact request to send to whoever owns the gap. Nothing here
   is destructive-red except `contradictions`, the only field that means
   something is actually wrong.
3. **Honesty about what we can and cannot read.** A proof marked satisfied with
   no artefact linked says so instead of rendering a tick it did not earn.
   `jsonb` entries the readers cannot parse are COUNTED and surfaced rather than
   silently dropped. A journalist name with no `party_id` renders as an
   unresolved reference carrying a one-click "not in CRM — add", never a bare
   `<span>` (`components/JournalistRef.tsx`).
4. **Deadlines are the one time-critical thing.** One page clock
   (`useMinuteClock`, an external store so SSR and hydration agree), fixed-width
   countdown chips so a ticking row never reflows, a panel-level escalation bar
   for anything inside six hours, and a red KPI door beside it.

## Data

Real reads on the canonical client path (browser → Supabase direct,
`.schema("seo")`, RLS-filtered — never through Python, never through a Next
route) against `story_angle`, `source_request` and `coverage_mention`. Those
first two tables have no seeded rows yet, so when the reads settle empty the
workspace renders `fixtures.ts` and says so in an unmissable banner. Fixture
rows are typed as the GENERATED DB row types, so deleting that one file is the
only change needed to go live, and a schema change breaks the build rather than
the page.

**Coverage → angle:** `seo.coverage_mention` has NO foreign key to
`seo.story_angle`. The tie lives in `metadata.story_angle_id`, and
`angleIdFromMention` in `data.ts` is its only reader. When it is absent the row
says the link is not recorded rather than quietly rendering nothing.

## State, and where it lives

`routes.ts` is the ONE URL-state module. Brand, site, queue view, the open
record and the forced load state all live in the query string, so every screen
here is shareable, bookmarkable and reload-safe:

```
/marketing/pr?brand=<id>&site=<id>&view=proof&focus=angle:<id>&data=empty
```

`?data=ready|empty|error|stalled` forces a load state so the unglamorous ones
are reachable and reviewable on the real route; a strip says the state is forced
and links back to live data. The switch only FORCES the state — on the live path
the stall copy still comes from React Query's real `isPaused` / `failureCount`
signals rather than a wall-clock guess, so what a reviewer reads is what a user
would read.

**Rulings.** Accept / Mark pitched / Dismiss / Mark submitted / Pass on it /
"I have this" all WORK: the ruling is applied over the loaded rows and the
queue, the funnel, the KPI strip and the readiness numbers move together. What
they cannot yet do is persist — there is no write path to `seo.story_angle` or
`seo.source_request` from this surface. ONE honest treatment, applied
everywhere: a status bar at the top of the page says how many rulings are held
in this session and offers to discard them. (The alternative — a disabled button
that explains itself — was rejected: it teaches the user the product cannot do
the thing at all, when the surface can already compute the whole consequence.)

**Keyboard.** ↑ / ↓ walk the angle queue, Escape closes the open row. Suppressed
while the user is typing, so the search field keeps its own arrow keys.

## Doors (THE DOOR LAW)

| Thing named | Door |
|---|---|
| Journalist / coverage author | `EntityRef token="party"` → `/crm/{partyId}`, new tab |
| Journalist with no `party_id` | unresolved reference + "not in CRM — add" → `/crm` |
| Media lists | `/crm/outreach-lists` |
| The site | `EntityRef token="web_site"` |
| A story angle | `EntityRef` with an EXPLICIT `href` onto this page, focused on the row |
| A journalist request / coverage item | `?focus=request:<id>` / `?focus=coverage:<id>` |
| The original query | `external_url`, open on every status including closed ones |

`seo.story_angle` and `seo.source_request` have no entry in
`features/scopes/registry/entityRegistry.ts`, and that shared registry is not
this feature's to edit — hence the explicit `href` above. When those tables get
registry tokens, `routes.ts` is the only file that changes.

## Files

```
features/marketing/pr/
  FEATURE.md                       this file
  types.ts                         generated row types, human vocabulary, tolerant jsonb readers
  ladder.ts                        the evidence-ladder join (proof × missing × refs)
  scoring.ts                       SCORE_MODEL, pitch readiness, deadlines, queue ranking
  routes.ts                        the ONE URL-state module (+ the ?data scenario switch)
  data.ts                          Supabase reads, the scenario switch, session rulings, the page clock
  fixtures.ts                      the ONE sample dataset
  PressRoomWorkspace.tsx           the surface
  components/
    ScoreComb.tsx                  the comb + the opened-out breakdown
    EvidenceLadder.tsx             the ONE proof component (pill + ladder + contradictions)
    StoryAngleQueue.tsx            the hero queue
    SourceRequestRail.tsx          the deadline inbox
    PitchPipeline.tsx              the five-stage board
    CoverageWon.tsx                the coverage log
    JournalistRef.tsx              resolved party, or unresolved reference + its fix
app/(core)/marketing/pr/page.tsx   route chrome only
```

## What was grafted in during consolidation

From **`ui-sharp`**: the evidence ladder and its typed readers (now `ladder.ts` +
the readers in `types.ts`), which REPLACED refine's `ProofChecklist` — there is
exactly one proof component; the five-bar score comb shape and its
weakest-axis sentence, merged into refine's fixed-footprint meter and declared
weighting; honest green and the malformed-entry count; the unresolved-reference
treatment with its one-click fix; and the `?data=` scenario switch.

From **`ui-dense`**: deep-link focus routing (folded into refine's brand/site URL
sync so there is ONE URL module); keyboard navigation; and the status-bar
treatment for unpersisted rulings, with its discard control.

From **`ui-reimagine`**: the tolerance of its `lib/proof.ts` readers — bare
strings and several key spellings (`label` / `claim` / `requirement` / `title` /
`name` / `text`, `detail` / `note` / `why` / `reason`, …) all parse, because the
analyzer and hand-entered rows do not agree on one shape. Its `ProofLedger` and
`ReadinessMeter` were otherwise superseded by the two components above.

Dropped: sharp's separate `press-model.ts` vocabulary (duplicated `types.ts`),
dense's four-tab shell (the consolidated surface shows all four things at once),
and both losers' fixture files.
