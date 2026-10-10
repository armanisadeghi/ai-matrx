// features/employee-performance-reviews/standard/calendarEvents.ts
//
// "Add to calendar" events for the due dates THIS caller owns on a review: the employee's self review,
// the manager's review, and the manager's share. Built for lib/calendar/eventLinks.ts.

import type { CalendarEvent } from "@/lib/calendar/eventLinks";

import type { ReviewSummary } from "./types";

const at9 = (day: string) => new Date(`${day}T09:00:00`);

export function reviewDueEvents(r: ReviewSummary, url?: string): Array<{ key: string; label: string; event: CalendarEvent }> {
  if (r.cycleStatus !== "open" || r.status === "cancelled" || r.status === "acknowledged") return [];
  const mk = (key: string, label: string, title: string, day: string | null) => {
    if (!day) return [];
    const start = at9(day);
    if (Number.isNaN(start.getTime())) return [];
    const end = new Date(start.getTime() + 30 * 60_000);
    return [
      {
        key,
        label,
        event: {
          uid: `performance-review-${r.reviewId}-${key}@aimatrx`,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          description: `${r.cycleName}: ${r.employeeName}`,
          url,
          alarmMinutesBefore: 24 * 60,
        } satisfies CalendarEvent,
      },
    ];
  };
  return [
    ...(r.can.save_self ? mk("self", "Self review due", `Self review due: ${r.cycleName}`, r.selfDueOn) : []),
    ...(r.can.save_manager ? mk("manager", `Review of ${r.employeeName} due`, `Manager review due: ${r.employeeName}, ${r.cycleName}`, r.managerDueOn) : []),
    ...(r.can.share || (r.can.set_overall && r.status === "both_submitted") ? mk("share", "Share by", `Share review with ${r.employeeName}`, r.shareDueOn) : []),
  ];
}
