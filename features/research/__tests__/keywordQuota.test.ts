/**
 * Keyword quota gate tests.
 *
 * The caps are real backend gates and must stay enforced — the defect was that
 * they were enforced SILENTLY. These pin the two silent-drop cases:
 *
 *  - past `max_keywords`, the keyword is never researched at all
 *    (aidream research/service.py:1605 `keywords = sorted[:max_keywords]`)
 *  - past `max_keyword_syntheses`, it IS researched but never written up —
 *    the cap is a topic-wide total, not a per-keyword allowance
 *    (aidream research/service.py:1144-1202)
 */

import {
  evaluateKeywordQuota,
  keywordAddWouldExceedQuota,
} from "../keywordQuota";

const topic = (max_keywords: number, max_keyword_syntheses: number) => ({
  max_keywords,
  max_keyword_syntheses,
});

describe("evaluateKeywordQuota", () => {
  it("passes cleanly when both caps have headroom", () => {
    const v = evaluateKeywordQuota(topic(10, 10), 4);
    expect(v.shortfalls).toEqual([]);
    expect(v.patch).toEqual({});
  });

  it("passes when the count exactly equals both caps", () => {
    expect(evaluateKeywordQuota(topic(4, 4), 4).shortfalls).toEqual([]);
  });

  it("flags the keyword cap and proposes exactly the needed raise", () => {
    const v = evaluateKeywordQuota(topic(3, 10), 4);
    const s = v.shortfalls.find((x) => x.key === "max_keywords");
    expect(s).toMatchObject({ current: 3, required: 4 });
    expect(s?.consequence).toContain("1 keyword would never be researched");
    expect(v.patch.max_keywords).toBe(4);
  });

  it("flags the synthesis cap separately — researched but never written up", () => {
    const v = evaluateKeywordQuota(topic(10, 3), 4);
    expect(v.shortfalls.map((s) => s.key)).toEqual(["max_keyword_syntheses"]);
    expect(v.patch).toEqual({ max_keyword_syntheses: 4 });
  });

  it("flags BOTH caps when both are short — the easy one to forget", () => {
    const v = evaluateKeywordQuota(topic(3, 3), 5);
    expect(v.shortfalls.map((s) => s.key)).toEqual([
      "max_keywords",
      "max_keyword_syntheses",
    ]);
    expect(v.patch).toEqual({ max_keywords: 5, max_keyword_syntheses: 5 });
  });

  it("pluralizes the multi-keyword overflow consequence", () => {
    const v = evaluateKeywordQuota(topic(2, 10), 5);
    expect(v.shortfalls[0].consequence).toContain(
      "3 keywords would never be researched",
    );
  });

  it("reports an ALREADY-over-cap topic even with nothing being added", () => {
    // A topic whose caps were lowered after the fact is already broken; the
    // user must see that, not discover it on the next run.
    expect(evaluateKeywordQuota(topic(2, 2), 4).shortfalls).toHaveLength(2);
  });

  it("treats a zero cap as a real block, never as unlimited", () => {
    const v = evaluateKeywordQuota(topic(0, 0), 1);
    expect(v.patch).toEqual({ max_keywords: 1, max_keyword_syntheses: 1 });
  });
});

describe("keywordAddWouldExceedQuota", () => {
  it("is false when the add fits", () => {
    expect(keywordAddWouldExceedQuota(topic(5, 5), 3)).toBe(false);
  });

  it("is true when the add crosses either cap", () => {
    expect(keywordAddWouldExceedQuota(topic(4, 4), 4)).toBe(true);
    expect(keywordAddWouldExceedQuota(topic(9, 4), 4)).toBe(true);
  });

  it("honors a multi-keyword add", () => {
    expect(keywordAddWouldExceedQuota(topic(5, 5), 3, 2)).toBe(false);
    expect(keywordAddWouldExceedQuota(topic(5, 5), 3, 3)).toBe(true);
  });
});
