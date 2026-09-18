/**
 * 🚨 PLAN §4.1 — "refresh is a server call invoked on open when older than
 * `google.refresh.on_open_min_age_seconds` (default 300) and on demand."
 *
 * The rule is a boundary, and both sides of it cost something real: below it we
 * spend a Google call every time a person arrows through a list; above it we show
 * a stale document. So the boundary itself is pinned here, including the record
 * that has NEVER been refreshed — the case where the body is empty and an
 * "it is fresh enough" answer would leave a blank panel forever.
 */

import {
  DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS,
  isStaleForOpen,
  refreshedPhrase,
  secondsSinceRefresh,
  syncStatusOf,
} from "../record";
import { appendHeadingFrom, refreshSecondsFrom } from "../knobs";
import type { GoogleDocumentRow } from "../types";

const NOW = new Date("2026-09-18T15:00:00Z");
const iso = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();

describe("refresh on open", () => {
  it("is 300 seconds until an administrator's row says otherwise", () => {
    expect(DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS).toBe(300);
  });

  it("does NOT refresh a record younger than the floor", () => {
    expect(isStaleForOpen(iso(1), 300, NOW)).toBe(false);
    expect(isStaleForOpen(iso(299), 300, NOW)).toBe(false);
  });

  it("refreshes at the floor and beyond", () => {
    expect(isStaleForOpen(iso(300), 300, NOW)).toBe(true);
    expect(isStaleForOpen(iso(3600), 300, NOW)).toBe(true);
  });

  it("refreshes a record that has never been refreshed — its body is empty", () => {
    expect(isStaleForOpen(null, 300, NOW)).toBe(true);
    expect(secondsSinceRefresh(null, NOW)).toBeNull();
  });

  it("honours an organization that raised the floor", () => {
    expect(isStaleForOpen(iso(600), 3600, NOW)).toBe(false);
    expect(isStaleForOpen(iso(3601), 3600, NOW)).toBe(true);
  });

  it("treats an unreadable stamp as never refreshed rather than as fresh", () => {
    expect(isStaleForOpen("not a date", 300, NOW)).toBe(true);
    expect(refreshedPhrase("not a date", NOW)).toBe("Never refreshed from Google");
  });

  it("says the freshness in the person's words", () => {
    expect(refreshedPhrase(iso(30), NOW)).toBe("Refreshed less than a minute ago from Google");
    expect(refreshedPhrase(iso(60), NOW)).toBe("Refreshed 1 minute ago from Google");
    expect(refreshedPhrase(iso(240), NOW)).toBe("Refreshed 4 minutes ago from Google");
    expect(refreshedPhrase(iso(7200), NOW)).toBe("Refreshed 2 hours ago from Google");
    expect(refreshedPhrase(iso(172_800), NOW)).toBe("Refreshed 2 days ago from Google");
    expect(refreshedPhrase(null, NOW)).toBe("Never refreshed from Google");
  });
});

describe("the knob values", () => {
  it("falls back to the documented default for anything that is not a usable value", () => {
    for (const bad of [undefined, null, "soon", -1, {}, NaN]) {
      expect(refreshSecondsFrom(bad)).toBe(DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS);
    }
    expect(refreshSecondsFrom(60)).toBe(60);
    expect(refreshSecondsFrom("900")).toBe(900);
  });

  it("falls back to the dated heading, never to an invented mode", () => {
    for (const bad of [undefined, null, "DATED", "", 1]) {
      expect(appendHeadingFrom(bad)).toBe("dated");
    }
    expect(appendHeadingFrom("none")).toBe("none");
  });
});

describe("the row's own status word", () => {
  const row = { sync_status: "available" } as unknown as GoogleDocumentRow;
  it("reads the two words the CHECK constraint allows", () => {
    expect(syncStatusOf(row)).toBe("available");
    expect(syncStatusOf({ sync_status: "unavailable" } as unknown as GoogleDocumentRow)).toBe(
      "unavailable",
    );
  });
  it("never calls an unknown word available", () => {
    expect(syncStatusOf({ sync_status: "pending" } as unknown as GoogleDocumentRow)).toBe("unknown");
  });
});
