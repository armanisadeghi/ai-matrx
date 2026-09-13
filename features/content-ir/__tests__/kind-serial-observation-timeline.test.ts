/**
 * `serial_observation_timeline` (unfolding-case contract §1).
 *
 * THE WITHHOLDING LAW, at the only place a viewer can be protected by
 * construction: a SEALED (held-out) case's resolution never reaches the
 * rendered value at all. A component that receives the answer in its props has
 * already leaked it to anyone who opens the console, so the bridge drops it —
 * whatever the payload carries, and whatever the caller intends.
 */

import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";

import {
  readUnfoldedTimeline,
  serialObservationTimelineMarkdown,
  serialObservationTimelineServerData,
  SERIAL_OBSERVATION_TIMELINE_KIND,
} from "../kinds/serial-observation-timeline";

const CASE = {
  __kind: SERIAL_OBSERVATION_TIMELINE_KIND,
  title: "Case 14",
  domain: "clinical",
  opening: { facts: ["31 years old", "Fever for two days"] },
  steps: [
    {
      step: 1,
      at: "hour 0",
      newly_known: ["Temperature 39.1"],
      excerpt: "She was febrile at 39.1.",
      action: { kind: "examine", target: "neurological examination", why: "to look for focal signs" },
      not_yet_known: ["What is in the spinal fluid"],
    },
    { step: 2, at: "hour 2", newly_known: ["Turbid spinal fluid"] },
  ],
  resolution: {
    outcome: "Pneumococcal meningitis",
    excerpt: "Cultures grew Streptococcus pneumoniae.",
    step: 2,
  },
};

describe("serial_observation_timeline bridge", () => {
  it("reads the opening, the steps in order and the action", () => {
    const data = readUnfoldedTimeline(CASE)!;
    expect(data.title).toBe("Case 14");
    expect(data.openingFacts).toEqual(["31 years old", "Fever for two days"]);
    expect(data.steps.map((s) => s.step)).toEqual([1, 2]);
    expect(data.steps[0].action).toEqual({
      kind: "examine",
      target: "neurological examination",
      why: "to look for focal signs",
    });
    expect(data.steps[0].notYetKnown).toEqual(["What is in the spinal fluid"]);
    expect(data.resolution?.outcome).toBe("Pneumococcal meningitis");
  });

  it("DROPS the resolution of a sealed case — the viewer never holds the answer", () => {
    const sealed = { ...CASE, sealed: true };
    const data = readUnfoldedTimeline(sealed)!;
    expect(data.sealed).toBe(true);
    expect(data.resolution).toBeNull();
    expect(JSON.stringify(data)).not.toContain("Pneumococcal");
    expect(JSON.stringify(data)).not.toContain("Streptococcus");
  });

  it("keeps the answer out of the markdown of a sealed case too", () => {
    const md = serialObservationTimelineMarkdown({ ...CASE, sealed: true });
    expect(md).toContain("Sealed");
    expect(md).not.toContain("Pneumococcal");
    const open = serialObservationTimelineMarkdown(CASE);
    expect(open).toContain("Pneumococcal meningitis");
  });

  it("routes through the real complete-envelope bridge", () => {
    const envelope = envelopeFromCompleteValue(
      { ...CASE },
      SERIAL_OBSERVATION_TIMELINE_KIND,
    );
    const out = serialObservationTimelineServerData(envelope);
    expect(out?.title).toBe("Case 14");
    expect(out?.steps).toHaveLength(2);
  });

  it("declines a payload that is neither titled nor stepped", () => {
    expect(readUnfoldedTimeline({})).toBeUndefined();
  });
});
