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

**Routes**
- `app/(admin)/administration/marketing/run-console/page.tsx` — the SYSTEM tier
  mount (manage.aimatrx.com). Admin gating is the `(admin)` layout's job.
- The organization and brand mounts do not ship in v1. They are
  `<RunConsole scope={{tier:'organization', organizationId}} />` and
  `<RunConsole scope={{tier:'site', siteId}} />` — no rework required.

**Components**
- `RunConsole.tsx` — the whole console: control bar, brand table, run log,
  results tabs.
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
which tier is winning. It saves storage and nothing else.

---

## Invariants & gotchas

- 🚨 **Nothing runs automatically yet — schedules take effect when the
  dispatcher ships.** That exact sentence is `NO_DISPATCHER_NOTICE` in
  `ScheduleCascadePanel.tsx` and is rendered on the panel and in the save toast.
  v1 is manual-only by Arman's ruling. **Do not create a scheduler task for
  this** — no unapproved schedules, and the 04:50 nightly proposal for topic
  placement was WITHDRAWN (KI-014).
- The console authors only its OWN tier. Seeing every tier is deliberate;
  writing another one is not what the permission difference means.
- Each brand row issues its own `topic_placement_status` RPC. That is portfolio
  scale (dozens of brands), and it is the shared cache key — do not "optimise"
  it into a bespoke fleet rollup, which would be a second truth.
- `brand_id` can be NULL on a site row; the keyword table receives `""` in that
  case rather than crashing. A brandless site is a real state in `web.site`.

---

## Change log

- `2026-08-25` — **Run history + AI-call-by-call detail (KI-049 addendum).** Arman: *"I need a place where I can go and I can look at the actual runs. And if we made fifty AI calls, I need to be able to click through them one by one and see what they generated."* New right-side tab, `RunHistoryPanel.tsx` + `runHistoryData.ts`: a master list of recent `scheduler.sch_run` + `seo.collection_run` runs (newest first, status/duration/summary/error, AI-call-count + cost badge), click-through to every `chat.request` row attributed to that run — model, full prompt, the full generated output text (recovered from `chat.request_snapshot`, since these internal calls never write `chat.message`), tokens, cost, duration, status, error. Required an aidream-side attribution fix first: `chat.request.execution_kind`/`execution_id` was only ever stamped for `workflow_run`; `run_agent_for_scheduler` and `command_runs.run_streamed_command` now stamp `sch_run` / `seo_collection_run` on the same columns (aidream `agent_runner_adapter.py`, `command_runs.py`). Two new admin-gated RPCs: `admin_list_run_history`, `admin_list_run_ai_calls` (`migrations/run_console_attribution_rpcs.sql`). Manual trigger reuses the console's existing "Run now" — no second run mechanism. **Left:** the aidream deploy for the attribution fix is blocked on an unrelated GitHub Actions billing failure (see the register's Updates entry); until it deploys, new scheduled/SEO-command AI calls stay unattributed and Run history reports 0 calls for them.

- `2026-08-24` — **Nothing the AI decides is hidden, and the tab strip stops lying.** Three faults reported together: (1) the live window narrated steps but showed no output — my own regression, since progress was rendered INSTEAD of content; the window now carries stages as a strip with the model's output owning the body. (2) `Schedule` sat in the brand-keyed tab strip while being global, so selecting a brand changed three tabs and not the fourth; Schedule is now a LEFT-side tab beside Brands, and everything on the right is the selected brand's own data. (3) "This run" reported only counts — useless for judging the machine. It now renders **RunDecisions**: one row per keyword the assigner touched, with the Offering it chose, everything else it considered, its own confidence, whether the row is a proposal under the site's floor, and who decided. Read from the durable placement rows (`seo.keyword_topic`), not the stream, so the analysis survives a reload and can be studied later; every keyword opens its dossier (no dead ends).

- `2026-08-24` — 🚨 **THE BLANK WINDOW. Root cause and root fix.** Clicking play opened the floating live-run window with a stage title and a **permanently empty white body** — reported repeatedly and repeatedly misdiagnosed by reading the console's own results panel BEHIND the window instead of the window itself. The window was never hanging and the stream was never lost: `LiveRunDisplay` renders STREAMED CONTENT off a `requestId`, and a durable pipeline emits typed progress events with no assistant text, so there was literally nothing wired to the body — empty during the run, and still empty after it settled. Fixed at the reusable layer, not here: `lib/durable-run/useDurableRun.ts` now feeds every run's own `stages` into the window as `progress` (the stages ARE the content for these runs), keeps the window bound after settle so the finished narration and any failure reason survive on screen, and `LiveRunDisplay`'s bare variant never renders an empty body again. Every surface on the durable-run hook gets this, not just the run console.

- `2026-08-24` — **The admin console travels under the system org (Arman's ruling) + rejoin carries scope.** Two defects fixed after Arman was blocked by "Could not pick up a background run": (1) this surface never declared a request organization, so `callApi`'s selected-org guard refused both launch and rejoin for any operator without an explicitly selected org (an admin on the system panel by definition has none); it now passes `scopeOverrides.organization_id` — Matrx System for the system tier, the org's own id for the organization tier. (2) `useDurableRun` forwarded `scopeOverrides` on launch but NOT on rejoin (the type's comment promised both), so even a configured surface failed pickup after refresh — fixed in `lib/durable-run/useDurableRun.ts`. Also deduped the local `SYSTEM_ORGANIZATION_ID` copy onto `@/constants/platform-orgs`. Verified live: cap-10 run on Data Destruction placed 10/10 with a mid-run reload picking the run back up; the engine's row writes are NOT governed by the envelope org (see the register's placement-org finding).

- **2026-08-24** — Created (KI-049 v1): `seo.engine_schedule` table, the
  tier-aware console, the system-tier admin route, and the schedule cascade
  panel. Manual runs only; no dispatcher.
