# Platform Spend — `/administration/billing/spend` + the daily spend popover

**What it is.** The one place that answers "where is the money going?" for the
whole platform — for any window, cut by every dimension the ledger has, with
the 80/20 view, the "dig here" signals and click-to-drill — and a floating
window that puts today's number in front of a Super Admin once a day whether or
not they went looking for it.

**Why it exists.** Arman, 2026-09-11: *"a dashboard where I can easily and
quickly see where money is being spent… The key is to scare me by showing me how
much money we spent so far today, not by putting blocks in the code."* Arman,
2026-09-12, after two $100+ days he did not drive: *"it's not being registered
under any user. It's not being registered under any organization. So where the
heck is all this money going?"* and *"where do I go where I can see a line item
and then click it and then see that data with the other dimensions?"* Nothing
in this feature blocks, throttles or refuses anything. The whole intervention is
a number, made large, made red when it is high — and now made explorable.

## THE HONESTY RULE

The headline **and every number in the explorer** are `runtime.global_execution.cost`
and **nothing else**. Every other cost source is shown beside it, labelled with
the role it plays, and never silently added:

| Role | Meaning | Example |
|---|---|---|
| `primary` | The headline. One table. | `runtime.global_execution` |
| `overlap` | Real spend, the SAME money through another lens. Shown, never added. | `chat.user_request` (the same executions counted per request) |
| `additive` | Genuinely separate spend. | `ops.proof_run`, `batch.cost_event` |
| `gap` | A ledger that EXISTS and records nothing (or nothing but zeros). | `docproc.derive_runs`, `communication.sms_messages` |
| `unmeasured` | Money we know we spend with no row anywhere. | Resend email, TTS/STT, SerpAPI/DataForSEO/Brave, hosting |

Consequences that are not negotiable:

- **A "not measured" cell is never drawn as `$0.00`.** `format.ts` renders `null`
  as the words "not measured". A zero and an absence are different facts.
- **The headline always says it is a lower bound**, in the surface copy, with the
  count of sources that measure nothing.
- **A filtered view never reads as a total.** The filter chips carry a coverage
  line: "This slice is $X of the $Y the whole window cost".
- **An empty value is named for what it is** ("Not inside a conversation",
  "Model not recorded (no API-call row)"), never the bare word "Unattributed".
- **Print orders are revenue, not spend**, and sit in their own folded tile with
  our Lulu cost beside them so the margin is visible. They are not in the headline.

## Where the money is attributed (the thing the first version got wrong)

The first dashboard (2026-09-12 morning) grouped only by organization and took
its per-user table from `chat.user_usage_summary` — the rolling THROTTLING
window, a different ledger — so the person who spent $164 in 48h showed as $10
and the spend looked unattributed. It was attributed all along:

| Dimension | Where it lives on the ledger row |
|---|---|
| organization | `runtime.global_execution.organization_id` |
| person, agent, conversation | `runtime.global_execution.context` (`user_id`, `agent_id`, `conversation_id`) |
| app, feature, origin class, status, iterations, tokens | `chat.user_request` via `runtime.global_execution.request_id` (99.8% of conversation cost, 58% of internal-run cost links) |
| model, provider | `chat.request` per API call, rolled up to the model that billed the most of the request |
| trigger | derived: `origin_class` in (`human`, `api`) → **manual**; everything else (`child_agent`, `workflow`, `scheduled`, `system`, `client_auto`, and unlinked internal/scheduler runs) → **automated** |

Rows no chat request explains (scheduler polls, internal runs without a
request row) are attributed from the execution's own context and link kind —
never dropped, never invented — and the totals strip says how much of the
window that is ("Explained by a request").

**One request can own several ledger rows** (one request in the 2026-09-10/11
window owned 71). Cost is summed over all of them; the request-level facts
(token totals, iterations, tool calls, unpriced calls) sit on ONE row — the
earliest execution, `is_request_head` — so nothing per-request is counted once
per execution. Every signal and the costliest-requests table group by request.
The first cut of this function counted failed requests per execution (18 on
screen for 10 requests); the independent review caught it the same day.

**The trigger rule is deliberately about the request's origin, not the
execution's kind.** An `internal_agent_run` whose request carries
`origin_class = 'api'` (an API caller asked the server to run an agent) reads
as manual. If that ever misleads, it is a ruling to change in one place
(`trigger` in the fact build), not a bug.

## Where the numbers come from

Three super-admin-gated `SECURITY DEFINER` RPCs:

| Function | Migration | Used by | Returns |
|---|---|---|---|
| `public.admin_spend_overview(p_tz)` | `spend_dashboard_admin_rpcs.sql`, trimmed by `spend_explorer_admin_rpc.sql` | the headline half | today / yesterday / 7d / 30d / month + projection, the 30-day series, every ledger, print orders |
| `public.admin_spend_headline(p_tz)` | `spend_dashboard_admin_rpcs.sql` | the popover | today / yesterday / 7d / month-to-date, today's top org, the gap count |
| `public.admin_spend_breakdown(p_from, p_to, p_tz, p_filters, p_thresholds)` | `spend_explorer_admin_rpc.sql` | the explorer | for ANY window ≤ 92 days and ANY filters: totals, eleven dimensions ranked with share + remainder, day and hour series split manual/automated, the seven "dig here" signals, the 40 costliest requests |

`public._spend_ledger_registry()` is the ONE list of every cost source and its
role. **Adding a cost source is a row in that `VALUES` list** — the dashboard,
the gaps tile and the popover all learn it at once.

**The breakdown materialises the window ONCE** into a temp table (`ON COMMIT
DROP`, two indexes, `ANALYZE`) and reads every dimension, series and signal from
it — which is why the function is `VOLATILE` (a `STABLE` function may not create
a temp table). Measured 2026-09-12: 48h window 0.9s, filtered 0.4s, 30 days
5.5s (143k ledger rows, 130k of them scheduler polls).

**Filters compose.** `p_filters` is `{ organization | user | agent | app |
feature | origin | trigger | source | model | conversation | day: key }`; the
literal `(none)` matches a NULL. The dimensions returned are the dimensions OF
THE FILTERED SET — that is what "click a line item and see it through the other
dimensions" means. An unknown key RAISES.

**Why RPCs and not client-side reads.** PostgREST aggregates are disabled on this
project (`PGRST123`, verified live 2026-09-12) and the primary ledger carries
~143k rows per 30 days. Reads still go React → Supabase directly; there is no
Next.js API route in the path.

**Timezone.** Day boundaries are cut at local midnight in the viewer's IANA zone,
passed as `p_tz`; the explorer passes absolute instants for the window and the
zone only buckets the series. The surface always names the zone it used, and
says so when the database did not recognise it and fell back to UTC.

## The explorer (`SpendExplorer.tsx` + `explorer/`)

Reading order on the page: headline → explorer → the folded honesty tail.

| Piece | File | What |
|---|---|---|
| Window | `explorer/WindowPicker.tsx`, `windows.ts` | Today / **Yesterday** / Last 24h / 7 days / 30 days / Custom (two local days, inclusive). Yesterday is first-class because a today-only page is worthless one minute past midnight. |
| URL state | `windows.ts` | `?win=yesterday`, `?win=custom&from=…&to=…`, `&f.<dimension>=<key>` — a view reloads and can be handed to someone. The tables' own sort/filter params are left untouched. |
| Filter chips | `explorer/FilterChips.tsx` | The drill-down breadcrumb + the coverage line. |
| Totals | `explorer/TotalsStrip.tsx` | window total, manual vs automated (with shares), requests, tokens (with cache hit rate), "explained by a request". |
| Timeline | `explorer/SeriesBars.tsx` | stacked bars per hour (≤ 4 days) or per day, manual under automated, legend always present, peak direct-labelled, hover title on every bar, click a day to drill. Colours are the theme's `chart-2` / `chart-1` tokens (validated with the dataviz palette script, light: all checks pass). |
| Dig here | `explorer/DigHerePanel.tsx` | seven signal cards ordered by money — see below. |
| 80/20 | `explorer/ParetoPanel.tsx` | per dimension: the fewest rows reaching 80% of the window, then ONE "everything else" row (`paretoCut`). |
| Every dimension | `explorer/DimensionTables.tsx` | one `MatrxDataTable` per dimension, same columns everywhere (cost, share bar, manual, automated, requests, per request, tokens in/cached/out, last activity). |
| Costliest requests | `explorer/TopRequestsTable.tsx` | 40 rows with every dimension, one per request (its ledger rows summed); a request opens its conversation. |
| Names, hrefs, wording | `explorer/labels.ts` | plain-English dimension names, per-dimension "empty" wording, where each identity opens. |

**Drill = click.** Every name in the 80/20 cards, the dimension tables, the
request table and the signal rows calls `drill(dimension, key)`, which writes
`f.<dimension>` to the URL; the explorer re-reads and every panel re-cuts.
Identities also OPEN (no dead ends): organization → `/organizations/<id>`,
person → `/administration/users?focus=<id>`, agent →
`/administration/agents/system-agents/agents/<id>`, conversation → `/chat/<id>`.

### The "dig here" signals

| Signal | Line (knob) | What it means |
|---|---|---|
| Conversations that ate the window | `hog_share_pct` (5%) | one conversation ≥ this share of the window |
| Context-heavy conversations | `context_heavy_tokens` (200k) | average input+cached tokens per model call above the line — cost grows with the square of the conversation length |
| Requests that looped | `iteration_heavy` (10) | model calls inside ONE request |
| Spent and got nothing back | — | requests `failed` / `abandoned` / `max_tokens` |
| Hours that spiked | `spike_multiplier` (3×) | an hour above N× the window's median non-zero hour, with who and what dominated it |
| Repeat bursts | `repeat_burst` (5) | same person + agent + feature ≥ N requests in one ten-minute bucket |
| Unpriced calls | — | `chat.request.cost IS NULL`: the ledger under-counts by an unknown amount |

A signal that found nothing says "none" — it never disappears (the unpriced
line included). Cards over 25% of
the window turn destructive-toned.

## Gating

Three layers, in order of authority (the last one is the real one):

1. the `(admin)` layout admits any Matrx admin;
2. `app/(admin)/administration/billing/spend/page.tsx` raises the bar with
   `checkIsSuperAdmin` server-side and explains the refusal in plain words;
3. all three RPCs re-check `public.is_super_admin()` **inside the function**, so a
   lower-level admin who reaches the client bundle gets a refusal from the
   database, not a number.

A failed read renders the failure and **no numbers** — an empty spend page that
reads as "$0 spent today" would be the worst possible lie on this surface.

## The knobs (law 6 — opinions become knobs)

All overridable by organization, reviewed 45 days out. `knobNumber`/`knobInt`
throw when a row is missing and there is deliberately no fallback.

| Key | Default | What it does |
|---|---|---|
| `platform.spend_popover.times_per_day` | `1` | How many times a day the window is raised. `0` turns it off. |
| `platform.spend_popover.scare_threshold_usd` | `100` | Above this, today's figure turns destructive-toned — colour and wording only, never behaviour. |
| `platform.spend_explorer.context_heavy_tokens` | `200000` | the context-heavy line (tokens per model call) |
| `platform.spend_explorer.iteration_heavy` | `10` | the looped-request line (model calls per request) |
| `platform.spend_explorer.spike_multiplier` | `3` | the spike line (× the median hour) |
| `platform.spend_explorer.hog_share_pct` | `5` | the conversation-hog line (% of the window) |
| `platform.spend_explorer.repeat_burst` | `5` | the burst line (requests per 10 minutes) |

Seeded by `migrations/spend_popover_knobs.sql` and
`migrations/spend_explorer_knobs.sql`. The explorer resolves its five and passes
them to the RPC, which RAISES when one is missing; if they cannot be read the
explorer says so and computes nothing rather than guess where a line sits.

## The popover

`features/window-panels/windows/spend/DailySpendWindow.tsx` **wraps the canonical
headline** (`SpendHeadline.tsx`), the same component the dashboard renders — a
window panel wraps the canonical component, never a hand-rolled copy. It adds
only the two doors out: *Dismiss for today* and *Open spend dashboard*.

It is raised by `DailySpendPopoverMount`, mounted render-free in
`app/DeferredSingletonCore.tsx` and internally gated on `selectIsSuperAdmin`, so
it never delays first paint and never reaches a non-super-admin.

The "already seen it today" memory is local-first and per viewer
(`dailySpendPopoverState.ts`, `localStorage` key `matrx.spend_popover.v1`), NOT
window persistence — the registry entry is deliberately `ephemeral`. Every
storage access is wrapped: a private window or blocked storage degrades to "not
shown yet", never a throw.

## Scrolling — one scroller, never two

The subtraction is scoped to `.shell-root` (the AppShell) on purpose: only
`.shell-main` reserves the banner's height as padding-top; a `(transitional)`
route under `ResponsiveLayout` would otherwise shrink without the matching
reservation.

The page is scrolled by `ClientAdminLayout`'s inner `<main>`; every table lays
out at its content height (no bounded-height wrapper). The outer `.shell-main`
is explicitly `overflow-y: hidden` for `/administration/*`, so it can never
become a second wheel target behind the admin page. Tables may scroll
horizontally when their columns are wider than the viewport, but never
vertically.

The "scroll inside a scroll" Arman saw on 2026-09-12 first exposed itself when
the global alarm banner was up: `.shell-main` reserves the banner's height as
`padding-top` while `.h-page` had been `100dvh − header`, making the two nested
`<main>` elements independently scrollable. The height utilities now also
subtract `--shell-alarm-h`, but that arithmetic is no longer the ownership
boundary—the admin shell itself is structurally non-scrollable.

## Files

| Path | What |
|---|---|
| `app/(admin)/administration/billing/{layout,page}.tsx` | the Billing domain root |
| `app/(admin)/administration/billing/spend/page.tsx` | the route, super-admin gated server-side |
| `features/admin/spend/SpendDashboard.tsx` | the page: headline → explorer → folded ledgers/gaps/print |
| `features/admin/spend/SpendExplorer.tsx` + `explorer/*` | the explorer (see the table above) |
| `features/admin/spend/SpendHeadline.tsx` | THE canonical headline, shared with the popover |
| `features/admin/spend/service.ts` | the three RPC calls + runtime jsonb parsing (never a cast) |
| `features/admin/spend/types.ts` | the narrowed payload shapes |
| `features/admin/spend/windows.ts` | window presets, local-day maths, URL state |
| `features/admin/spend/format.ts` | money/time formatting, one place |
| `features/admin/spend/useSpendPopoverKnobs.ts`, `useSpendExplorerKnobs.ts` | the knobs |
| `features/admin/spend/dailySpendPopoverState.ts` | per-viewer, per-day show/dismiss memory |
| `features/admin/spend/DailySpendPopoverMount.tsx` | the once-a-day trigger |
| `features/window-panels/windows/spend/DailySpendWindow.tsx` | the floating window |
| `features/overlays/openers/dailySpendWindow.tsx` | the one way to open it |
| `migrations/spend_dashboard_admin_rpcs.sql`, `spend_popover_knobs.sql`, `spend_explorer_admin_rpc.sql`, `spend_explorer_knobs.sql` | the database half |

Registered in `features/admin/constants/admin-categories.ts` +
`admin-navigation.ts` (domain `billing`), `features/overlays/catalogue.ts`,
`features/window-panels/registry/windowRegistryMetadata.ts`, and
`features/overlays/OverlayController.tsx`.

## Known gaps this feature NAMES but does not fix

- Twelve cost sources measure nothing (the folded "Every cost source" section
  lists each with its last write). Closing any of them is work in the system
  that spends the money, not here. Largest by likely value: Resend email,
  TTS/STT, the search/SEO data APIs, hosting.
- **Shared logins collapse attribution.** Every developer agent signs into the
  UI as `admin@admin.com` (the repo's own instruction), so all agent-driven
  testing lands on one person and one organization ("AI Matrx"). The explorer
  separates it by conversation, feature and agent, but not by which agent
  session or which developer drove it. A per-session tag on the conversation
  (the coding-session bridge already mirrors sessions) would close this.
- `admin_spend_overview` measured 3.95s once on the dev server (2026-09-12)
  while every per-ledger aggregate it runs measures under 100ms in isolation
  (`chat.tool_call` 86ms is the largest; a 48h sum over the whole ledger is
  27ms, so a `created_at` index was tried and dropped — the table is too
  small for it to matter). Not chased; if it recurs, time the function's
  statements with `auto_explain` rather than guessing.

## Change Log

- **2026-09-12 (scroll ownership follow-up)** — Reproduced production with two
  nested vertical scroll owners (`.shell-main`: 1,430px content in a 1,264px
  viewport; the admin page `<main>`: 3,479px content in 1,264px). Made the
  outer admin shell structurally non-scrollable; `ClientAdminLayout` is now the
  sole page scroller regardless of alarm height, while tables retain horizontal
  overflow only. Browser-verified on the real spend data at localhost.
- **2026-09-12 (evening, round 2)** — Independent review (Opus, adversarial):
  every money number reconciled to the ledger exactly, filters exact, gating
  and injection probes refused. Fixed from its findings: per-request
  granularity for failed spend, looped requests, tokens, unpriced calls and
  the costliest-requests table (`is_request_head`); the Person link now uses
  the `user` param the accounts page reads; the unpriced line never
  disappears; the 92-day cap is said in words before the round trip; the
  `.h-page` subtraction is scoped to `.shell-root`; `anon` lost EXECUTE;
  the temp-table drop is `pg_temp`-qualified; a hog's trigger is the
  majority of its cost, not `min()`.
- **2026-09-12 (evening)** — THE EXPLORER. `admin_spend_breakdown` (any window,
  eleven dimensions, filters that compose, seven signals, top requests), five
  `platform.spend_explorer.*` knobs, the page rebuilt as headline → explorer →
  folded honesty tail. `admin_spend_overview` lost `by_org` and `by_user` (the
  latter was the throttling window, not the ledger — it made $164 of spend look
  like $10). Verified live against direct SQL: 48h window $251.51 on screen =
  `sum(cost)` $251.50564904; yesterday $143.24 = the headline's yesterday;
  filtered to Masterwork Conductor $131.94, every dimension collapsing to one
  row. Class fix for the double scroll under an alarm banner (`.h-page`).
- **2026-09-12** — Built. Route, dashboard, popover, two RPCs, the ledger
  registry, two knobs. Verified live against direct SQL: today $134.42 on screen
  vs `sum(cost)` $134.42237755, yesterday $108.26 vs $108.26389416 (exact, closed
  window), month-to-date $597.71 vs $597.71180208. Popover shown, dismissed, and
  confirmed still dismissed after reload.
