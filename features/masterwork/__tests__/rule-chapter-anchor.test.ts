/**
 * B4c (aidream `b90f3f1b8d`, `services/distillation/distill.py::chapter_for_time`):
 * a rule distilled from an audiobook or podcast carries the container's OWN
 * chapter division at the moment it was said — `source_ref.chapter`. The
 * Rulebook screen renders it beside the SAME time anchor every other
 * recording rule already shows, never a second provenance line: "Chapter 4 ·
 * at 48:00" rather than a bare "at 2,880.5 s".
 *
 * `formatChapterLabel` prefers the container's own title when it declared
 * one, falls back to "Chapter <index>" (1-based, per
 * `services/audio/speech.py::TranscriptionChapter`), and — per-row safe —
 * renders nothing for a chapter object that (jsonb makes no promises) came
 * back with neither, rather than a bare "Chapter".
 */

import { formatChapterLabel } from "../components/detail/RulebookDetailPage";

describe("formatChapterLabel", () => {
  it('renders an untitled chapter as "Chapter <index>"', () => {
    expect(formatChapterLabel({ index: 4, title: null, start: 2820, end: 3120 })).toBe("Chapter 4");
  });

  it("prefers the container's own title over the index", () => {
    expect(
      formatChapterLabel({ index: 4, title: "Lithium Batteries", start: 2820, end: 3120 }),
    ).toBe("Lithium Batteries");
  });

  it("renders nothing for a chapter with neither a title nor an index", () => {
    expect(formatChapterLabel({ index: null, title: null, start: 2820, end: 3120 })).toBeNull();
  });
});
