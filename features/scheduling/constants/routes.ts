// features/scheduling/constants/routes.ts
//
// The record route for a scheduled task, in ONE place.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): a scheduled task is a
// `scheduler.sch_task` row and opens at `/schedules/<id>` — it is NOT a
// workspace `task`, whose entity-registry route is `/tasks/<id>`. The two ids
// look identical in a table cell, so the admin surfaces that render `task_id`
// (runs, orphan leases) MUST build their href from here and opt out of the
// generic `<token>_id` guess. A door onto the wrong record is worse than none.

/** Canonical route to one scheduled task's detail page. */
export const scheduleHref = (id: string) => `/schedules/${id}`;

/**
 * The ADMIN seat's route to one scheduled task — the same `ScheduleDetail`
 * component rendered under /administration, so its reads ride the admin lane
 * (`platform_admin_read`). Every admin surface that names a task (runs, orphan
 * leases, tasks, system jobs, attention alarms, SEO operations) links HERE,
 * never to `/schedules/<id>`: that user page carries no lane, so a system job
 * or another person's task answers "We couldn't find this scheduled task"
 * there (P2-STORAGE-ATTACK F1 follow-up, localhost check, 2026-09-26).
 */
export const ADMIN_SCHEDULE_TASKS_HREF = "/administration/automation/scheduling/tasks";
export const adminScheduleHref = (id: string) => `${ADMIN_SCHEDULE_TASKS_HREF}/${id}`;
