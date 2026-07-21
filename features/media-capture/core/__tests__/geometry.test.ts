import { sourceRect } from "../geometry";

describe("sourceRect", () => {
  describe("full-frame", () => {
    it("is the identity rect regardless of container shape", () => {
      expect(sourceRect(100, 900, 1920, 1080, "full-frame")).toEqual({
        sx: 0,
        sy: 0,
        sWidth: 1920,
        sHeight: 1080,
      });
      expect(sourceRect(4000, 10, 640, 480, "full-frame")).toEqual({
        sx: 0,
        sy: 0,
        sWidth: 640,
        sHeight: 480,
      });
    });
  });

  describe("viewport-crop (object-fit: cover)", () => {
    it("exact-fit: same aspect returns the whole frame", () => {
      expect(sourceRect(960, 540, 1920, 1080, "viewport-crop")).toEqual({
        sx: 0,
        sy: 0,
        sWidth: 1920,
        sHeight: 1080,
      });
    });

    it("video wider than container: crops sides, centered (pillarbox preview case)", () => {
      // Square container, 16:9 video → shows a centered 1080×1080 region.
      const r = sourceRect(500, 500, 1920, 1080, "viewport-crop");
      expect(r.sHeight).toBe(1080);
      expect(r.sWidth).toBeCloseTo(1080, 6);
      expect(r.sy).toBe(0);
      expect(r.sx).toBeCloseTo((1920 - 1080) / 2, 6);
    });

    it("video taller than container: crops top/bottom, centered (letterbox preview case)", () => {
      // Wide 2:1 container, 16:9 video → full width, height = 1920/2 = 960.
      const r = sourceRect(1000, 500, 1920, 1080, "viewport-crop");
      expect(r.sWidth).toBe(1920);
      expect(r.sHeight).toBeCloseTo(960, 6);
      expect(r.sx).toBe(0);
      expect(r.sy).toBeCloseTo((1080 - 960) / 2, 6);
    });

    it("is DPR-independent: scaling the container uniformly leaves the rect unchanged", () => {
      const base = sourceRect(390, 844, 1920, 1080, "viewport-crop");
      for (const dpr of [1.5, 2, 3]) {
        const scaled = sourceRect(390 * dpr, 844 * dpr, 1920, 1080, "viewport-crop");
        expect(scaled.sx).toBeCloseTo(base.sx, 6);
        expect(scaled.sy).toBeCloseTo(base.sy, 6);
        expect(scaled.sWidth).toBeCloseTo(base.sWidth, 6);
        expect(scaled.sHeight).toBeCloseTo(base.sHeight, 6);
      }
    });

    it("results scale linearly with source resolution", () => {
      const small = sourceRect(500, 500, 1280, 720, "viewport-crop");
      const large = sourceRect(500, 500, 2560, 1440, "viewport-crop");
      expect(large.sx).toBeCloseTo(small.sx * 2, 6);
      expect(large.sy).toBeCloseTo(small.sy * 2, 6);
      expect(large.sWidth).toBeCloseTo(small.sWidth * 2, 6);
      expect(large.sHeight).toBeCloseTo(small.sHeight * 2, 6);
    });

    it("rotation/portrait swap: swapping both container and video transposes the rect", () => {
      const landscape = sourceRect(800, 400, 1920, 1080, "viewport-crop");
      const portrait = sourceRect(400, 800, 1080, 1920, "viewport-crop");
      expect(portrait.sWidth).toBeCloseTo(landscape.sHeight, 6);
      expect(portrait.sHeight).toBeCloseTo(landscape.sWidth, 6);
      expect(portrait.sx).toBeCloseTo(landscape.sy, 6);
      expect(portrait.sy).toBeCloseTo(landscape.sx, 6);
    });

    it("portrait video in a landscape container crops vertically", () => {
      const r = sourceRect(1600, 900, 1080, 1920, "viewport-crop");
      expect(r.sWidth).toBe(1080);
      expect(r.sHeight).toBeCloseTo(1080 / (1600 / 900), 6);
      expect(r.sx).toBe(0);
      expect(r.sy).toBeGreaterThan(0);
    });
  });

  describe("degenerate inputs", () => {
    it.each([
      ["containerW", [0, 500, 1920, 1080]],
      ["containerH", [500, 0, 1920, 1080]],
      ["videoW", [500, 500, 0, 1080]],
      ["videoH", [500, 500, 1920, 0]],
    ] as const)("throws a descriptive error when %s is zero", (name, args) => {
      expect(() =>
        sourceRect(args[0], args[1], args[2], args[3], "viewport-crop"),
      ).toThrow(new RegExp(name));
    });

    it("throws on negative and non-finite dimensions", () => {
      expect(() => sourceRect(-5, 500, 1920, 1080, "full-frame")).toThrow(/containerW/);
      expect(() => sourceRect(500, 500, Number.NaN, 1080, "viewport-crop")).toThrow(/videoW/);
      expect(() =>
        sourceRect(500, 500, 1920, Number.POSITIVE_INFINITY, "viewport-crop"),
      ).toThrow(/videoH/);
    });
  });
});
