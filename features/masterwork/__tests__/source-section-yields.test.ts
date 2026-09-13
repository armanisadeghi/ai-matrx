/**
 * A thin part of a source must be VISIBLE on the Sources panel (W42).
 *
 * The incident, with the real numbers: Watson's *Psychological Care of Infant
 * and Child* went into a Rulebook as six equal chunks and gave 116 rules —
 * 15/21/16/23/19/22, flat whatever the chunk held. Chapter five (6,716 words,
 * the most prescriptive chapter and the one a parent's bedtime question lands
 * on) contributed THREE. Pasted alone it gave 89. No screen could show that.
 *
 * `sourceSectionYields` is what the panel reads: per-part counts taken off the
 * LIVE rules (so a source distilled weeks ago is just as legible), with the
 * thin verdict made against the SOURCE'S OWN median — the same rule the server
 * applies when it decides to re-read a part.
 *
 * Proven red by returning `thin: false` unconditionally (chapter five stops
 * being flagged) and by dropping the `section_index` filter (a Rulebook whose
 * rules carry no parts starts inventing one).
 */

import {
  entitySourceKey,
  sourceSectionYields,
  urlSourceKey,
} from "../sourceSections";
import type { RulebookRule } from "../types";

const BOOK = urlSourceKey(
  "https://archive.org/download/dli.ernet.7917/7917-Psychological%20Care%20Of%20Infant%20And%20Child_djvu.txt",
);

/** The book's chapters, with the yields the incident actually produced. */
const CHAPTERS: [number, string, number, number][] = [
  [1, "CHAPTER ONE — HOW THE BEHAVIOURIST STUDIES INFANTS", 3049, 21],
  [2, "CHAPTER TWO — THE FEARS OF CHILDREN", 5156, 33],
  [3, "CHAPTER THREE — THE DANGERS OF TOO MUCH MOTHER LOVE", 3330, 22],
  [4, "CHAPTER FOUR — RAGE AND TEMPER TANTRUMS", 4429, 28],
  [5, "CHAPTER FIVE — NIGHT- AND DAY-TIME CARE OF THE CHILD", 6716, 3],
  [6, "CHAPTER SIX — WHAT SHALL I TELL MY CHILD ABOUT SEX?", 5562, 9],
];

function rulesFromTheBook(): RulebookRule[] {
  const rules: RulebookRule[] = [];
  for (const [index, label, words, count] of CHAPTERS) {
    for (let n = 0; n < count; n += 1) {
      rules.push({
        id: `c${index}-r${n}`,
        name: `Rule ${index}.${n}`,
        section: "G",
        statement: "Do the thing.",
        severity: "major",
        source_ref: {
          source: BOOK,
          section_index: index,
          section_label: label,
          section_words: words,
          section_rules: count,
        },
      } as RulebookRule);
    }
  }
  return rules;
}

describe("sourceSectionYields", () => {
  it("names every part of the source and what it produced", () => {
    const rows = sourceSectionYields(rulesFromTheBook(), BOOK);
    expect(rows.map((row) => row.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.map((row) => row.rules)).toEqual([21, 33, 22, 28, 3, 9]);
    expect(rows[4].label).toContain("NIGHT- AND DAY-TIME CARE");
    expect(rows[4].words).toBe(6716);
  });

  it("flags the chapter that went thin, and only that one", () => {
    const rows = sourceSectionYields(rulesFromTheBook(), BOOK);
    expect(rows.filter((row) => row.thin).map((row) => row.index)).toEqual([
      5, 6,
    ]);
    // Chapter five is the incident: the longest chapter in the book with the
    // fewest rules in it.
    const five = rows.find((row) => row.index === 5)!;
    expect(five.per1k).toBeLessThan(1);
    expect(five.words).toBe(Math.max(...rows.map((row) => row.words)));
  });

  it("says nothing about a source with no parts", () => {
    const flat: RulebookRule[] = [
      {
        id: "r1",
        name: "Rule",
        section: "G",
        statement: "Do the thing.",
        severity: "major",
        source_ref: { source: BOOK, chunk: 1 },
      } as RulebookRule,
    ];
    expect(sourceSectionYields(flat, BOOK)).toEqual([]);
    expect(sourceSectionYields(rulesFromTheBook(), "")).toEqual([]);
    // Another source's rules are never counted into this one.
    expect(sourceSectionYields(rulesFromTheBook(), urlSourceKey("https://x.dev/a"))).toEqual(
      [],
    );
  });

  it("speaks the server's source identities", () => {
    expect(urlSourceKey("HTTPS://Example.com/a/")).toBe("url:https://example.com/a");
    // Byte-for-byte what aidream's `url_source_key` returns for the same
    // input — verified against it 2026-09-12; a drift here silently detaches
    // every rule from the source row it came from.
    expect(urlSourceKey("https://example.com/")).toBe("url:https://example.com");
    expect(urlSourceKey("https://x.dev/a?page=2")).toBe("url:https://x.dev/a?page=2");
    expect(entitySourceKey("note", "abc")).toBe("entity:note:abc");
    // An uploaded file is one source whichever door it arrived through.
    expect(entitySourceKey("file", "abc")).toBe("file:abc");
  });
});
