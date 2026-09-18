// The zoom bands are read off the knobs, never assumed.
//
// The second describe block is the one that matters: it drives the SAME
// function with a different knob set and asserts the cut points move with it.
// A test that only ever uses the live defaults cannot tell a knob read from a
// constant that happens to agree with it.

import { bandFor, graphBandLabel, sizeScale, type GraphBandThresholds } from "./bands";

const LIVE_DEFAULTS: GraphBandThresholds = {
  graph_band_card_max: 15,
  graph_band_compact_max: 40,
  graph_band_line_max: 200,
};

const TIGHT: GraphBandThresholds = {
  graph_band_card_max: 5,
  graph_band_compact_max: 10,
  graph_band_line_max: 20,
};

describe("bandFor — the live defaults {15, 40, 200}", () => {
  it("draws cards up to and including the card ceiling", () => {
    expect(bandFor(1, LIVE_DEFAULTS)).toBe("card");
    expect(bandFor(15, LIVE_DEFAULTS)).toBe("card");
  });

  it("tips to compact one topic past the card ceiling", () => {
    expect(bandFor(16, LIVE_DEFAULTS)).toBe("compact");
    expect(bandFor(40, LIVE_DEFAULTS)).toBe("compact");
  });

  it("tips to lines one topic past the compact ceiling", () => {
    expect(bandFor(41, LIVE_DEFAULTS)).toBe("line");
    expect(bandFor(200, LIVE_DEFAULTS)).toBe("line");
  });

  it("tips to shapes past the line ceiling, with no upper bound", () => {
    expect(bandFor(201, LIVE_DEFAULTS)).toBe("shape");
    expect(bandFor(4000, LIVE_DEFAULTS)).toBe("shape");
  });

  it("draws an empty set as cards rather than as shapes", () => {
    // Zero visible topics is the empty state, which never reaches the drawing —
    // but if it does it must not arrive in the densest band.
    expect(bandFor(0, LIVE_DEFAULTS)).toBe("card");
  });
});

describe("bandFor — a different knob set {5, 10, 20}", () => {
  it("moves every cut point with the knobs", () => {
    expect(bandFor(5, TIGHT)).toBe("card");
    expect(bandFor(6, TIGHT)).toBe("compact");
    expect(bandFor(10, TIGHT)).toBe("compact");
    expect(bandFor(11, TIGHT)).toBe("line");
    expect(bandFor(20, TIGHT)).toBe("line");
    expect(bandFor(21, TIGHT)).toBe("shape");
  });

  it("disagrees with the live defaults at the same count", () => {
    // 15 topics: cards on the live defaults, shapes on the tight set. If this
    // ever passes with both the same, the thresholds have been hard-coded.
    expect(bandFor(15, LIVE_DEFAULTS)).toBe("card");
    expect(bandFor(15, TIGHT)).toBe("line");
  });
});

describe("graphBandLabel", () => {
  it("names every band in words a person reads", () => {
    expect(graphBandLabel("card")).toBe("cards");
    expect(graphBandLabel("compact")).toBe("compact rows");
    expect(graphBandLabel("line")).toBe("lines");
    expect(graphBandLabel("shape")).toBe("shapes");
  });
});

describe("sizeScale", () => {
  it("is flat when there is nothing to compare against", () => {
    expect(sizeScale(0, 0)).toBe(1);
    expect(sizeScale(5, 0)).toBe(1);
    expect(sizeScale(0, 40)).toBe(1);
  });

  it("grows with the value and tops out at the largest", () => {
    expect(sizeScale(40, 40)).toBeCloseTo(1.35);
    expect(sizeScale(20, 40)).toBeGreaterThan(1);
    expect(sizeScale(20, 40)).toBeLessThan(1.35);
  });

  it("never grows past the ceiling, even on a value above the max", () => {
    expect(sizeScale(400, 40)).toBeCloseTo(1.35);
  });
});
