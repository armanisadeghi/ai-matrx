# Notifications — the shell Inbox

**Purpose:** THE one place a person is told things. Every in-app notice the
platform sends lands in `communication.notification` (the canonical spine,
aidream `services/notifications/`, `in_app` channel: *the row IS the
delivery*); this feature is the reader. One bell in the header, one panel,
one route. Cross-repo truth: `../../../common-docs/systems/communications/notifications/projects/notification-system/HANDOFF.md`
(program) and `../../../common-docs/systems/communications/STATE.md` (verified state).

Arman's rulings that shape it (2026-08-20): *"a system-wide, canonical
notification system that includes email, sms, popups, browser notifications,
mobile notifications and more, but all based on what the user wants"* ·
🚨 **A NOTIFICATION IS NEVER A CHIP** · **No feature builds its own notifier.**
And the header ruling (2026-09-19): the bell is one of the three fixed header
controls, never hidden — see `features/shell/FEATURE.md`.

## Entry points

| File | Role |
|---|---|
| `components/InboxHeaderButton.tsx` | The bell. Badge = unseen Needs-you + For-you notices + anything new from a counting source since the bell was last opened (`badge.ts`); clears on open (ruling 1). Source marks live in synced preferences (`preferences.inbox`, `useInboxMemory.ts`), so they follow the person to every device. Updates add a dot, never a number; an unreadable part shows a neutral dot. Toggles the Notifications canvas tab (`canvas/notificationsKind.tsx`), opened in a pane below what the canvas shows; pressed while in front. `G` then `N` opens the inbox window from anywhere. |
| `components/BellPanel.tsx` | THE bell body — the Notifications canvas tab (`variant="pane"`, touch-sized on a phone; the phone ⋮ sheet opens the same tab). For you / Updates tabs, Needs-you section (3 + "N more"), time buckets, grouped rows, All places strip, footer "Open inbox" as a WINDOW (Ctrl/Cmd-click: new tab). **Clear all** (every Inbox notice Done, every page, one call, Undo in the toast) and ⋯ **Clear a kind** (every kind with its count, `my_inbox_kinds`). |
| `components/InboxWorkspace.tsx` | THE inbox — `/notifications` (`InboxPage`, `?org_filter=`, `?view=`) and the inbox window (`windows/InboxWindow.tsx`). Rail (views + Places), grouped list, detail pane, Snoozed (with `HiddenElsewhere`) and Done views, keyboard (J/K, Enter/O, E, Shift+E, U, H, X, Z, ?), bulk, search, type filter, organization filter (default All, never the active org). |
| `components/NoticeRow.tsx` | ONE row anatomy for bell, sheet and page: unread dot, lead (avatar or type icon), actor · title, context · plain preview, time → hover Done / Snooze / ⋯; 52/64px fixed; swipe on the phone (left Done, right read). |
| `components/NoticeDetail.tsx` | Detail pane: triage bar, full body (`NotificationBody`), group members. |
| `components/HiddenElsewhere.tsx` | Snoozed view's cross-source half: snoozed/silenced assists, snoozed/dismissed tasks, snoozed record-store items — each with its way back (ruling 3). |
| `components/PlacesStrip.tsx` | "All places" strip and the rail's `SourceItem`. Each place's number is its count above what the person last cleared; its ⋯ holds **Clear** and **Hide from bell** (hidden places come back from "Hidden · N"). |
| `sources/registry.tsx` | THE notice-source registry (ruling 3): approvals, record-store work, workflows waiting, assists, tasks, HR tasks. Each opens its CANONICAL list as a window (or a new tab when the list owns the address). A new system joins here, never by editing the bell. |
| `openNotice.ts` | `useOpenNotice` — the one opener. `?panels=` → window in place; route with a window → that window; any other link → NEW TAB, announced (`notice-no-window` / `notice-no-hydrator`). Never the router. |
| `useInbox.ts` | `useInboxCounts` (badge, dot, shared seen-store), `useInboxFeed` (paged view), `useInboxActions` (optimistic triage + undo), `useWorkWaiting`. |
| `useNoticeHandlers.ts` | Row actions, once: open marks the group read (never Done-on-open), Done, Snooze, read toggle, new tab, Turn off this type (`setNotificationPreference`, in_app). |
| `presentation.ts` · `grouping.ts` | Titles (subject → event-type label → humanised key, never the raw key), plain previews, buckets, categories/icons, times; client grouping (target, or event family for updates). |
| `service.ts` | Door calls with an honest fallback to the pre-triage doors (`triage: false` → Done/Snooze/Snoozed/Done-tab absent). |

Windows that wrap canonical lists (registered in `features/overlays/catalogue.ts`, metadata, `OverlayController`, openers): `notificationsInboxWindow` (this workspace), `assistsWindow` (`features/assists/windows`, wraps `AssistsManager`), `workInboxWindow` (`features/unified-data/windows`, wraps records-ui `ActionInbox`, all organizations, records open in a new tab), `waitingRunsWindow` (`features/workflow-runtime/discovery/windows`, wraps `WaitingInbox`).

## The doors

Pre-triage (live since 2026-09-19): `my_notifications`, `my_notification_unread_count`, `mark_my_notifications_read`, `mark_notification_read`, `custom.inbox_counts`.

Triage (`migrations/notifications_inbox_triage.sql`, **live since 2026-10-07, approved by Arman**): columns `seen_at`, `done_at`, `snoozed_until`; `config.bucket` defaults on every event type; doors `inbox_notifications(p_state, p_limit, p_before, p_unread_only, p_org_id)`, `my_inbox_summary()`, `mark_inbox_seen()`, `set_notifications_state(p_ids, p_action, p_until)`, `my_inbox_organizations()`. Snooze needs no schedule: a past `snoozed_until` reads as back, unread, sorted at that moment. Inverse: `migrations/inverse/notifications_inbox_triage_down.sql`. Still to do now that it is live: regenerate types, drop the `as never` seam, delete the pre-triage fallback and `my_notifications` / `my_notification_unread_count` (aidream `scripts/check_db_memory_budget.py` names the latter).

Clear by kind (`migrations/notifications_inbox_clear_by_kind.sql`, live 2026-10-07): `my_inbox_kinds()` (every kind in the Inbox with its count and unseen) and `clear_inbox(p_action done|read|snooze, p_event_keys text[] null = all, p_until)` → the ids it changed, for Undo through `set_notifications_state(ids, 'undone')`. Inverse: `migrations/inverse/notifications_inbox_clear_by_kind_down.sql`.

All `SECURITY DEFINER`, `auth.uid()` resolved inside, anon holds no EXECUTE, each declared in `platform.client_callable_door`.

## Invariants

- **One home.** Anything that tells a person something that they did not just do is a declared spine event, delivered to `in_app`, read here. Toasts are for the person's own action.
- 🚨 **The bell never moves the page** (owner ruling 4, 2026-10-01, widening 2026-09-30). The bell, the phone sheet, the inbox window and every source open a window over the page or a new tab — never the router, never a same-tab link. Guard: `__tests__/bell-never-navigates.test.tsx` clicks every control of the bell with one notice of every link kind and fails on any router call or same-tab anchor; a static half refuses `useRouter` / `next/link` / `AppLink` in the bell's tree. Shown red on the pre-2026-10-01 `InboxPanel` (5 router pushes + the same-tab footer link), green after. Opener contract: `__tests__/notice-opens-without-moving-the-page.test.tsx`.
- 🚨 **Never a number the person cannot clear** (Arman, 2026-10-07). The badge counts only what is new since the bell was opened. Every notice, every kind (`Clear a kind`, `Turn off this type` clears its kind too), the whole Inbox (`Clear all`) and every place (`Clear`, `Hide from bell`) leaves the bell in one or two clicks; hard work (38 workflows waiting) lives on its own page. Marks move only when the person opens the bell or clears — never on a refetch. Workflows waiting is compared by run id (one handled + one new shows 1); approvals, tables and assists answer only counts, so one handled + one new between two opens reads 0 until the count passes the mark (known limit, `badge.ts`). The bell reads every place once (`usePlaceStates`), so Clear all clears places folded under More too. Guards: `__tests__/the-badge-counts-only-what-is-new.test.ts`, `__tests__/a-waiting-place-clears-in-one-click.test.tsx`, `__tests__/opening-the-bell-writes-the-seen-mark.test.tsx`, `__tests__/clear-all-clears-every-place.test.tsx`, `__tests__/the-badge-asks-the-triage-doors.test.ts`; live door check `node scripts/check-inbox-doors.mjs` (`--plant` shows it red; one rolled-back transaction); live walk `scripts/bell-zero-walk.mjs`.
- **Triage to zero** (ruling 2). Done is the main gesture; every action is undoable (`Z`, toast Undo) and Done is recoverable from the Done view. Opening never marks Done.
- **Honest badge** (ruling 1). Counts only what is new and needs you or is addressed to you. Never "N unread" in the header.
- **One door to every notice system** (ruling 3) — the source registry; hidden things are listed in Snoozed.
- **Read is a fact the person made.** Opening a row (or its group) marks it read; never on delivery.
- **Every row opens.** A row with no link still opens into the detail pane.

## Freshness — and the named follow-on

`communication.notification` is NOT in `supabase_realtime`, and its select
policy has no recipient arm, so a `postgres_changes` subscription would join,
say SUBSCRIBED and deliver nothing — the class `pnpm check:realtime-publication`
guards. Today: refetch on window focus, every `INBOX_POLL_INTERVAL_MS` (60 s),
and after every mark-read. **Next:** a broadcast on insert (`realtime.send` to
a per-recipient private topic from the dispatcher or a trigger) consumed
through `@ai-matrx/realtime` — invoke the `supabase-realtime` skill first.

## Follow-ups (owned, not optional)

1. **Types after the live apply** — `pnpm db-types`, derive types, delete the pre-triage fallback.
2. **Grouped door** `my_notification_groups(...)` so grouping is exact across pages (today: client-side over the loaded page).
3. **Mute a record** — needs a `notification_mute` table (`platform.create_entity_table` + certification, owner first). "Turn off this type" ships today.
4. **Mark-unread on the pre-triage door** does not exist; until live apply, unread toggles only work on the clone.
5. **Producers (aidream):** HR workflow / share / print senders write a `subject`; set `created_by` to the human who caused the event; Needs-you items set `done_at` when decided anywhere; due-date reminders become spine events; toasts about events the person did not cause become spine events.
6. **Realtime** — broadcast on insert + the "N new" pill (§3.6).
7. **Detail pane mounts the target's canonical window component inline** (§3.5); today "Open" opens it as a window over the page. Places in the rail open windows rather than mounting in the pane.
8. **Inline Approve/Decline** on approval rows through the approval kind registry; today Needs-you rows carry "Review", which opens the item in place.
9. **Version-skew "Not now"** persisted and shown under Snoozed; **HR task inbox** and **question desk** as windows (both write the address today, so HR tasks opens in a new tab).
10. **Organization overrides** of `config.bucket` through `notification_event_override.config_patch` are not read by the doors yet.
11. **Badge gaps:** workflows waiting (a needs-you source) shows its count in All places but does not add to the badge (its read is a server call plus a realtime channel — too heavy for every page); reminder notices about record-store items and the "In your tables" count can both add (T6) until those reminders are suppressed for items already counted.
12. **Performance:** `inbox_notifications` orders by a computed sort time, so each page reads all of a person's rows; a stored `sort_at` with an index on `(recipient_user_id, sort_at desc, id desc)` is the fix if inboxes grow. Group actions cover loaded members only (the grouped door fixes both).
13. **HiddenElsewhere** lists snoozed assists from the newest 100 pending (the count in All places is exact); `listMyTaskUserStates` logs and returns [] on failure, so a task-state read failure reads as "nothing hidden" — fix in the tasks service.

## Change log

- `2026-10-07` — BELL-OWNER: **the bell people never learn to ignore.** Triage migration approved by Arman and applied live (the badge's `my_inbox_summary` 404 is gone); badge = only what is new since the bell was opened, marks synced across devices; Clear all, Clear a kind, per-place Clear / Hide from bell; Turn off this type clears its kind. New doors `my_inbox_kinds`, `clear_inbox`.

- `2026-10-03` — claude: **A short pane keeps its notices.** In a split canvas the Notifications pane was ~270px and the pinned All places strip plus the footer took all of it — "Needs you · 24" was clipped under the strip. The notices now keep a 96px floor and the strip yields first, scrolling inside itself (`BellPanel`). Verified live at a 215px pane: the Needs you label and its first row show, All places scrolls.

- **2026-10-02** — The bell opens Notifications as a canvas tab (kind `notifications`, body `BellPanel variant="pane"`) in a vertical split below the tab in front; an empty canvas just opens it; a second press closes it. The popover, the phone drawer and the `sheet` variant are gone. Guard: `__tests__/the-bell-opens-notifications-in-the-canvas.test.tsx`.

- **2026-10-02** — An absent triage door is no longer filed RED on every load (`/board` captured `PGRST202 communication.my_inbox_summary` while the inbox ran on its fallback). Doors with a working pre-triage fallback go through `allowAbsentDoor` (`lib/diagnostics/supabaseErrorCapture.ts`); Done/Snooze against an absent door and every other error still capture; the stand-in announces itself once per page in the console with the remedy. Guard: `__tests__/absent-door-is-not-an-incident.test.ts` (red on the old reader).

- **2026-10-01** — Notifications UI redo (owner rulings 1–4, `common-docs/systems/communications/notifications/FEATURE.md`). `InboxPanel` deleted; `BellPanel`, `InboxWorkspace`, `NoticeRow`, `NoticeDetail`, `HiddenElsewhere`, the notice-source registry and four windows built; every open is a window or a new tab (guard red→green); triage migration applied and rehearsed (up/inverse/up) on the clone only. Verified on the clone preview as admin@admin.com at 1440 and 375, dark and light. Independent review (6 HIGH) fixed the same day: per-action undo, Enter never hijacked, live fallback offers no unread/undo it cannot do, (time, id) paging, unsafe links open nothing, waiting runs open in a new tab, the guard now opens every menu and scans the whole folder (mutation shown red).

- **2026-09-30** — Mandate Candidates F1: `?panels=` notice links open their window in place;
  every linked row gets Open in new tab; unknown window keys fall back loudly. Proven on the clone
  preview as admin@admin.com (evidence: `common-docs/systems/intelligence/mandates/projects/mandate-candidates/REGISTER.md`).

- **2026-09-29** — `custom.inbox_counts` rewritten set-based (follow-up 6). Proven identical on the
  nightly clone for all 1,398 users + 176 explicit (user, organization) calls + 8 rolled-back
  snooze/clear scenarios (0 mismatches); admin@admin.com 981 ms -> 174 ms live (clone best-of-5
  598 -> 93 ms). Inverse: `migrations/inverse/inbox_counts_one_pass_over_every_organization_down.sql`.
- **2026-09-28** — Platform-performance pass: `useInboxCounts`'s work-waiting
  read (`custom.inbox_counts`) now waits for `requestIdleCallback` (the house
  pattern from `useWarmAgent`) instead of firing on mount, so it never
  competes with the shell's boot reads. See follow-up 6 above for the
  underlying N+1 the DB call still has.
- **2026-09-24** — Lane S5-PRIME-2: the badge counts what waits on the person in the record
  store (`custom.inbox_counts`, every organization of theirs) and the panel pins one row per
  organization that opens its inbox. Snoozed and cleared items are not counted — the same door the
  inbox screen hides them with. The store's own reminders (`custom.inbox.reminder`,
  `custom.inbox.snooze_ended`) arrive here as ordinary rows. Walk: `scripts/s5prime2-badge-walk.mjs`.

- **2026-09-20** — Merge with `main`: a parallel lane had wired the old
  `NotificationDropdown` to the same doors through its own reader
  (`useNotificationBell.ts`, `display.ts`, `types/notification.types.ts`).
  Two readers over one spine is the defect this feature exists to end, so
  those four files were dropped in the merge and the transitional
  `DesktopLayout` keeps `InboxHeaderButton`.
- **2026-09-19** — Created. The shell had a dead "Notifications" label in the
  avatar menu and a `NotificationDropdown` fed by an empty `useState`; both
  deleted (with `types/notification.types.ts`, `NotificationItem.tsx`,
  `MessageIcon.tsx`, `MessagesMenuItem.tsx`, `ApprovalsMenuItem.tsx`). The
  Inbox replaced them in the header of `AppShell`, the dev layout and the
  transitional `DesktopLayout`.
