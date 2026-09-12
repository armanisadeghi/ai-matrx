# Platform Spend — `/administration/billing/spend` + the daily spend popover

**What it is.** The one place that answers "where is the money going?" for the
whole platform, and a floating window that puts today's number in front of a
Super Admin once a day whether or not they went looking for it.

**Why it exists.** Arman, 2026-09-11: *"a dashboard where I can easily and
quickly see where money is being spent… floating window popovers that come up
once a day or a couple times a day… The key is to scare me by showing me how
much money we spent so far today, not by putting blocks in the code."* Nothing
in this feature blocks, throttles or refuses anything. The whole intervention is
a number, made large, and made red when it is high.

## THE HONESTY RULE

The headline is `runtime.global_execution.cost` and **nothing else**. Every other
cost source is shown beside it, labelled with the role it plays, and never
silently added:

| Role | Meaning | Example |
|---|---|---|
| `primary` | The headline. One table. | `runtime.global_execution` |
| `overlap` | Real spend, the SAME money through another lens. Shown, never added. | `chat.user_request` ($119.11 today vs the headline's $134.42 — the same executions counted per request) |
| `additive` | Genuinely separate spend. | `ops.proof_run`, `batch.cost_event` |
| `gap` | A ledger that EXISTS and records nothing (or nothing but zeros). | `docproc.derive_runs`, `communication.sms_messages` |
| `unmeasured` | Money we know we spend with no row anywhere. | Resend email, TTS/STT, SerpAPI/DataForSEO/Brave, hosting |

Consequences that are not negotiable:

- **A "not measured" cell is never drawn as `$0.00`.** `format.ts` renders `null`
  as the words "not measured". A zero and an absence are different facts.
- **The headline always says it is a lower bound**, in the surface copy, with the
  count of sources that measure nothing.
- **The per-user table is a DIFFERENT SCOPE and says so on screen.**
  `chat.user_usage_summary` is the rolling throttling window (24h/6h, chat
  requests only). On 2026-09-12 it totalled $35.07 against $144.85 on the primary
  ledger for a nominally similar window. It answers "who is driving spend", never
  "what did today cost".
- **Print orders are revenue, not spend**, and sit in their own tile with our
  Lulu cost beside them so the margin is visible. They are not in the headline.

## Where the numbers come from

Two super-admin-gated `SECURITY DEFINER` RPCs, applied by
`migrations/spend_dashboard_admin_rpcs.sql`:

| Function | Used by | Returns |
|---|---|---|
| `public.admin_spend_overview(p_tz text)` | the dashboard | the whole page in one round trip: headline, 30-day series, by-organization, by-user, every ledger, print orders |
| `public.admin_spend_headline(p_tz text)` | the popover | today / yesterday / 7d / month-to-date, today's top-spending org, the gap count |

`public._spend_ledger_registry()` is the ONE list of every cost source and its
role. **Adding a cost source is a row in that `VALUES` list** — the dashboard,
the gaps tile and the popover all learn it at once.

**Why RPCs and not client-side reads.** PostgREST aggregates are disabled on this
project (`PGRST123: Use of aggregate functions is not allowed`, verified live
2026-09-12) and the primary ledger carries ~143k rows per 30 days. A client-side
"what did today cost" would be 144 `readAllRows` round trips for one number, and
the popover has to open instantly. The sums belong in the database — the same
shape as the KG cost console's `fn_kg_cost_*` family. Reads still go React →
Supabase directly; there is no Next.js API route in the path.

**Timezone.** Day boundaries are cut at local midnight in the viewer's IANA zone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`), passed as `p_tz`. The
surface always names the zone it used, and says so when the database did not
recognise it and fell back to UTC.

## Gating

Three layers, in order of authority (the last one is the real one):

1. the `(admin)` layout admits any Matrx admin;
2. `app/(admin)/administration/billing/spend/page.tsx` raises the bar with
   `checkIsSuperAdmin` server-side and explains the refusal in plain words;
3. both RPCs re-check `public.is_super_admin()` **inside the function**, so a
   lower-level admin who reaches the client bundle gets a refusal from the
   database, not a number.

A failed read renders the failure and **no numbers** — an empty spend page that
reads as "$0 spent today" would be the worst possible lie on this surface.

## The knobs (law 6 — opinions become knobs)

Seeded by `migrations/spend_popover_knobs.sql`, both overridable by organization,
reviewed 45 days out:

| Key | Default | What it does |
|---|---|---|
| `platform.spend_popover.times_per_day` | `1` | How many times a day the window is raised. `0` turns it off. |
| `platform.spend_popover.scare_threshold_usd` | `100` | Above this, today's figure turns destructive-toned — colour and wording only, never behaviour. |

`knobNumber`/`knobInt` throw when a row is missing and there is deliberately no
fallback. If the cadence knob cannot be read the popover does not show and says
why on the console; if the threshold cannot be read the dashboard prints a
destructive notice saying the headline will not change colour. Neither guesses.

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
window persistence — the registry entry is deliberately `ephemeral`, because
restoring the window on every refresh would be nagging rather than alarming.
Closing the window by its title-bar X and clicking Dismiss mean the same thing;
neither can leave it re-opening an hour later. Every storage access is wrapped:
a private window or blocked storage degrades to "not shown yet", never a throw.

## Files

| Path | What |
|---|---|
| `app/(admin)/administration/billing/{layout,page}.tsx` | the Billing domain root |
| `app/(admin)/administration/billing/spend/page.tsx` | the route, super-admin gated server-side |
| `features/admin/spend/SpendDashboard.tsx` | the console |
| `features/admin/spend/SpendHeadline.tsx` | THE canonical headline, shared with the popover |
| `features/admin/spend/service.ts` | the two RPC calls + runtime jsonb parsing (never a cast) |
| `features/admin/spend/types.ts` | the narrowed payload shapes |
| `features/admin/spend/format.ts` | money/time formatting, one place |
| `features/admin/spend/useSpendPopoverKnobs.ts` | the two knobs |
| `features/admin/spend/dailySpendPopoverState.ts` | per-viewer, per-day show/dismiss memory |
| `features/admin/spend/DailySpendPopoverMount.tsx` | the once-a-day trigger |
| `features/window-panels/windows/spend/DailySpendWindow.tsx` | the floating window |
| `features/overlays/openers/dailySpendWindow.tsx` | the one way to open it |
| `migrations/spend_dashboard_admin_rpcs.sql`, `migrations/spend_popover_knobs.sql` | the database half |

Registered in `features/admin/constants/admin-categories.ts` +
`admin-navigation.ts` (domain `billing`), `features/overlays/catalogue.ts`,
`features/window-panels/registry/windowRegistryMetadata.ts`, and
`features/overlays/OverlayController.tsx`.

## Known gaps this feature NAMES but does not fix

Twelve cost sources measure nothing. Closing any of them is work in the system
that spends the money, not here — but the tile makes each one visible with its
last write date, so nobody can mistake the headline for the whole bill. The
largest by likely value: Resend email, TTS/STT, the search/SEO data APIs
(SerpAPI, DataForSEO, Brave), and hosting.

## Change Log

- **2026-09-12** — Built. Route, dashboard, popover, two RPCs, the ledger
  registry, two knobs. Verified live against direct SQL: today $134.42 on screen
  vs `sum(cost)` $134.42237755, yesterday $108.26 vs $108.26389416 (exact, closed
  window), month-to-date $597.71 vs $597.71180208. Popover shown, dismissed, and
  confirmed still dismissed after reload.
