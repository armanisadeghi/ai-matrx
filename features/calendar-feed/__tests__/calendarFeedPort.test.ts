// The calendar-link port speaks to the four users.calendar_feed_* doors with their own argument names,
// shows a refusal's sentence as written, and the Google address carries the webcal address as ONE
// encoded value. Use case: a manager at Cedar Ridge Veterinary Clinic subscribes to "Visits this month".
import { googleCalendarUrl } from "@ai-matrx/records-ui";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ ...(require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule(), createClient: () => ({ schema: (s: string) => ({ rpc: (fn: string, a?: unknown) => rpc(s, fn, a) }) }) }));

import { CALENDAR_FEED_PORT, calendarFeedUrl } from "../calendarFeedPort";
import { settingsRegistry } from "@/features/settings/registry";
import { recordsUiHostFor } from "@/features/data-tables/records-ui-host/recordsUiHost";

beforeEach(() => rpc.mockReset());

describe("calendar feed port", () => {
  it("calls the users-schema doors by name", async () => {
    rpc.mockResolvedValue({ data: { id: "f1", token: "mxcal_x", expires_at: null }, error: null });
    await CALENDAR_FEED_PORT.create({ organizationId: "o", tableId: "t", viewId: "v", title: "Appointments · Visits", timeZone: "America/Los_Angeles" });
    expect(rpc).toHaveBeenLastCalledWith("users", "calendar_feed_create", {
      p_organization_id: "o", p_table_id: "t", p_view_id: "v", p_title: "Appointments · Visits", p_time_zone: "America/Los_Angeles",
    });
    await CALENDAR_FEED_PORT.rotate("f1");
    expect(rpc).toHaveBeenLastCalledWith("users", "calendar_feed_rotate", { p_id: "f1" });
    await CALENDAR_FEED_PORT.revoke("f1");
    expect(rpc).toHaveBeenLastCalledWith("users", "calendar_feed_revoke", { p_id: "f1" });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await CALENDAR_FEED_PORT.list()).toEqual([]);
    expect(rpc).toHaveBeenLastCalledWith("users", "calendar_feed_list", undefined);
  });

  it("throws the door's own sentence", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "That calendar link is not one of yours." } });
    await expect(CALENDAR_FEED_PORT.rotate("f9")).rejects.toThrow("That calendar link is not one of yours.");
  });

  it("builds the feed address and the Google address from one token", () => {
    const url = calendarFeedUrl("mxcal_ab", "https://app.example");
    expect(url).toBe("https://app.example/api/calendar-feed/mxcal_ab.ics");
    expect(new URL(googleCalendarUrl(url)).searchParams.get("cid")).toBe("webcal://app.example/api/calendar-feed/mxcal_ab.ics");
  });

  it("is bound on the records host and listed in settings", () => {
    expect(recordsUiHostFor({ ports: { organizationId: "o" } as never, merged: false }).calendarFeed).toBe(CALENDAR_FEED_PORT);
    expect(settingsRegistry.find((t) => t.id === "general.calendarLinks")?.label).toBe("Calendar links");
  });
});
