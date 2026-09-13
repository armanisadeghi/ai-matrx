import {
  createScheduleRosterLoadTimeout,
  SCHEDULE_ROSTER_LOAD_TIMEOUT_MS,
} from "./schedule-roster-timeout";

describe("schedule roster loading timeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("aborts a stalled roster request at the explicit terminal boundary", () => {
    const { controller, dispose } = createScheduleRosterLoadTimeout();

    jest.advanceTimersByTime(SCHEDULE_ROSTER_LOAD_TIMEOUT_MS - 1);
    expect(controller.signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  it("clears the boundary after a completed roster request", () => {
    const { controller, dispose } = createScheduleRosterLoadTimeout();
    dispose();

    jest.advanceTimersByTime(SCHEDULE_ROSTER_LOAD_TIMEOUT_MS);
    expect(controller.signal.aborted).toBe(false);
  });
});
