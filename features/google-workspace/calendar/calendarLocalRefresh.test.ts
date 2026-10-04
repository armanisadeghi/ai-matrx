import { readCalendarLocalRefresh } from "./calendarLocalRefresh";

describe("Calendar saved-copy display boundary", () => {
  it.each([undefined, null])("keeps legacy absence silent", (value) => {
    expect(readCalendarLocalRefresh(value)).toEqual({ state: "absent", message: null, needsAttention: false });
  });
  it.each([
    ["updated", null, false, "Saved copy updated", false],
    ["scrubbed", null, false, "Saved copy cleared", false],
    ["not_saved", null, false, "This event is not saved", false],
    ["detached", null, false, "Saved copy kept separate", false],
    ["pending", "refresh_pending", false, "Saved copy refresh pending", true],
    ["pending", "series_refresh_required", false, "Saved series refresh pending", true],
    ["updated", null, true, "Saved copy updated · refresh pending", true],
    ["scrubbed", null, true, "Saved copy cleared · refresh pending", true],
  ])("renders %s without provider settlement", (status, reason, cache, message, warning) => {
    expect(readCalendarLocalRefresh({ status, reason, cache_refresh_pending: cache })).toEqual({ state: "valid", message, needsAttention: warning });
  });
  it.each([
    [], "updated", { status: {} }, { status: "pending" },
    { status: "updated", reason: "refresh_pending" },
    { status: "not_saved", cache_refresh_pending: true },
    { status: "updated", private_id: "untrusted" },
    { status: "updated", cache_refresh_pending: "false" },
  ])("warns on malformed saved-copy metadata", (value) => {
    expect(readCalendarLocalRefresh(value)).toEqual({ state: "malformed", message: "Saved copy refresh pending", needsAttention: true });
  });
});
