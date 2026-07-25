/**
 * KEYWORD QUOTA GATE — the caps are real, so the user must be told.
 *
 * `rs_topic.max_keywords` and `max_keyword_syntheses` are hard gates in the
 * aidream orchestrator, and they exist for a reason: account tiers will bound
 * how much research a topic may consume. The defect was never that the caps
 * exist — it is that they were enforced SILENTLY. A keyword added past
 * `max_keywords` is dropped by `keywords = sorted[:max_keywords]`
 * (research/service.py:1605) and never runs, forever, with no signal anywhere
 * in the product. `max_keyword_syntheses` is worse: it is a topic-wide TOTAL,
 * so a keyword can be searched, scraped, and analyzed and still never get a
 * synthesis because an earlier keyword consumed the last slot.
 *
 * This module is the pure decision layer: given the current topic and how many
 * keywords are about to exist, what will the pipeline silently refuse to do,
 * and what caps would have to rise to fix it? The UI raises those caps with the
 * user's explicit consent — it never raises them behind their back, and never
 * lets the add proceed unexplained.
 */

import type { ResearchTopic } from "./types";

export interface QuotaShortfall {
  /** Cap key on `rs_topic`. */
  key: "max_keywords" | "max_keyword_syntheses";
  label: string;
  current: number;
  /** The value the cap must reach for the requested keywords to run fully. */
  required: number;
  /** Plain-language consequence of leaving the cap where it is. */
  consequence: string;
}

export interface QuotaVerdict {
  /** Caps that would silently block work. Empty ⇒ the add runs end to end. */
  shortfalls: QuotaShortfall[];
  /** The patch that clears every shortfall. Empty when there are none. */
  patch: Partial<Record<QuotaShortfall["key"], number>>;
}

/**
 * Evaluate the quota consequences of a topic having `nextKeywordCount`
 * keywords.
 *
 * Both caps are checked against the keyword count, not against "how many are
 * being added" — the pipeline's own gates are absolute totals, so a topic that
 * is ALREADY over a cap must surface that even when the user adds nothing.
 */
export function evaluateKeywordQuota(
  topic: Pick<ResearchTopic, "max_keywords" | "max_keyword_syntheses">,
  nextKeywordCount: number,
): QuotaVerdict {
  const shortfalls: QuotaShortfall[] = [];
  const patch: QuotaVerdict["patch"] = {};

  // Both caps are NOT NULL in the DB (default 3), so the generated type is
  // `number` and there is no nullable case to defend against.
  const maxKeywords = topic.max_keywords;
  if (nextKeywordCount > maxKeywords) {
    shortfalls.push({
      key: "max_keywords",
      label: "Keyword limit",
      current: maxKeywords,
      required: nextKeywordCount,
      consequence:
        nextKeywordCount - maxKeywords === 1
          ? "1 keyword would never be researched — the pipeline stops at the limit."
          : `${nextKeywordCount - maxKeywords} keywords would never be researched — the pipeline stops at the limit.`,
    });
    patch.max_keywords = nextKeywordCount;
  }

  // The synthesis cap is the one that bites AFTER a successful run: search,
  // scrape, and analysis all complete, then the keyword silently gets no
  // write-up. It has to be raised at the same moment, not discovered later.
  const maxSyntheses = topic.max_keyword_syntheses;
  if (nextKeywordCount > maxSyntheses) {
    shortfalls.push({
      key: "max_keyword_syntheses",
      label: "Keyword synthesis limit",
      current: maxSyntheses,
      required: nextKeywordCount,
      consequence:
        "Some keywords would be researched but never written up — the limit is a total across the topic, not per keyword.",
    });
    patch.max_keyword_syntheses = nextKeywordCount;
  }

  return { shortfalls, patch };
}

/** Would adding `count` keywords hit a cap? Convenience for call sites. */
export function keywordAddWouldExceedQuota(
  topic: Pick<ResearchTopic, "max_keywords" | "max_keyword_syntheses">,
  currentKeywordCount: number,
  count = 1,
): boolean {
  return (
    evaluateKeywordQuota(topic, currentKeywordCount + count).shortfalls.length >
    0
  );
}
