/**
 * 🚨 PLAN §1 (Docs) + §4.1 — OUR CHAMPION EDGE IS THAT THE PREVIEW IS THE TRUTH.
 *
 * "Nobody shows the append before it lands. 'This exact block will be appended
 * to Q3 Plan, at the end, under a dated heading — Append / Edit / Cancel.'"
 *
 * That claim is only honest if the string on screen and the string in the request
 * are the same bytes, so this suite pins the composer: the heading, the knob's
 * two values, the trailing newline, and the refusal to compose a block out of
 * nothing (which would write a bare dated heading into someone's document).
 */

import {
  appendPromiseSentence,
  composeAppendBlock,
  datedHeading,
  isAppendHeadingMode,
} from "../appendBlock";

const NOW = new Date("2026-09-18T15:04:05Z");

describe("the append block", () => {
  it("stamps the dated heading, then a blank line, then the text", () => {
    const block = composeAppendBlock({ text: "We agreed to ship Friday.", heading: "dated", now: NOW });
    expect(block).toBe(`${datedHeading(NOW)}\n\nWe agreed to ship Friday.\n`);
  });

  it("names AI Matrx and a date a person reads, never an ISO stamp", () => {
    const heading = datedHeading(NOW);
    expect(heading).toContain("AI Matrx");
    expect(heading).not.toContain("2026-09-18T");
    expect(heading).toMatch(/2026/);
  });

  it("adds nothing but the text when the knob says none", () => {
    expect(composeAppendBlock({ text: "Just this.", heading: "none", now: NOW })).toBe("Just this.\n");
  });

  it("ends with exactly one newline so the next append cannot run onto this one", () => {
    const block = composeAppendBlock({ text: "Line one\nLine two\n\n\n", heading: "none", now: NOW });
    expect(block).toBe("Line one\nLine two\n");
  });

  it("has NO block for an empty composer — a bare heading is never written", () => {
    for (const text of ["", "   ", "\n\n", "\t"]) {
      expect(composeAppendBlock({ text, heading: "dated", now: NOW })).toBeNull();
    }
  });

  it("promises the document by name and says where the block lands", () => {
    const sentence = appendPromiseSentence({ title: "Q3 Plan", heading: "dated" });
    expect(sentence).toContain("Q3 Plan");
    expect(sentence).toContain("end");
    expect(sentence).toContain("dated heading");
    expect(appendPromiseSentence({ title: "Q3 Plan", heading: "none" })).toContain(
      "no heading added",
    );
  });

  it("accepts only the knob's two words", () => {
    expect(isAppendHeadingMode("dated")).toBe(true);
    expect(isAppendHeadingMode("none")).toBe(true);
    for (const bad of ["Dated", "timestamp", "", null, undefined, 1, {}]) {
      expect(isAppendHeadingMode(bad)).toBe(false);
    }
  });
});
