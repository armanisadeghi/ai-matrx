/**
 * THE GUARD for folder-sync L5-2 and L5-3.
 *
 * L5-2: the live page showed a card reading "Silent since 6 days ago" and,
 * inside it, "Files are moving between this folder and the cloud." Both came
 * from real columns; together they were a lie. The exact live row is the first
 * case below (`files.sync_mappings` 10b121a9-…, state='syncing',
 * last_seen_at=2026-09-15T17:57:35.516011Z, read 2026-09-21).
 */

import {
  DEVICE_SILENT_AFTER_MS,
  describeMappingReport,
  describeMappingState,
} from "./honest-states";

const LIVE_LAST_SEEN = "2026-09-15T17:57:35.516011+00:00";
const NOW = new Date("2026-09-21T18:00:00Z").getTime();

describe("a folder row says one thing, in the right tense", () => {
  it("does not assert present-tense movement over a six-day-old observation", () => {
    const report = describeMappingReport({
      state: "syncing",
      stateReason: null,
      lastSeenAt: LIVE_LAST_SEEN,
      now: NOW,
    });
    expect(report.stale).toBe(true);
    expect(report.badge).toBe(
      `Last reported · ${describeMappingState("syncing").title}`,
    );
    expect(report.sentence).toBe(
      `Nothing has been heard from this folder for 6 days. “${describeMappingState("syncing").title}” is the last thing this device reported, not what is happening now.`,
    );
    // The present-tense detail is not ALSO rendered.
    expect(report.sentence).not.toContain(
      describeMappingState("syncing").detail,
    );
    expect(report.tone).toBe("warning");
  });

  it("drops the daemon's own present-tense sentence when it is stale", () => {
    const report = describeMappingReport({
      state: "syncing",
      stateReason: "Uploading 12 files right now.",
      lastSeenAt: LIVE_LAST_SEEN,
      now: NOW,
    });
    expect(report.sentence).not.toContain("right now");
  });

  it("keeps the daemon's sentence and the plain title while the row is fresh", () => {
    const fresh = new Date(NOW - DEVICE_SILENT_AFTER_MS / 2).toISOString();
    const report = describeMappingReport({
      state: "syncing",
      stateReason: "Uploading 12 files.",
      lastSeenAt: fresh,
      now: NOW,
    });
    expect(report.stale).toBe(false);
    expect(report.badge).toBe(describeMappingState("syncing").title);
    expect(report.sentence).toBe("Uploading 12 files.");
  });

  it("treats a row that never reported as stale, without inventing an age", () => {
    const report = describeMappingReport({
      state: "syncing",
      stateReason: null,
      lastSeenAt: null,
      now: NOW,
    });
    expect(report.stale).toBe(true);
    expect(report.sentence).toContain("has never said when it looked");
  });
});
