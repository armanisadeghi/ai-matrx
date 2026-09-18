/**
 * 🚨 F-66 — THE OPEN CONTROL ON A CALENDAR EVENT NAMES GOOGLE CALENDAR,
 * EXPLICITLY, IN EVERY STATE THE HEALTH OVERRIDE CAN PRODUCE.
 *
 * Unlike the Doc registration (which answers for a whole family of products
 * and must pick between Docs/Sheets/Drive by the row's own kind), a Calendar
 * event opens in exactly one place — so this registration states the label
 * once rather than leaving it to `DetailBody`'s generic derivation, which
 * would happen to land on the same words for this source but only by
 * coincidence of `source` being short. `calendarEventHealthOverride` is the
 * one place that decides, and is proven here for its three branches: no
 * generic producer answered, a detached (kept-as-data) event, and an
 * available event with a generic producer.
 */

import { calendarEventHealthOverride } from "../record";
import { calendarEventRow } from "./fixtures";
import type { DetailSourceHealth } from "@/lib/detail/types";

describe("the open-at-source control on a calendar event", () => {
  it("names Google Calendar when no generic producer could answer", () => {
    const row = calendarEventRow({ sync_status: "available" });
    const health = calendarEventHealthOverride(row, null);
    expect(health.openAtSourceLabel).toBe("Open in Google Calendar");
  });

  it("names Google Calendar for a detached (kept-as-data) event", () => {
    const row = calendarEventRow({ sync_status: "detached" });
    const health = calendarEventHealthOverride(row, null);
    expect(health.openAtSourceLabel).toBe("Open in Google Calendar");
  });

  it("names Google Calendar for an unavailable event, alongside the generic producer's other fields", () => {
    const row = calendarEventRow({
      sync_status: "unavailable",
      sync_status_reason: "Google Calendar says this event no longer exists.",
    });
    const produced: DetailSourceHealth = { source: "Google Calendar", grant: "ok" };
    const health = calendarEventHealthOverride(row, produced);
    expect(health.openAtSourceLabel).toBe("Open in Google Calendar");
  });

  it("names Google Calendar for an available event with a generic producer", () => {
    const row = calendarEventRow({ sync_status: "available" });
    const produced: DetailSourceHealth = { source: "Google Calendar", grant: "ok" };
    const health = calendarEventHealthOverride(row, produced);
    expect(health.openAtSourceLabel).toBe("Open in Google Calendar");
  });
});
