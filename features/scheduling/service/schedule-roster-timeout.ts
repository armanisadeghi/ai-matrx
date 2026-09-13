export const SCHEDULE_ROSTER_LOAD_TIMEOUT_MS = 20_000;
export const SCHEDULE_ROSTER_LOAD_TIMEOUT_MESSAGE =
  "Your schedules took too long to load. Try again.";

export function createScheduleRosterLoadTimeout(): {
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
