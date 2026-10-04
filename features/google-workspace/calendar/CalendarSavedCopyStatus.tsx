import type { CalendarLocalRefreshView } from "./calendarLocalRefresh";

export function CalendarSavedCopyStatus({ view }: { view: CalendarLocalRefreshView }) {
  if (view.message === null) return null;
  return <p role="status" data-calendar-saved-copy className={view.needsAttention ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>{view.message}</p>;
}
