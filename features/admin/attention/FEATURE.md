# Super-admin attention dock

**What it is.** ONE floating card, on every page, for everything that needs a
person responsible for the platform — with a way out. Mounted once in
`app/DeferredSingletonCore.tsx`; super-admin only; absent when nothing needs
a person.

**Why it exists (Arman, 2026-09-14).** Two floating notices had grown side by
side — the schedule alarm (bottom-right) and the provider outage notice
(top-centre) — each with its own snooze, mute store, layout marker and idea
of a row. The schedule one had become furniture:

> "It keeps reminding me and telling me that things are off, but some of
> these things should be off, and there's nothing wrong with the fact that
> they're off, but it's not giving me an out."

Three commerce schedules were red for sixteen days because the commerce
module is unbuilt. Two SEO schedules were orange because ONE transient run
had failed. Every row was a title with a link: no reason, no failed run, no
page in the product where the damage showed, no action — and the reason text
carried raw uuids.

## The model

| Piece | File | Role |
|---|---|---|
| Types | `types.ts` | `AttentionItem` (a decision, not a title), `AttentionSourceState` |
| Sources (pure) | `sources/schedule-alarms.ts`, `sources/provider-outages.ts` | rows → items; summaries |
| Sources (live) | `sources/useScheduleAlarmSource.ts`, `sources/useProviderOutageSource.ts` | React Query read + the injected writes |
| Notice | `build-notice.ts` | live/muted partition, the title, the pill, `null` at zero |
| Row | `AttentionItemRow.tsx` | the same row on the dock AND the review page |
| Dock | `AdminAttentionDock.tsx` | float, collapse, snooze, note dialog, runway marker |
| Mutes | `item-mute.ts` + `useLocalMutes.ts` | durations; the LOCAL store (external store, no effects) |
| Snooze | `dock-snooze.ts` | whole-dock, this browser, timed |
| Poll | `poll.ts` | KNOB MIRROR of `platform.attention.poll_ms` |

A **row** carries: severity; the record as an `EntityRef` door (open / new
tab / peek); a short state ("switched off 16 days ago", "2 runs failed in a
row"); one honest sentence through `TextWithDoors` (never a bare uuid);
"Where it shows:" — the product pages the job feeds, each opening in a new
tab, or the honest "This job has not said which pages it feeds"; the evidence
("The run that failed"); the fix beside the complaint (Re-enable, with its
consequence stated before it runs); and **Mute** — 1 hour … 30 days, or
30 days with a note.

**Two mute scopes.** A schedule's mute is a FACT ABOUT THE RECORD: written to
`sch_task.metadata.alarm_mute {until, reason, by, at}` through RLS
(`platform_admin_all`) with `mergeJsonColumn`, returned by the RPC, seen by
every super-admin on every device, listed on the review page with its note.
An outage has no row a person can annotate, so its mute is LOCAL (this
browser), keyed by the server's outage id — a new outage is a new id and is
never muted by an old click. Nothing is muted forever: the longest choice is
a month, and silence beyond that is a decision about the schedule, not the
alarm.

**The clock.** `hooks/useNow.ts` (30-second external store) is the only
"now" in render; the nearest expiry among the items on screen arms a timer
that refreshes the clock, the local store, and every source, so silence ends
by itself in this tab without a reload.

**It floats.** A notice never modifies the page under it (Arman, 2026-09-12).
While visible it sets `data-admin-attention="compact|expanded"` on `<html>`;
`styles/shell.css` reserves a responsive scroll runway on the shell scroll
owner from that state alone (guards: `styles/__tests__/no-overlay-layout-reservation.test.ts`,
`features/shell/layout-gate/shell-scroll-runway.spec.ts`).

## The data half (schedules)

`scheduler.system_schedule_alarms(p_overdue_grace_minutes integer = NULL)` —
super-admin SECURITY DEFINER; v2 on 2026-09-14
(`migrations/scheduler_system_schedule_alarms_v2_*.sql`):

- `suspended` (critical) — guard-suspended and off; `succeeded_since_suspension`
  says when a later run succeeded, so the sentence is "off for no live reason".
- `overdue` (warning) — enabled, due more than `scheduler.alarms.overdue_grace_minutes` ago.
- `failing` (warning) — `failed_streak` ≥ `scheduler.alarms.failing_streak`
  consecutive terminal failures. One failed run between successes is not an alarm.
- Every row: `last_run_id/status/error`, `description`, `tags`, `approval`,
  `impact` (from `metadata.impact`), and the mute columns. Muted rows ARE
  returned; the dock hides them, the review page lists them.
- 20 ms live (v2b walks `sch_run_task_due_idx` per task; v2c makes the
  streak one grouped aggregate).

**Impact is declared by the job.** aidream
`register_system_task(..., impact=[SystemTaskImpact(href, label, what)])`
is reconciled onto `sch_task.metadata.impact` at worker boot (aidream
`0686` seeded the first five). A job with no declaration shows "has not said
which pages it feeds" — honest, and the nudge.

## Review page

`/administration/automation/scheduling/scanner-health` renders the SAME
source and the SAME row (live rows, then a "Muted — quiet on purpose"
section with the note, who, until, and Unmute), so it can never drift from
the card that points at it.

## Adding a source

One pure module (`rows → AttentionItem[]`, a summary sentence), one hook
returning `AttentionSourceState`, one line in `AdminAttentionDock`. Set
`loud` honestly: a direct DB read that fails must be said; a Python poll
that fails is already captured by `lib/python-client`.

## Tests

`__tests__/build-notice.test.ts` (null at zero, ordering, both mute scopes,
expiry), `__tests__/mutes-and-snooze.test.ts` (never permanent, garbage-safe),
`__tests__/schedule-alarm-items.test.ts` (RPC-shaped fixtures → doors,
actions, mutes), `__tests__/AdminAttentionDock.test.tsx` (real component:
one card for two sources, doors, local vs server mute, non-admin issues no
request, loud vs silent failure, never an all-clear, expired mute ignored).

## Change log

- **2026-09-14** — Built. Replaces `features/scheduling/components/alarm/SystemScheduleAlarmBanner.tsx`,
  `features/scheduling/lib/{system-schedule-alarm-notice,alarm-snooze}.ts` and
  `features/admin/system-errors/{PlatformOutageBanner.tsx,outage-mute.ts}` (deleted, no shims).
  Knob `platform.system_errors.outage_poll_ms` → `platform.attention.poll_ms`.
