// One invalidation signal for the performance review lists. A write that changes what a list shows
// (a cycle made, people launched into it, a template saved, a goal changed) announces itself here,
// and every mounted list reloads. Before this, each list reloaded only when ITS OWN dialog said so,
// so a list whose writer lived elsewhere (the New cycle dialog beside the cycles list) stayed stale
// until a reload of the page.
//
// Draft autosaves and per-review actions are NOT here: the review workspace reloads itself after
// those, and a reload in the middle of typing would reset the form.

import { useEffect } from "react";

const listeners = new Set<() => void>();

/** Doors whose success changes what a list shows. Everything else is a read or a self-reloading action. */
export const INVALIDATING_DOORS: ReadonlySet<string> = new Set([
  "hr_review_cycle_create",
  "hr_review_cycle_launch",
  "hr_review_cycle_close",
  "hr_review_template_save",
  "hr_review_template_archive",
  "hr_goal_save",
  "hr_goal_update_progress",
  "hr_goal_archive",
]);

export function notifyReviewsChanged(): void {
  for (const listener of [...listeners]) listener();
}

/** Calls `reload` whenever a list-changing write succeeds anywhere on the page. */
export function useReloadOnReviewsChanged(reload: () => void): void {
  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);
}
