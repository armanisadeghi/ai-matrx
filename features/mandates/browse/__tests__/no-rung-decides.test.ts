/**
 * An OUTPUT-WARNED floor is NAMED — never "no rung decides" (aidream 1363).
 *
 * History: FIX-R7 made `mnd_list_scoped` return a NULL `resolved_layer` for a
 * mandate whose default holder could not produce the job's output keys, and
 * `layerMeta` learned to say "No rung decides" instead of a blank badge.
 *
 * Validation offers, never blocks (common-docs/policies/validation-offers-
 * never-blocks.md): since aidream 1363 that holder is NEVER dropped. It runs,
 * as chosen, and the list names its rung; `output contract unmet` is now a
 * WARNING on a choice that runs — amber, and its sentence says it runs anyway
 * and what happens when an answer lacks a key. Never "fails", never "no rung".
 *
 * RED on the old tree: the health badge was rose and read "Output contract
 * unmet", and its sentence said the run fails.
 *
 * The NULL branch stays (defensive: a screen is absent or honest, never
 * blank), but it is no longer this health value's story.
 */

import { layerMeta, HEALTH_EXPLANATION, HEALTH_META } from "@/features/mandates/browse/types";

describe("the layer badge, and the output-warned floor", () => {
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

  it("names the output-warned floor's rung — it decides", () => {
    // The row carries `resolved_layer: "system"` and the warning health.
    expect(layerMeta("system").label).toBe("System");
  });

  it("paints the output warning amber, never rose", () => {
    const meta = HEALTH_META["output contract unmet"];
    expect(meta.className).toContain("amber");
    expect(meta.className).not.toContain("rose");
    expect(meta.label).toBe("Output may not fit");
  });

  it("says the chosen agent runs anyway, and what stops — never that the run fails", () => {
    const sentence = HEALTH_EXPLANATION["output contract unmet"] ?? "";
    expect(sentence).toContain("runs anyway");
    expect(sentence).toContain("may not fit");
    expect(sentence).toMatch(/plain error/);
    expect(sentence).toMatch(/output schema/i);
    expect(sentence).not.toMatch(/run fails|fails at run time|no rung decides/i);
  });
});
