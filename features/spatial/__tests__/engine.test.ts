import {
  cameraFromHash,
  cameraToHash,
  clampZoom,
  fitRect,
  lerpCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from "../engine/camera";
import {
  detailTierForZoom,
  OVERVIEW_ZOOM,
  PACE_MS,
  revealMsForTier,
  shouldCommit,
} from "../engine/lod";

describe("spatial camera", () => {
  const cam = { x: 120, y: -40, z: 0.5 };

  it("round-trips world ↔ screen", () => {
    const s = worldToScreen(cam, 300, 200);
    expect(screenToWorld(cam, s.x, s.y)).toEqual({ x: 300, y: 200 });
  });

  it("keeps the world point under the cursor fixed while zooming", () => {
    const before = screenToWorld(cam, 400, 300);
    const next = zoomAt(cam, 400, 300, 1.7);
    const after = screenToWorld(next, 400, 300);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(next.z).toBe(1.7);
  });

  it("clamps zoom to the supported range", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAt(cam, 0, 0, 999).z).toBe(MAX_ZOOM);
  });

  it("fits a rect centred, capped at maxZ", () => {
    const size = { w: 1000, h: 800 };
    const small = fitRect({ x: 0, y: 0, w: 100, h: 100 }, size, 48, 1);
    expect(small.z).toBe(1);
    const big = { x: 1000, y: 2000, w: 4000, h: 2000 };
    const fit = fitRect(big, size, 50, 1);
    const view = visibleWorldRect(fit, size);
    // the whole rect is visible and centred
    expect(view.x).toBeLessThanOrEqual(big.x);
    expect(view.x + view.w).toBeGreaterThanOrEqual(big.x + big.w);
    expect(view.x + view.w / 2).toBeCloseTo(big.x + big.w / 2, 6);
    expect(view.y + view.h / 2).toBeCloseTo(big.y + big.h / 2, 6);
  });

  it("interpolates a flight that starts and ends exactly on its endpoints", () => {
    const size = { w: 800, h: 600 };
    const a = { x: 0, y: 0, z: 0.1 };
    const b = { x: -500, y: 200, z: 2 };
    const start = lerpCamera(a, b, 0, size);
    const end = lerpCamera(a, b, 1, size);
    expect(start.z).toBeCloseTo(a.z, 9);
    expect(start.x).toBeCloseTo(a.x, 6);
    expect(end.z).toBeCloseTo(b.z, 9);
    expect(end.x).toBeCloseTo(b.x, 6);
    expect(end.y).toBeCloseTo(b.y, 6);
    // log-space: the halfway zoom is the geometric mean
    expect(lerpCamera(a, b, 0.5, size).z).toBeCloseTo(Math.sqrt(0.1 * 2), 9);
  });

  it("round-trips a camera through the URL hash and rejects junk", () => {
    const parsed = cameraFromHash(`#${cameraToHash({ x: -12.4, y: 88.6, z: 0.4567 })}`);
    expect(parsed).toEqual({ x: -12, y: 89, z: 0.457 });
    expect(cameraFromHash("#nothing")).toBeNull();
  });
});

describe("zoom-paced streaming", () => {
  it("maps zoom to detail tiers in order", () => {
    expect(detailTierForZoom(1)).toBe("read");
    expect(detailTierForZoom(0.5)).toBe("glance");
    expect(detailTierForZoom(OVERVIEW_ZOOM - 0.01)).toBe("overview");
  });

  it("commits every frame when readable and never when off-screen", () => {
    expect(
      shouldCommit({ pending: true, tier: "read", lastCommitTier: "read", msSinceLastCommit: 0 }),
    ).toBe(true);
    expect(
      shouldCommit({
        pending: true,
        tier: "offscreen",
        lastCommitTier: "read",
        msSinceLastCommit: 1e9,
      }),
    ).toBe(false);
  });

  it("never commits without new content", () => {
    expect(
      shouldCommit({ pending: false, tier: "read", lastCommitTier: "overview", msSinceLastCommit: 1e9 }),
    ).toBe(false);
  });

  it("batches at glance tier on its interval", () => {
    const base = { pending: true, tier: "glance" as const, lastCommitTier: "glance" as const };
    expect(shouldCommit({ ...base, msSinceLastCommit: PACE_MS.glance - 1 })).toBe(false);
    expect(shouldCommit({ ...base, msSinceLastCommit: PACE_MS.glance })).toBe(true);
  });

  it("catches up immediately when the tile becomes more detailed", () => {
    // Zoomed from overview into glance, or scrolled back on-screen: no waiting.
    expect(
      shouldCommit({ pending: true, tier: "glance", lastCommitTier: "overview", msSinceLastCommit: 1 }),
    ).toBe(true);
    expect(
      shouldCommit({ pending: true, tier: "overview", lastCommitTier: "offscreen", msSinceLastCommit: 1 }),
    ).toBe(true);
  });

  it("lands each batch before the next one arrives", () => {
    expect(revealMsForTier("read")).toBe(0);
    expect(revealMsForTier("offscreen")).toBe(0);
    for (const t of ["glance", "overview"] as const) {
      expect(revealMsForTier(t)).toBeGreaterThan(0);
      expect(revealMsForTier(t)).toBeLessThan(PACE_MS[t]);
    }
  });
});

describe("spatial store culling", () => {
  // The store schedules coarse work on rAF; drive it by hand instead.
  const raf = globalThis.requestAnimationFrame;
  beforeAll(() => {
    globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
  });
  afterAll(() => {
    globalThis.requestAnimationFrame = raf;
  });

  it("marks only tiles near the viewport visible and tracks the tier", async () => {
    const { SpatialStore } = await import("../engine/spatial-store");
    const store = new SpatialStore({ x: 0, y: 0, z: 1 });
    store.setSize({ w: 1000, h: 800 });
    store.registerItem("near", { x: 100, y: 100, w: 300, h: 300 });
    store.registerItem("far", { x: 20_000, y: 0, w: 300, h: 300 });
    const flips: string[] = [];
    store.subscribeVisible("far", () => flips.push("far"));
    store.recomputeCoarse();
    expect(store.isVisible("near")).toBe(true);
    expect(store.isVisible("far")).toBe(false);
    expect(store.getTier()).toBe("read");

    // Pan the far tile into view: exactly one visibility notification.
    store.setCamera({ x: -19_800, y: 0, z: 1 });
    store.recomputeCoarse();
    expect(store.isVisible("far")).toBe(true);
    expect(store.isVisible("near")).toBe(false);
    expect(flips).toEqual(["far"]);

    store.setCamera({ x: 0, y: 0, z: 0.1 });
    store.recomputeCoarse();
    expect(store.getTier()).toBe("overview");
  });
});
