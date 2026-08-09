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
