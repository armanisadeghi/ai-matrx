/**
 * 🚨 F-52 — A DETACHED CALENDAR EVENT IS A CHOICE, NOT AN OUTAGE, AND NEVER A
 * REASON TO SPEND ANOTHER GOOGLE CALL.
 *
 * Two pure functions, no React and no network, mirroring the law B-29 already
 * proved for `documents/`:
 *
 *  1. `calendarEventHealthOverride` — the health strip states the choice with
 *     `grant: "ok"` and offers NEITHER Refresh nor Reconnect on a detached
 *     event, because a refresh would be refused by the server with a 409 and a
 *     reconnect repairs nothing.
 *  2. `agendaIsStaleForOpen` — a detached event's frozen `synced_at` never
 *     counts as evidence the agenda window needs a refresh.
 *
 * Every test here was run against the code with the behaviour it names
 * removed, and every one of them failed first.
 */

import {
  agendaIsStaleForOpen,
  calendarEventHealthOverride,
} from "../record";
import { calendarEventRow } from "./fixtures";
import type { DetailSourceHealth } from "@/lib/detail/types";

describe("calendarEventHealthOverride", () => {
  it("states the choice with grant ok and offers no Refresh, no Reconnect, for a detached event", () => {
    const row = calendarEventRow({
      sync_status: "detached",
      sync_status_reason:
        "Kept as AI Matrx data on 2026-09-18: this event no longer refreshes from Google Calendar.",
      synced_at: "2020-01-01T00:00:00Z",
    });
    const produced: DetailSourceHealth = {
      source: "Google Calendar",
      grant: "blocked",
      grantDetail: "irrelevant — the row's own choice wins",
      onRefresh: () => {},
      onReconnect: () => {},
    };

    const health = calendarEventHealthOverride(row, produced);

    expect(health.grant).toBe("ok");
    expect(health.grantDetail).toContain("no longer refreshes from Google Calendar");
    // 🚨 THE PART THAT MATTERS: neither control survives the override, no
    // matter what the generic connector-health producer supplied.
    expect(health.onRefresh).toBeNull();
    expect(health.onReconnect).toBeNull();
    expect(health.lastRefreshedAt).toBe(row.synced_at);
  });

  it("falls back to an honest default sentence when nothing else names one", () => {
    const row = calendarEventRow({ sync_status: "detached", sync_status_reason: null });
    const health = calendarEventHealthOverride(row, null);
    expect(health.grant).toBe("ok");
    expect(health.grantDetail).toContain("no longer refreshes from Google Calendar");
    expect(health.onRefresh).toBeNull();
    expect(health.onReconnect).toBeNull();
  });

  it("names THIS event's own outage, not only the account's, for an unavailable event", () => {
    const row = calendarEventRow({
      sync_status: "unavailable",
      sync_status_reason: "Google Calendar says this event no longer exists.",
    });
    const produced: DetailSourceHealth = { source: "Google Calendar", grant: "ok" };

    const health = calendarEventHealthOverride(row, produced);

    // `revoked`/`ok` would send the person to reconnect something a reconnect
    // cannot repair — the grant is not the problem, this event is.
    expect(health.grant).toBe("unknown");
    expect(health.grantDetail).toContain("no longer exists");
  });

  it("passes an available event's health through, adding only the open-control label (F-66)", () => {
    const row = calendarEventRow({ sync_status: "available" });
    const produced: DetailSourceHealth = { source: "Google Calendar", grant: "ok" };
    expect(calendarEventHealthOverride(row, produced)).toEqual({
      ...produced,
      openAtSourceLabel: "Open in Google Calendar",
    });
  });
});

describe("agendaIsStaleForOpen", () => {
  const now = new Date("2026-09-18T15:00:00Z");
  const MIN_AGE = 300;

  it("never treats a detached event's frozen synced_at as a reason to refresh", () => {
    const onlyDetached = [
      calendarEventRow({
        sync_status: "detached",
        // Ancient — an `available` event this stale would trigger a refresh.
        synced_at: "2020-01-01T00:00:00Z",
      }),
    ];
    expect(agendaIsStaleForOpen(onlyDetached, MIN_AGE, now)).toBe(false);
  });

  it("still asks for a refresh when a non-detached event in the same window is stale (positive control)", () => {
    const mixed = [
      calendarEventRow({
        id: "bbbbbbbb-1111-2222-3333-444444444444",
        sync_status: "detached",
        synced_at: "2020-01-01T00:00:00Z",
      }),
      calendarEventRow({
        id: "cccccccc-2222-3333-4444-555555555555",
        sync_status: "available",
        synced_at: "2020-01-01T00:00:00Z",
      }),
    ];
    expect(agendaIsStaleForOpen(mixed, MIN_AGE, now)).toBe(true);
  });

  it("is not stale when the non-detached events in the window were refreshed recently", () => {
    const mixed = [
      calendarEventRow({
        id: "bbbbbbbb-1111-2222-3333-444444444444",
        sync_status: "detached",
        synced_at: "2020-01-01T00:00:00Z",
      }),
      calendarEventRow({
        id: "cccccccc-2222-3333-4444-555555555555",
        sync_status: "available",
        synced_at: "2026-09-18T14:58:00Z",
      }),
    ];
    expect(agendaIsStaleForOpen(mixed, MIN_AGE, now)).toBe(false);
  });

  it("treats an empty window as never refreshed (unchanged first-load behaviour)", () => {
    expect(agendaIsStaleForOpen([], MIN_AGE, now)).toBe(true);
  });
});
