# Notifications — the shell Inbox

**Purpose:** THE one place a person is told things. Every in-app notice the
platform sends lands in `communication.notification` (the canonical spine,
aidream `services/notifications/`, `in_app` channel: *the row IS the
delivery*); this feature is the reader. One bell in the header, one panel,
one route. Cross-repo truth: `../../../common-docs/projects/notification-system/HANDOFF.md`
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
| `components/InboxHeaderButton.tsx` | The bell. Badge = unread notices + conversations with unread + proposals waiting. Popover on desktop, Drawer on mobile; a guest gets the auth gate. Idle cost: one tap-target + three hooks. |
| `components/InboxPanel.tsx` | THE inbox body — mounted by the bell AND by `/notifications` (`app/(core)/notifications/page.tsx`). Pinned rows for Messages and Waiting-on-you, then the notice list, Mark-all-read, honest empty/error states. |
| `useInbox.ts` | `useInboxCounts()` (badge) and `useInboxList()` (rows + `markRead` / `markAllRead`) over react-query. `INBOX_POLL_INTERVAL_MS`, `INBOX_PANEL_LIMIT`. |
| `service.ts` | The four door calls. Reads/writes go React → Supabase directly. |
| `types.ts` | `InboxNotification` — the door's RETURNS TABLE. |

## The doors (applied to the main database 2026-09-19 through the Supabase MCP)

| Door | What |
|---|---|
| `communication.my_notifications(p_limit, p_before, p_unread_only)` | The caller's delivered `in_app` rows, newest first, keyset by `created_at`. Never the provider columns. |
| `communication.my_notification_unread_count()` | The badge number. |
| `communication.mark_my_notifications_read()` | Mark all read (`read_channel = 'in_app'`). Returns the count changed. |
| `communication.mark_notification_read(id, 'in_app')` | Pre-existing; one row, on open. |

All `SECURITY DEFINER`, `auth.uid()` resolved inside the body, `anon` holds no
EXECUTE, each declared in `platform.client_callable_door` (`declared_by =
'shell-inbox 2026-09-19'`). Doors rather than a table policy because the
recipient read arm (`recipient_user_id = auth.uid()`) is still routed to the
DB-rules owner — only `iam.apply_rls` may emit it — and a door does not
decertify the table. Verified live as `admin@admin.com` through role
`authenticated`: 257 unread, list returns rows.

## Invariants

- **One home.** Anything that tells a person something that they did not just
  do is a declared spine event, delivered to `in_app`, read here. Never a
  second list, never a per-feature bell. The ~5,400 `toast.*` sites are for
  confirming the person's own action; a toast about something else is a
  notification with no home — convert it to an event.
- **Pinned rows are a bridge, not a design.** Conversations with unread
  messages (`@ai-matrx/messaging`) and proposals waiting (`features/approvals`)
  are pinned above the list with their counts and open their canonical
  surfaces (`messagesWindow`, `approvalsWindow`). When those producers emit
  spine events, the pinned rows go and their items become ordinary rows.
- **Honest badge.** `useInboxCounts().partial` is true when a part could not
  be read; the bell's label says so instead of printing a confident wrong sum.
  A read failure in the panel is a red row with Retry, never "all caught up".
- **Read is a fact the person made.** A row is marked read when opened, or by
  Mark all read — never on delivery (the `in_app` adapter says the same on its
  side).
- **Every row opens.** `deep_link` opens in place (internal) or a new tab
  (external); a row with no link still opens as "read". Never a dead row.

## Freshness — and the named follow-on

`communication.notification` is NOT in `supabase_realtime`, and its select
policy has no recipient arm, so a `postgres_changes` subscription would join,
say SUBSCRIBED and deliver nothing — the class `pnpm check:realtime-publication`
guards. Today: refetch on window focus, every `INBOX_POLL_INTERVAL_MS` (60 s),
and after every mark-read. **Next:** a broadcast on insert (`realtime.send` to
a per-recipient private topic from the dispatcher or a trigger) consumed
through `@ai-matrx/realtime` — invoke the `supabase-realtime` skill first.

## Follow-ups (owned, not optional)

1. **Regenerate `types/database.types.ts`** (`pnpm db-types`) and delete the
   `as never` / `UntypedRpcResult` seam in `service.ts`; derive
   `InboxNotification` from `communication.Functions.my_notifications`. This
   session had no Supabase access token in its sandbox.
2. **Realtime** as above.
3. **Messages and approvals as spine events** — retire the pinned rows.
4. **HR notices views** (`SPEC-NOTIFICATIONS` §8 D6): `/hr/me/notices` and
   `/hr/settings/notifications#notices` mount `InboxPanel` filtered by
   `event_key` prefix, never a separate build.
5. **Preferences link** — the empty state names Settings › Notifications
   (`features/settings/tabs/NotificationsTab.tsx`); a direct control in the
   panel header is the next affordance.

## Change log

- **2026-09-19** — Created. The shell had a dead "Notifications" label in the
  avatar menu and a `NotificationDropdown` fed by an empty `useState`; both
  deleted (with `types/notification.types.ts`, `NotificationItem.tsx`,
  `MessageIcon.tsx`, `MessagesMenuItem.tsx`, `ApprovalsMenuItem.tsx`). The
  Inbox replaced them in the header of `AppShell`, the dev layout and the
  transitional `DesktopLayout`.
