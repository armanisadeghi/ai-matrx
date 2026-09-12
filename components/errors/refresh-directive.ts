/**
 * The door from the platform directive channel to the EXISTING consent toast.
 *
 * `refresh_required` must never grow a second "new version available" prompt.
 * `NewVersionWatcher` owns that toast, owns its snooze, owns its copy, and
 * owns the one law of this folder — **never reload a live session on the
 * user's behalf**. So a directive does not reload and does not render; it
 * ASKS, through the prompt that already exists.
 *
 * A window event rather than an import, for the same reason
 * `matrx:chunk-load-error` is one: the ubiquitous directive subscriber must
 * reach this prompt with zero import edge into the errors cluster.
 */

/** Dispatched when the platform asks this session to consider refreshing. */
export const REFRESH_REQUIRED_EVENT = "matrx:refresh-required";

export interface RefreshRequiredDetail {
  /** Why — `deploy`, `breaking_change`, or `operator`. */
  reason: string;
  /** Operator copy. Null/absent → the watcher's own default wording. */
  title?: string | null;
  body?: string | null;
}

/** Ask the consent toast to appear. Never reloads anything. */
export function notifyRefreshRequired(detail: RefreshRequiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RefreshRequiredDetail>(REFRESH_REQUIRED_EVENT, { detail }),
  );
}
