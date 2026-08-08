---
status: active
updated: 2026-08-07
repos: [matrx-frontend, aidream]
vision: []
---

# Tasks — world-class task system, fully integrated

## Vision — Arman's words

- "Potential connections to other parts of our system and expansion to really make it a world-class task system that is fully integrated."
- "I want to make sure that we also tap into our own internal dm messaging system for things related to these tasks."
- Must-haves he listed (2026-08-07, verbatim highlights): "Universal task primitive: one task model usable by users, agents, and every feature" · "Clear provenance: who/what created it, why, and a deep link to the source" · "Smart reminders: persistent when necessary, quiet after acknowledgement, escalating when overdue" · "Volume-aware notifications: show individual tasks at low volume; at high volume show a count plus one or two representative tasks" · "Actionable notifications: complete, snooze, reschedule, dismiss, assign, or open directly from the notification" · "System-created tasks: one simple, idempotent primitive any feature can call" · "Fast capture and triage: create from anywhere; bulk complete, snooze, assign, prioritize, and reschedule" · "Completion integration: features can automatically complete or cancel tasks when the underlying work is resolved."
- Enhancements backlog (his list): NL task creation/rescheduling, digests + "What needs attention?", AI prioritization, task extraction from chats/emails/meetings/agent results, calendar sync + time blocking, workload/deadline-conflict detection, templates/checklists, conditional reminders, notification ranking that learns, delegated agent execution with approval.

## Resources

- [features/tasks/FEATURE.md](../../features/tasks/FEATURE.md) — data model, flows, 2026-08 upgrade section (read first).
- Status vocabulary: `features/tasks/constants/status.ts` (the ONE lifecycle source). Smart views: `features/tasks/constants/smartViews.ts`.
- Services: `features/tasks/services/taskService.ts` (incl. `completeTask` recurrence roll-forward, `upsertSystemTask`/`resolveSystemTask`), `taskUserStateService.ts` (snooze/ack/pin), `features/tasks/utils/recurrence.ts` (RRULE subset).
- DM channel: `lib/services/system-dm.ts` (sendDm + Matrx System bot) → chips in `features/messaging/actions/messageActionRegistry.tsx` (`task_reminder`, `open_link`).
- Reminder cron: `app/api/cron/due-date-reminders/route.ts`, scheduled in `vercel.json` (daily 15:00 UTC, main app only; CRON_SECRET set on Vercel prod — activates on next release).
- DB: `workspace.tasks` (+ lifecycle/provenance/time cols), `workspace.task_user_state`, RPCs `wsp_upsert_system_task` / `wsp_resolve_system_task`, `get_user_full_context` (emits new fields + 90-day closed tasks). aidream models regenerated (aidream commit 0060c9990).
- Test: `/tasks` (smart views sidebar), `/tasks/[id]` (status/start/repeat/provenance/snooze), `/messages` (Matrx System conversation → chips). Login: `admin@admin.com` / `Password1234#`. Review-queue item pending Arman feedback.

## Remaining work

1. **Reminders editor + per-reminder firing.** `workspace.tasks.reminders` jsonb + `TaskReminder` type exist; nothing writes or fires them. Build an editor row in `features/tasks/components/editor/TaskEditorBody.tsx` (beside Start/Repeat) and honor absolute/offset reminders in the cron (currently date-granularity only). `due_time`/`timezone` columns also have no editor yet.
2. **Escalating + acknowledged-quiet reminders.** Cron treats every overdue task the same daily. Use `task_user_state.acknowledged_at` (quiet after ack) and escalate cadence as overdue age grows — Arman's "smart reminders" bullet.
3. **Mobile smart views.** `features/tasks/components/mobile/MobileFilterMenu.tsx` + `QuickTasksSheet.tsx` have no Views section — desktop-only today. Reuse `SMART_VIEWS` registry.
4. **Bulk triage.** No multi-select in `TaskListPane` — bulk complete/snooze/assign/reschedule is a must-have. `TasksTableView` is the natural first surface.
5. **Wire system-task callers.** `upsertSystemTask` has no producers yet. Obvious first consumers: aidream agent tool (expose as tool so agents create user tasks), scraper/podcast failure follow-ups, review-queue items. aidream side: models committed (0060c9990), deploys with next aidream release.
6. **Task dependencies + mentions.** Dependencies: use `platform.associations` (task→task edge, role='blocks') — never a new junction. Comments exist (`platform.comments`); @mentions → DM notification is unbuilt.
7. **D129 defects** (FOUND_DEFECTS.md): `operatingTaskId` single-slot race; snooze expiry needs a minute-tick to resurface; monthly recurrence month-end anchor drifts across successive clamped rolls.
8. **Enhancement backlog** (Arman's list above): NL capture, digests, AI prioritization, extraction from chats/agent results, calendar sync, templates. Each is its own scoped build; NL capture and "extract tasks from agent results" have the highest platform leverage.

## Done

- Lifecycle (inbox/planned/active/completed/cancelled/dismissed) + backfill — `features/tasks/constants/status.ts`.
- Provenance columns + chip + idempotent system-task RPCs — `taskService.ts`, `TaskProvenanceChip.tsx`.
- Time controls: start_date, recurrence with roll-forward at ONE completion chokepoint — `utils/recurrence.ts`.
- Per-user state (snooze/ack/pin) + snooze UI — `taskUserStateService.ts`, `TaskSnoozeButton.tsx`.
- Smart views + org-scoped snooze-aware counts — `constants/smartViews.ts`, sidebar Views section.
- Reminder cron scheduled + hardened (fail-closed secret, satellite dedupe, snooze-aware, per-user cap).
- DM integration: `system-dm.ts` primitive (feedback notifier refactored onto it), actionable `task_reminder` chips (Open/Complete/Snooze verified live), assignment DMs, volume-aware cron digest.
- Adversarial review round: 12 fixes (recurrence math, completion-path unification, count reconciliation, timezone, filter deadlock).

## Decisions needed

- **Situation:** the notification placement is deliberately frontend-side — every delivery channel (Resend email, DM inserts, preference tables) lives in matrx-frontend; aidream has no email/notification infra. The aidream `sch_*` scheduler + `system_task_runner` would be the better firing mechanism once aidream can deliver notifications. **Decide:** nothing now — revisit only when aidream grows a notification service or reminders need sub-daily granularity.
