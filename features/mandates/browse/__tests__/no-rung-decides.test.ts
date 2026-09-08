/**
 * FIX-R7 — "no rung decides" is an ANSWER, and the screen says it.
 *
 * `public.mnd_list_scoped` now returns a NULL `resolved_layer` for a mandate
 * whose own default holder cannot produce the output the job requires: the run
 * door (`resolve_mandate`) refuses that holder for everybody, so naming its
 * rung was the list contradicting the server on the same screen. Two live rows
 * are in that state today (`research_client.output_slides`,
 * `research_client.output_seo`).
 *
 * RED, at the commit before this one: `layerMeta` had no null branch, so the
 * row rendered a badge with `label: null` — a BLANK badge — plus a console
 * error calling the database's honest answer an "unknown rung". A dead-looking
 * control that says nothing is exactly what the laws forbid; absent or honest,
 * never blank.
 *
 * There is deliberately no snapshot here: the point is the ONE shared reader.
 * Every rung badge on every mandate surface goes through `layerMeta`, so
 * proving it here proves all four call sites (table cell, row, card, and the
 * list shell's `formatValue`).
 */

import { layerMeta, HEALTH_EXPLANATION } from "@/features/mandates/browse/types";

describe("no rung decides", () => {
  it("says so, instead of rendering a blank badge", () => {
    for (const empty of [null, undefined, ""]) {
      const meta = layerMeta(empty as string | null);
      expect(meta.label).toBe("No rung decides");
      expect(meta.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not call the honest NULL an unknown rung", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      layerMeta(null);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("still screams about a rung the database invented", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(layerMeta("tenant").label).toBe("tenant");
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps the four real rungs named", () => {
    for (const rung of ["system", "global", "org", "user"]) {
      expect(layerMeta(rung).label).not.toBe("No rung decides");
    }
  });

  it("pairs the blank layer with a health sentence that carries a remedy", () => {
    // The layer badge says there is no answer; the health badge beside it has
    // to say WHY and what to do, or the row is a dead end.
    const sentence = HEALTH_EXPLANATION["output contract unmet"];
    expect(sentence).toBeTruthy();
    expect(sentence).toMatch(/output schema/i);
  });
});
