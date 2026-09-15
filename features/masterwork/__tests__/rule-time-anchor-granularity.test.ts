/**
 * W10 (aidream dd86f564d): a rule's time anchor is only as precise as its
 * `time_range.granularity` says. "segment" (a real moment the quote was
 * located inside) reads as "at start–end"; "chunk" (the quote couldn't be
 * located, so the anchor is the whole ingestion chunk) reads as "somewhere
 * in start–end" — never passed off as a moment. A rule from before the
 * field existed (`granularity` absent) falls back to a width heuristic:
 * narrow enough to plausibly be a real moment reads as "at", anything wider
 * reads honestly as "somewhere in".
 *
 * Fixture values (174–210s, "segment") match the live "Train yourself to
 * get comfortable being uncomfortable" rule on rulebook
 * 040a82ef-2978-49ed-989d-9417c7ee1aa3 (platform.rulebook.rules[0]).
 */

import { formatTimeAnchor } from "../components/detail/RulebookDetailPage";

describe("formatTimeAnchor", () => {
  it('renders a "segment" grain as a real moment: "at 2:54–3:30"', () => {
    expect(formatTimeAnchor({ start: 174, end: 210, granularity: "segment" })).toBe("at 2:54–3:30");
  });

  it('renders a "chunk" grain honestly as an approximation: "somewhere in 0:00–34:38"', () => {
    expect(formatTimeAnchor({ start: 0, end: 2078, granularity: "chunk" })).toBe("somewhere in 0:00–34:38");
  });

  it("treats an absent granularity with a narrow range as a real moment", () => {
    expect(formatTimeAnchor({ start: 174, end: 210 })).toBe("at 2:54–3:30");
  });

  it("treats an absent granularity with a wide range as an approximation", () => {
    expect(formatTimeAnchor({ start: 0, end: 2078 })).toBe("somewhere in 0:00–34:38");
  });

  it("renders a start-only range as a moment regardless of grain", () => {
    expect(formatTimeAnchor({ start: 174, end: null, granularity: "chunk" })).toBe("at 2:54");
  });
});
