import type { CalendarLocalRefreshView } from "./calendarLocalRefresh";

export function CalendarSavedCopyStatus({ view }: { view: CalendarLocalRefreshView }) {
  if (view.message === null) return null;
  return <p role="status" data-calendar-saved-copy className={view.needsAttention ? "text-warning" : "text-muted-foreground"}>{view.message}</p>;
}
