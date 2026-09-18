// WHICH POSITION SURVIVES A REBUILD. The two defects this pins:
//   - a band change kept coordinates computed for the previous band's boxes, so
//     focusing a branch (line → card) landed the cards on top of each other;
//   - a dragged node snapped back, because the graph query still says
//     `auto_layout: true` at the old spot after the layout write.

import { reconcilePosition } from "./reconcile";

const AT = { x: 100, y: 200 };
const COMPUTED = { x: 900, y: 40 };

describe("reconcilePosition", () => {
  it("takes the computed position for a topic that was not on screen", () => {
    expect(reconcilePosition({ kept: null, band: "card", computed: COMPUTED, placed: false })).toBe(
      COMPUTED,
    );
    // …and for a placed one too: there is nothing to keep.
    expect(reconcilePosition({ kept: null, band: "card", computed: COMPUTED, placed: true })).toBe(
      COMPUTED,
    );
  });

  it("keeps a live position while the band has not changed — the drag case", () => {
    expect(
      reconcilePosition({
        kept: { position: AT, band: "card" },
        band: "card",
        computed: COMPUTED,
        placed: false,
      }),
    ).toBe(AT);
  });

  it("REPLACES an unplaced topic's position when the band changed", () => {
    // Focus a branch: 60 topics become 12, the band tips line → card, and the
    // coordinates dagre computed for 150×28 boxes describe nothing on screen.
    expect(
      reconcilePosition({
        kept: { position: AT, band: "line" },
        band: "card",
        computed: COMPUTED,
        placed: false,
      }),
    ).toBe(COMPUTED);
    // And back the other way.
    expect(
      reconcilePosition({
        kept: { position: AT, band: "card" },
        band: "line",
        computed: COMPUTED,
        placed: false,
      }),
    ).toBe(COMPUTED);
  });

  it("KEEPS a placed topic's position across a band change", () => {
    // A stored `seo.map_topic.layout`, or a drag this session that the server
    // accepted. A person's arrangement is not geometry the drawing recomputes.
    expect(
      reconcilePosition({
        kept: { position: AT, band: "line" },
        band: "card",
        computed: COMPUTED,
        placed: true,
      }),
    ).toBe(AT);
  });

  it("keeps a placed topic even when the previous band is unknown", () => {
    expect(
      reconcilePosition({
        kept: { position: AT, band: null },
        band: "shape",
        computed: COMPUTED,
        placed: true,
      }),
    ).toBe(AT);
  });

  it("replaces an unplaced topic whose previous band is unknown", () => {
    // Unknowable geometry is not the current geometry — the recomputed position
    // is the only one this drawing can stand behind.
    expect(
      reconcilePosition({
        kept: { position: AT, band: null },
        band: "shape",
        computed: COMPUTED,
        placed: false,
      }),
    ).toBe(COMPUTED);
  });
});
