export const SCHEDULE_ROSTER_LOAD_TIMEOUT_MS = 20_000;
export const SCHEDULE_ROSTER_LOAD_TIMEOUT_MESSAGE =
  "Your schedules took too long to load. Try again.";
export const SCHEDULE_DETAIL_LOAD_TIMEOUT_MESSAGE =
  "This schedule took too long to load. Try again.";
export const SCHEDULE_RUNS_LOAD_TIMEOUT_MESSAGE =
  "This schedule's run history took too long to load. Try again.";

export function createScheduleLoadTimeout(): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    SCHEDULE_ROSTER_LOAD_TIMEOUT_MS,
  );
  return {
    controller,
    dispose: () => globalThis.clearTimeout(timeoutId),
  };
}

/** The roster name remains for existing callers; all scheduler reads share it. */
export const createScheduleRosterLoadTimeout = createScheduleLoadTimeout;
