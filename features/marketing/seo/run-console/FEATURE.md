# FEATURE.md — `marketing/seo/run-console`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-24`

---

## Purpose

ONE console for driving the keyword-coverage engines by hand, at three
permission tiers, and for authoring the schedule those engines will eventually
run on. Topic placement is the first engine wired in; the shape accepts the
others (facet backfill, gazetteer detection, situational refresh) without a
second console.

Register item: **KI-049** in
`common-docs/systems/marketing/seo/seo-keywords/REGISTER.md`. The engine itself
is **KI-014**.

---

## Arman's ruling (2026-08-25) — this feature IS the record of it

> *"Instead of running it nightly, you create an admin dashboard for me where I
> can go, and I can trigger it manually and indicate how many keywords per brand
> I want max and put in my requirements, but then I want the UI to give me the
> results. So I can look at those results, start poking holes… by building me
> that UI, you have now essentially built a template that every organization can
> have… they're going to see only the brands they control… the same UI that
> every brand has with the difference that it only controls their brand. And in
> all three of those UIs, which really should just be one UI, with slightly
> different permissions… is where the schedule is set. … what I put applies only
> to companies that don't have their own schedule in. Organizations that have
> their own schedule, all of their brands will abide by their schedule, not mine.
> The same goes for an individual brand. If a brand has a schedule, the brand
> schedule overrides the organization, which overrides the system."*

Two laws fall straight out of it:

1. **The tier is a prop, never a route fork.** `RunConsole` takes
   `scope: {tier:'system'} | {tier:'organization',organizationId} | {tier:'site',siteId}`.
   A second component for "the org version" would be the defect.
2. **Nearest wins: site > organization > system.** The system row applies only
   where nothing closer exists.

---

## Entry points

**Routes** — all three tiers ship.
- `app/(admin)/administration/marketing/run-console/page.tsx` — the SYSTEM tier
  mount (manage.aimatrx.com). Admin gating is the `(admin)` layout's job.
- `app/(core)/marketing/automations/page.tsx` — the ORGANIZATION tier mount.
  Server component (exports real `metadata`) that renders the client
  `OrganizationRunConsoleMount`, which reads the active org from
  `selectOrganizationId` (`appContextSlice`) and renders
  `<RunConsole scope={{tier:'organization', organizationId}} />`. No active
  org → `OrganizationRequiredNotice` (never a crash or an empty page — same
  door as `RecordUnavailableNotice`'s "Switch organization"). Fulfills the
  former `marketing.automations` Coming Soon promise (registry entry removed;
  `marketing-nav.ts` status dropped) — 2026-08-25.
- `app/(core)/marketing/brands/[brandId]/sites/[siteId]/automations/page.tsx`
  — the SITE tier mount. Renders `SiteRunConsoleMount`, which reads
  `siteId`/`site` from `MarketingSiteContext` (the site layout already
  access-gates and resolves it) and renders
  `<RunConsole scope={{tier:'site', siteId}} />`. Registered as a real site
  section (`automations`, group `Programs`) in `route-sections.ts` +
  `site-section-icons.ts` so it appears in the site's own nav — 2026-08-25.

**Components**
- `RunConsole.tsx` — the whole console: control bar, brand table, run log,
  results tabs.
- `OrganizationRunConsoleMount.tsx` / `SiteRunConsoleMount.tsx` — the
  client-side scope resolvers for the organization and site route mounts
  (split out because their `page.tsx` files are Server Components exporting
  real `metadata`, and a `"use client"` page cannot also export `metadata`).
- `ScheduleCascadePanel.tsx` — the tier's own schedule editor plus the
  "which schedule governs each brand" resolution table.

**Data**
- `data.ts` — `listConsoleSites`, `listEngineSchedules`,
  `resolveScheduleForSite` (THE CASCADE), `saveEngineSchedule`,
  `retireEngineSchedule`.
- `engines.ts` — the engine registry. Adding an engine is adding a row.
- `types.ts` — scope, tiers, `RunOutcome`.

**The run**
- `POST https://server.app.matrxserver.com/seo/keywords/topics/backfill` via
  `useSeoCommandRun` (`features/marketing/seo/durable-run/`). Direct to Python;
  no Next.js API route sits in between.

---

## What this feature deliberately does NOT own

| Concern | Who owns it | Why not here |
|---|---|---|
| The coverage number | `seo.topic_placement_status` via `getTopicPlacementStatus` (`../value-system/topics/data.ts`) | A console that computed its own coverage would be the second truth. The console and the topics screen share the same React Query key, so they are literally one cache entry. |
| Keyword lists | `ProposedQueue` / `UnplacedQueue` → `KeywordTable` | P26, ONE TABLE. Every keyword shown sorts, filters, and opens through the shared system. A hand-rolled row list here would break the law twice on one screen. |
| The stream | `useSeoCommandRun` → the floating live-run window | A spinner over a multi-minute paid pass is the banned pattern. |
| The ceilings | `platform.feature_knob` feature `seo.topic_placement` | Limits are knobs. The cap input is bounded by `batch_keywords`; the console **refuses to run** and says so when the knob row is missing, rather than inventing a default. |

---

## Data model

**`seo.engine_schedule`** — created by `platform.create_entity_table`
(`migrations/seo_engine_schedule_create.sql`), token `seo_engine_schedule`,
variant `entity`, versioned, soft-delete, `visibility='internal'`.
`iam.canonical_certify_ok('seo','engine_schedule','seo_engine_schedule')` = true.

| Column | Meaning |
|---|---|
| `engine_slug` | Which engine (`seo.topic_placement`). |
| `scope_tier` | `system` \| `organization` \| `site`. |
| `scope_organization_id` | The organization this row GOVERNS (organization tier). |
| `site_id` | The brand this row GOVERNS (site tier). |
| `cadence`, `run_at_utc`, `day_of_week` | When it would run. |
| `max_keywords_per_run`, `sites_per_run` | Caps, bounded by the knobs. |
| `enabled`, `notes` | Switch + the operator's own requirements, free text. |
| `organization_id` | THE ORG LAW — who OWNS the row. System tier = Matrx System (`39c38960-…`). Never NULL, never chosen by the database. |

Three partial unique indexes (one per tier) make "nearest wins" unambiguous:
two live rows for the same scope cannot exist.

---

## Key flows

**1 · Run now.** Tick brands → set the cap → press Run now. The console queues
the ids and drains them **one at a time** (a paid pass is not a fan-out): each
launch goes to the aidream command with `{site_id, refresh:true, limit:cap}`.
The result settles on the durable-run HANDLE, not on `launch()` — so a run that
finishes after a refresh still lands in the log. Each result appends a
`RunOutcome` row and invalidates `["seo","topics"]` + `["marketing","gsc"]`.

**2 · Poke holes.** Clicking a brand focuses it; the Proposals and Not-placed
tabs render the shared keyword table for that brand, with the assigner's
confidence column and one-click Confirm. Placed vs owed, proposals, and
quarantined counts are on every brand row.

**3 · Author a schedule.** The Schedule tab edits THIS tier's row only, and
shows the resolution table for every brand in scope so the operator can see
which tier is winning. **A saved, switched-on row RUNS** — see the dispatcher
below. The resolution table is read from `seo.engine_schedule_resolve`, the
same function the dispatcher obeys.

**4 · The dispatcher.** One approved scheduler task,
`seo_engine_schedule_dispatcher` (every 15 minutes; aidream
`services/seo/engine_schedule_dispatch.py`, task
`a7c1e2d3-0000-4e5f-9a00-000000000438`), calls
`seo.engine_schedules_claim(now())` and runs what comes back — in sequence, one
site at a time, each through the SAME `run_placement_command` /
`SeoCommandRun` path the Run now button uses, so an automatic run appears in
Run history with its AI calls exactly like a manual one. Everything that
decides WHO runs lives in the database
(`migrations/seo_engine_schedule_dispatcher.sql`): the cascade, the due test,
the greatest-need ordering (`seo.fn_topic_placement_sites_owing` — the read the
console and the engine already share), the `sites_per_run` cap, the in-flight
skip, and the `last_dispatched_at` claim under `FOR UPDATE SKIP LOCKED`.

---

## Invariants & gotchas

- 🚨 **A saved, enabled row SPENDS MONEY on its own cadence.** `DISPATCHER_NOTICE`
  in `ScheduleCascadePanel.tsx` says so on the panel and in the save toast; never
  soften it back toward "nothing runs". A row saved here IS the approval record
  for that engine on that brand (Arman, 2026-08-25) — that is the whole authority
  the dispatcher runs on.
- 🚨 **THE CASCADE HAS ONE IMPLEMENTATION, AND IT IS IN THE DATABASE.**
  `seo.engine_schedule_resolve` — read by `resolveSchedulesForSites` here and by
  `seo.engine_schedules_due` for the dispatcher. The old local `.find()` chain
  (`resolveScheduleForSite`) is DELETED. Never restore one: a console that
  disagrees with the dispatcher about who gets charged is the exact failure this
  feature exists to prevent.
- 🚨 **ONE dispatcher, one path.** Do not create a second scheduler task for an
  SEO engine — add the engine to `ENGINE_RUNNERS` in aidream's
  `engine_schedule_dispatch.py` plus its owed-work branch in
  `seo.engine_schedules_due`. `seo_topic_placement_backfill`
  (`…433`) drives the SAME engine; both being enabled means paying twice for the
  same corpus.
- 🚨 **`store=True` on the dispatcher's `system_app_context` IS the audit.**
  `system_app_context` defaults to `store=False`, and a non-storing context
  writes no `chat.request` row at all — the run would show 0 AI calls in Run
  history forever. Measured live 2026-08-25.
- A dispatch that is claimed and then FAILS does not retry until the next
  window. For unattended spend "misses one window" is the correct failure
  direction; "runs twice" is not.
- The console authors only its OWN tier. Seeing every tier is deliberate;
  writing another one is not what the permission difference means.
- Each brand row issues its own `topic_placement_status` RPC. That is portfolio
  scale (dozens of brands), and it is the shared cache key — do not "optimise"
  it into a bespoke fleet rollup, which would be a second truth.
- `brand_id` can be NULL on a site row; the keyword table receives `""` in that
  case rather than crashing. A brandless site is a real state in `web.site`.

---

## Change log

- `2026-08-25` — 🚨 **THE DISPATCHER. Saved schedules now run themselves, and the cascade has ONE implementation.** Arman approved exactly one scheduled task for this — `seo_engine_schedule_dispatcher`, every 15 minutes — and ruled that a row saved in this console IS the approval record for that engine on that brand.
  **In the database** (`migrations/seo_engine_schedule_dispatcher.sql`): `seo.engine_schedule.last_dispatched_at`; `seo.engine_schedule_resolve` (invoker-rights, the ONE cascade — site > organization > system, nearest wins, enabled state carried not filtered so a brand's OFF still governs); `seo.engine_schedules_due` (definer, service-role only — enabled winner + window open + not fired this window + site owes work + no in-flight run, ordered by most owed clicks via `seo.fn_topic_placement_sites_owing`, capped by the winning row's `sites_per_run`); `seo.engine_schedules_claim` (stamps `last_dispatched_at` under `FOR UPDATE SKIP LOCKED` in the same statement it selects, so two overlapping ticks cannot double-spend).
  **In aidream**: `services/seo/engine_schedule_dispatch.py` — claims, then runs each site in sequence through `run_placement_command` (the Run now path), with an `ENGINE_RUNNERS` dict so the next engine is one line, not a new task. Per-site failures are caught, named and reported; the rest of the tick continues. `run_placement_command` now returns its `PlacementPassResult` so the headless caller can report real counts without forking the command path.
  **Here**: `resolveScheduleForSite` DELETED; `resolveSchedulesForSites` reads the DB function. `NO_DISPATCHER_NOTICE` → `DISPATCHER_NOTICE`, and the panel no longer claims nothing runs.
  **Proven live** against production (`brsgrqvjdzwihsvnfqkf`), every temporary row rolled back afterwards: system row due now returned its 3 owing brands ordered by clicks (856 / 8 / 2); adding an organization row moved both of that org's brands onto it and its `sites_per_run=1` trimmed the lower-need one; adding a brand row moved that brand onto it (caps 50 → 7 → 11 observed per tier); switching the brand row OFF removed that brand entirely instead of falling back to the org row. Claim called twice in a row: 3 rows, then 0. One real dispatch (`max_keywords_per_run=3`, Data Destruction) claimed 3 / placed 1, and `admin_list_run_history` shows the run with **1 AI call, 56,069 tokens, $0.031433**, `admin_list_run_ai_calls` returning that call's model, tokens, duration and prompt.
  **Found doing it:** `system_app_context` defaults to `store=False`, so the first dispatch wrote NO `chat.request` row at all and would have shown 0 AI calls forever. Fixed with `store=True` + `conversation_type/origin_class="scheduled"`, mirroring the scheduler's own agent runner.
  **Open:** `admin_list_run_ai_calls` returned an EMPTY `output_text` for this structured-output call (prompt, tokens and cost are all there) — the "see what it generated" half of Arman's requirement is not satisfied for this call shape; same code path as a manual run, so this is pre-existing, not new.

- `2026-08-25` — **Organization and site tiers mounted; v1 is now all three
  tiers, live.** Arman: *"the question is if we already have this set up so
  that organizations and users can use them as well for their websites and
  clients… the organizations will be able to set their own that will then
  override our system one."* Answer: yes, mostly — the shape (`RunConsole`
  scope prop, the cascade, `listConsoleSites`'s site-tier filter) already
  supported it; only the mounts were missing. Added
  `/marketing/automations` (organization tier — fulfills the former
  `marketing.automations` Coming Soon promise, entry deleted from
  `lib/coming-soon/registry.ts`, status dropped from `marketing-nav.ts`) and
  `/marketing/brands/[brandId]/sites/[siteId]/automations` (site tier,
  registered as a real site section under `Programs`). No active org on the
  organization mount renders a "pick an organization" empty state, never a
  crash. **RLS verified live** against `seo.engine_schedule` (Supabase MCP,
  `brsgrqvjdzwihsvnfqkf`): `std_insert`/`std_select` grant any
  `iam.organization_member` row (not just owner/admin) full access to that
  org's rows via `iam.has_org_access` — no policy change needed. Live-tested
  an organization-tier schedule save + remove through the UI: the "which
  schedule governs each brand" table correctly flipped every brand from
  `System default` to `Organization` on save and back on remove, proving the
  cascade override end to end. Site-tier mount verified reachable from the
  site's own sidebar nav (NO DEAD ENDS) and renders scoped to that one site.
- `2026-08-25` — **The two hand-rolled `<table>`s became the canonical
  `MatrxDataTable`, and the page names its AI.** Arman: *"you're showing
  tabular data, but you're not using our canonical table... you've handled
  this new shitty table that doesn't do what we needed to do."* The brand
  list (left panel) and `RunDecisions` (what the AI decided per keyword)
  each rendered a hand-rolled `<table>` with zero sort/filter/search. Both
  now render `MatrxDataTable` in its default `local` (client-side)
  query mode — every column sorts and filters, plus a search box, for free.
  **Brand table:** per-site `topic_placement_status` reads moved out of the
  old per-row `BrandRow` component into a parent-level `useBrandTableRows`
  (`useQueries`, same query key, same cache entry) so every row's sort/filter
  values exist before the table renders them; checkbox selection now rides
  `MatrxDataTable`'s own `selection` config, the focused-row highlight rides
  `selectedId`/`onRowOpen`, and the per-row Run button is a trailing column.
  **`RunDecisions`:** considered using the shared `features/marketing/seo/
  keyword-table` (`<KeywordTable>`) since these rows are keyword-shaped, but
  its ONE QUERY is `seo.gsc_perf_breakdown` — these rows come from
  `listRunPlacements` (`seo.keyword_topic`, a run-scoped window with no
  Search Console dimensions) and carry columns (Offering it chose, Also
  considered, Decided by) that don't exist in that table's core set. Forcing
  them through `<KeywordTable>` would have meant extending its shared query
  and column set for a shape that isn't a keyword-performance row — so this
  went to `MatrxDataTable` directly, not a third keyword table. The keyword
  cell keeps its `useOpenKeywordWindow` button (NO DEAD ENDS): clicking the
  phrase opens its dossier exactly as before. Also mounted `<PageAgents>` in
  the header (`components/agents/PageAgents.tsx`, built the same day) naming
  `seo.topic_assigner` — the page now says which agent it runs and links
  straight into the mandate console (`?mandate=seo.topic_assigner`
  deep-links to the row). Live-verified on **All Green Recycling**: ran a
  cap-5 pass, sorted/filtered/searched both tables, opened a decided
  keyword's dossier from the sorted+searched decisions table, and confirmed
  the mandate link opens Mandates pre-selected on `seo.topic_assigner`.

- `2026-08-25` — **Run history + AI-call-by-call detail (KI-049 addendum).** Arman: *"I need a place where I can go and I can look at the actual runs. And if we made fifty AI calls, I need to be able to click through them one by one and see what they generated."* New right-side tab, `RunHistoryPanel.tsx` + `runHistoryData.ts`: a master list of recent `scheduler.sch_run` + `seo.collection_run` runs (newest first, status/duration/summary/error, AI-call-count + cost badge), click-through to every `chat.request` row attributed to that run — model, full prompt, the full generated output text (recovered from `chat.request_snapshot`, since these internal calls never write `chat.message`), tokens, cost, duration, status, error. Required an aidream-side attribution fix first: `chat.request.execution_kind`/`execution_id` was only ever stamped for `workflow_run`; `run_agent_for_scheduler` and `command_runs.run_streamed_command` now stamp `sch_run` / `seo_collection_run` on the same columns (aidream `agent_runner_adapter.py`, `command_runs.py`). Two new admin-gated RPCs: `admin_list_run_history`, `admin_list_run_ai_calls` (`migrations/run_console_attribution_rpcs.sql`). Manual trigger reuses the console's existing "Run now" — no second run mechanism. **Left:** the aidream deploy for the attribution fix is blocked on an unrelated GitHub Actions billing failure (see the register's Updates entry); until it deploys, new scheduled/SEO-command AI calls stay unattributed and Run history reports 0 calls for them.

- `2026-08-24` — **Nothing the AI decides is hidden, and the tab strip stops lying.** Three faults reported together: (1) the live window narrated steps but showed no output — my own regression, since progress was rendered INSTEAD of content; the window now carries stages as a strip with the model's output owning the body. (2) `Schedule` sat in the brand-keyed tab strip while being global, so selecting a brand changed three tabs and not the fourth; Schedule is now a LEFT-side tab beside Brands, and everything on the right is the selected brand's own data. (3) "This run" reported only counts — useless for judging the machine. It now renders **RunDecisions**: one row per keyword the assigner touched, with the Offering it chose, everything else it considered, its own confidence, whether the row is a proposal under the site's floor, and who decided. Read from the durable placement rows (`seo.keyword_topic`), not the stream, so the analysis survives a reload and can be studied later; every keyword opens its dossier (no dead ends).

- `2026-08-24` — 🚨 **THE BLANK WINDOW. Root cause and root fix.** Clicking play opened the floating live-run window with a stage title and a **permanently empty white body** — reported repeatedly and repeatedly misdiagnosed by reading the console's own results panel BEHIND the window instead of the window itself. The window was never hanging and the stream was never lost: `LiveRunDisplay` renders STREAMED CONTENT off a `requestId`, and a durable pipeline emits typed progress events with no assistant text, so there was literally nothing wired to the body — empty during the run, and still empty after it settled. Fixed at the reusable layer, not here: `lib/durable-run/useDurableRun.ts` now feeds every run's own `stages` into the window as `progress` (the stages ARE the content for these runs), keeps the window bound after settle so the finished narration and any failure reason survive on screen, and `LiveRunDisplay`'s bare variant never renders an empty body again. Every surface on the durable-run hook gets this, not just the run console.

- `2026-08-24` — **The admin console travels under the system org (Arman's ruling) + rejoin carries scope.** Two defects fixed after Arman was blocked by "Could not pick up a background run": (1) this surface never declared a request organization, so `callApi`'s selected-org guard refused both launch and rejoin for any operator without an explicitly selected org (an admin on the system panel by definition has none); it now passes `scopeOverrides.organization_id` — Matrx System for the system tier, the org's own id for the organization tier. (2) `useDurableRun` forwarded `scopeOverrides` on launch but NOT on rejoin (the type's comment promised both), so even a configured surface failed pickup after refresh — fixed in `lib/durable-run/useDurableRun.ts`. Also deduped the local `SYSTEM_ORGANIZATION_ID` copy onto `@/constants/platform-orgs`. Verified live: cap-10 run on Data Destruction placed 10/10 with a mid-run reload picking the run back up; the engine's row writes are NOT governed by the envelope org (see the register's placement-org finding).

- **2026-08-24** — Created (KI-049 v1): `seo.engine_schedule` table, the
  tier-aware console, the system-tier admin route, and the schedule cascade
  panel. Manual runs only; no dispatcher.
