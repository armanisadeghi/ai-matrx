import {
  STALL_REPORT_COOLDOWN_MS,
  createStallDetector,
  summarizeStall,
} from "./mainThreadStallMonitor";

describe("main-thread stall detector", () => {
  it("stays quiet for ordinary long frames", () => {
    const detect = createStallDetector();
    for (let t = 0; t < 10_000; t += 1_000) {
      expect(detect({ startTime: t, duration: 120, blockingDuration: 70 })).toBeNull();
    }
  });

  it("reports one frame that froze the page, naming the scripts that held it", () => {
    const detect = createStallDetector();
    const report = detect({
      startTime: 5_000,
      duration: 2_600,
      blockingDuration: 2_550,
      scripts: [
        { duration: 1_900, sourceURL: "https://x/_next/static/chunks/board.js?v=1", sourceFunctionName: "renderTile", forcedStyleAndLayoutDuration: 300 },
        { duration: 200, sourceURL: "https://x/_next/static/chunks/idb.js", sourceFunctionName: "put" },
      ],
    });
    expect(report).not.toBeNull();
    expect(report!.blockedMs).toBe(2_550);
    expect(report!.culprits[0]).toBe("renderTile @ board.js (1900ms)");
    expect(report!.forcedLayoutMs).toBe(300);
  });

  it("reports a stream of shorter freezes that together lock the page up", () => {
    const detect = createStallDetector();
    const reports = [];
    // ~700ms blocked every 1.2s — each frame alone is under the single-frame bar.
    for (let i = 0; i < 8; i += 1) {
      reports.push(detect({ startTime: i * 1_200, duration: 720, blockingDuration: 700 }));
    }
    const fired = reports.filter(Boolean);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.blockedMs).toBeGreaterThanOrEqual(4_000);
  });

  it("does not re-report inside the cooldown, and does after it", () => {
    const detect = createStallDetector();
    expect(detect({ startTime: 0, duration: 3_000 })).not.toBeNull();
    expect(detect({ startTime: 5_000, duration: 3_000 })).toBeNull();
    expect(detect({ startTime: 3_000 + STALL_REPORT_COOLDOWN_MS, duration: 3_000 })).not.toBeNull();
  });

  it("says plainly when nothing was attributable", () => {
    expect(summarizeStall([{ startTime: 0, duration: 2_500 }]).culprits).toEqual([]);
  });
});
