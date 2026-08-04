/**
 * Launch-tracking lifecycle — the ONE derivation of a tracked page's stage.
 * The milestone rule: any first impression (even one predating tracking)
 * makes the page "live"; an unreadable stored blob parses to null (callers
 * scream) rather than to a fake default.
 */
import {
  buildLaunchTracking,
  launchLifecycle,
  parseLaunchTracking,
} from "./launch-tracking";

const NOW = new Date("2026-08-04T12:00:00Z");

describe("parseLaunchTracking", () => {
  it("round-trips buildLaunchTracking output", () => {
    const tracking = buildLaunchTracking({
      addedBy: "user-1",
      indexingRequested: true,
      notes: "  launch batch 3  ",
      now: NOW,
    });
    expect(parseLaunchTracking(tracking as never)).toEqual({
      added_at: NOW.toISOString(),
      added_by: "user-1",
      indexing_requested_at: NOW.toISOString(),
      notes: "launch batch 3",
    });
  });

  it("returns null on junk (never a fake default)", () => {
    expect(parseLaunchTracking(null)).toBeNull();
    expect(parseLaunchTracking("tracked" as never)).toBeNull();
    expect(parseLaunchTracking([] as never)).toBeNull();
    expect(parseLaunchTracking({ notes: "x" } as never)).toBeNull();
  });
});

describe("launchLifecycle", () => {
  const tracked = buildLaunchTracking({
    addedBy: "user-1",
    indexingRequested: false,
    now: new Date("2026-07-25T12:00:00Z"),
  });

  it("not_requested until indexing is requested", () => {
    const lifecycle = launchLifecycle(tracked, null, NOW);
    expect(lifecycle.stage).toBe("not_requested");
    expect(lifecycle.daysTracked).toBe(10);
    expect(lifecycle.daysSinceRequest).toBeNull();
    expect(lifecycle.daysLive).toBeNull();
  });

  it("awaiting_first_impression once requested, before any impression", () => {
    const lifecycle = launchLifecycle(
      {
        ...tracked,
        indexing_requested_at: "2026-07-28T12:00:00Z",
      },
      null,
      NOW,
    );
    expect(lifecycle.stage).toBe("awaiting_first_impression");
    expect(lifecycle.daysSinceRequest).toBe(7);
  });

  it("live the moment a first impression exists — even pre-tracking", () => {
    const lifecycle = launchLifecycle(tracked, "2026-07-20", NOW);
    expect(lifecycle.stage).toBe("live");
    expect(lifecycle.firstImpressionDate).toBe("2026-07-20");
    expect(lifecycle.daysLive).toBe(15);
  });
});
