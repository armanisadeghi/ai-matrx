/**
 * The CODE pipe of `suggest → writeback` (Growth Loop gap `G-FINDING-FIX`):
 * turn one SEO finding into a DRAFTED fix with no model call at all.
 *
 * THE BAR (common-docs/systems/growth-loop/FEATURE.md, THE THREE PIPES): the
 * code pipe must be deterministic, unattended, and free per run. So this
 * module only claims a finding when the fix is genuinely derivable from
 * evidence the crawler already stored — never a guess dressed up as a fix:
 *
 *   - a missing title, when the page HAS an H1 (or a social title) that says
 *     what the page is;
 *   - an over-long title or description, which is a trimming problem and
 *     nothing else;
 *   - a missing meta description, when the page already publishes a social
 *     (Open Graph / Twitter) description — extremely common, and the honest
 *     deterministic answer is "you already wrote it, it just isn't in the
 *     tag search engines read".
 *
 * Everything else — a title that is too SHORT, thin content, alt text, an
 * H1 that must be authored — is judgement, and belongs to the AI pipe
 * (`aidream` slot `seo.finding_fixer`). `planDeterministicFix` returns null
 * for those, loudly and by design. A null is not a failure; it is the code
 * pipe correctly declining.
 *
 * THE VERIFICATION RULE: a draft is only produced when it PASSES the very
 * evaluator the check that produced the finding uses (`evaluateMetaTitle` /
 * `evaluateMetaDescription` from `seo/serp/metrics.ts`, the mirror of the
 * scraper's own computation). We never write a "fix" that would fail the
 * next analysis run.
 *
 * Pure module — no React, no I/O — so it is unit-testable and reusable by a
 * batch runner. The write half lives in `finding-fix-apply.ts`.
 */

import {
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
  evaluateMetaDescription,
  evaluateMetaTitle,
} from "@/features/marketing/seo/serp/metrics";

/** Item keys the deterministic planner is willing to attempt at all. */
export const DETERMINISTIC_FIX_KEYS: readonly string[] = [
  "title_presence",
  "title_length",
  "meta_description_presence",
  "meta_description_length",
];

/**
 * Everything the planner may read. All optional but `itemKey`: the crawler
 * fills what the page actually had, and a missing field simply narrows what
 * the planner can honestly do.
 */
export interface FindingFixEvidence {
  itemKey: string;
  /** `head_tags.title` from the page's latest snapshot. */
  currentTitle?: string | null;
  /** `head_tags.meta_description` from the page's latest snapshot. */
  currentMetaDescription?: string | null;
  /** First H1 in document order (`snapshot.headings`). */
  h1?: string | null;
  /** Open Graph / Twitter values — already-authored copy for this page. */
  ogTitle?: string | null;
  ogDescription?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  /** Brand or site name, used as a title suffix when one genuinely fits. */
  brandName?: string | null;
  /** The desired values already authored in the page workspace, if any. */
  desiredTitle?: string | null;
  desiredMetaDescription?: string | null;
}

export interface FindingFixDraft {
  /** Present only when this fix changes the desired meta title. */
  metaTitle?: string;
  /** Present only when this fix changes the desired meta description. */
  metaDescription?: string;
  /** Where the words came from, in the user's language ("the page's H1"). */
  source: string;
  /** One plain sentence: what was done and why it is safe. */
  rationale: string;
}

const SEPARATORS = [" | ", " – ", " — ", " - ", " · ", " :: "];

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/**
 * Drop a trailing "… | Brand Name" style suffix. This is the single most
 * common reason a title overshoots, and removing it is strictly information
 * preserving for the reader (the brand is still in the SERP's domain line).
 */
function withoutTrailingBrandSuffix(title: string): string | null {
  for (const separator of SEPARATORS) {
    const index = title.lastIndexOf(separator);
    // Only a genuine trailing segment, never the first half of the title.
    if (index > title.length / 2) {
      const head = title.slice(0, index).trim();
      if (head.length > 0) return head;
    }
  }
  return null;
}

/** Trim to the last whole word that fits, never mid-word, never with an ellipsis. */
function trimToWords(text: string, maxChars: number): string | null {
  if (text.length <= maxChars) return text;
  const words = text.slice(0, maxChars + 1).split(" ");
  words.pop();
  const trimmed = words.join(" ").replace(/[\s,;:–—-]+$/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Greedily take whole sentences while they still fit. A meta description cut
 * mid-thought reads worse than a shorter complete one, so sentences win over
 * squeezing in the maximum number of characters.
 */
function trimToSentences(text: string, maxChars: number): string | null {
  if (text.length <= maxChars) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (sentences && sentences.length > 0) {
    // Accumulate the RAW slices (each already carries its own trailing
    // space) and trim only at the end — trimming per sentence would glue the
    // next one on with no space and silently corrupt the user's own copy.
    let kept = "";
    for (const sentence of sentences) {
      const next = kept + sentence;
      if (next.trim().length > maxChars) break;
      kept = next;
    }
    const result = kept.trim();
    if (result.length > 0) return result;
  }
  return trimToWords(text, maxChars);
}

/**
 * Shrink until the SAME evaluator the audit check uses says the value is ok.
 * The evaluators carry a PIXEL limit as well as a character limit, so a
 * character-count trim alone is not proof — this loop is.
 */
function fitToEvaluator(
  candidate: string,
  maxChars: number,
  evaluate: (value: string) => { ok: boolean },
  trim: (text: string, max: number) => string | null,
): string | null {
  let value: string | null = candidate;
  let budget = maxChars;
  // Bounded: each pass strictly shortens the budget, so this terminates.
  for (let attempt = 0; attempt < 24 && value !== null; attempt += 1) {
    if (evaluate(value).ok) return value;
    budget = Math.min(budget, value.length) - 3;
    if (budget <= 0) return null;
    value = trim(value, budget);
  }
  return null;
}

/** Add " | Brand" only when the result genuinely passes the title evaluator. */
function withBrandSuffix(base: string, brand: string | null): string {
  if (!brand) return base;
  if (base.toLowerCase().includes(brand.toLowerCase())) return base;
  const candidate = `${base} | ${brand}`;
  return evaluateMetaTitle(candidate).ok ? candidate : base;
}

function planTitle(evidence: FindingFixEvidence): FindingFixDraft | null {
  const current = clean(evidence.currentTitle);
  const brand = clean(evidence.brandName);

  // An over-long title is a trimming problem: keep the author's own words.
  if (current && current.length > TITLE_LIMITS.maxChars) {
    const withoutBrand = withoutTrailingBrandSuffix(current);
    const candidates = [withoutBrand, current].filter(
      (value): value is string => Boolean(value),
    );
    for (const candidate of candidates) {
      const fitted = fitToEvaluator(
        candidate,
        TITLE_LIMITS.maxChars,
        evaluateMetaTitle,
        trimToWords,
      );
      if (fitted && fitted !== current) {
        return {
          metaTitle: fitted,
          source: "this page's own title",
          rationale:
            candidate === withoutBrand
              ? `Kept the page's own title and dropped the trailing brand name, which search results already show — ${fitted.length} characters, inside the ${TITLE_LIMITS.maxChars}-character limit.`
              : `Kept the page's own words and trimmed at a word boundary — ${fitted.length} characters, inside the ${TITLE_LIMITS.maxChars}-character limit.`,
        };
      }
    }
    return null;
  }

  // A missing title: the page's own H1 (or social title) is what it is about.
  if (!current) {
    const sources: Array<[string | null, string]> = [
      [clean(evidence.h1), "this page's main heading (H1)"],
      [clean(evidence.ogTitle), "this page's social share title"],
      [clean(evidence.twitterTitle), "this page's Twitter card title"],
    ];
    for (const [base, source] of sources) {
      if (!base) continue;
      const withBrand = withBrandSuffix(base, brand);
      const fitted = fitToEvaluator(
        withBrand,
        TITLE_LIMITS.maxChars,
        evaluateMetaTitle,
        trimToWords,
      );
      if (fitted) {
        return {
          metaTitle: fitted,
          source,
          rationale: `This page had no search-results title. Took ${source} — words already on the page — and fitted it to ${fitted.length} characters.`,
        };
      }
    }
    return null;
  }

  // A title that is too SHORT (or fails only on pixel width) needs new words.
  // That is judgement, and belongs to the AI pipe. Decline, loudly, by null.
  return null;
}

function planDescription(evidence: FindingFixEvidence): FindingFixDraft | null {
  const current = clean(evidence.currentMetaDescription);

  if (current && current.length > DESCRIPTION_LIMITS.maxChars) {
    const fitted = fitToEvaluator(
      current,
      DESCRIPTION_LIMITS.maxChars,
      evaluateMetaDescription,
      trimToSentences,
    );
    if (
      fitted &&
      fitted !== current &&
      fitted.length >= DESCRIPTION_LIMITS.minChars
    ) {
      return {
        metaDescription: fitted,
        source: "this page's own description",
        rationale: `Kept the page's own description and cut it at a sentence boundary — ${fitted.length} characters, inside the ${DESCRIPTION_LIMITS.maxChars}-character limit.`,
      };
    }
    return null;
  }

  if (!current) {
    const sources: Array<[string | null, string]> = [
      [clean(evidence.ogDescription), "this page's social share description"],
      [
        clean(evidence.twitterDescription),
        "this page's Twitter card description",
      ],
    ];
    for (const [base, source] of sources) {
      if (!base) continue;
      const fitted = fitToEvaluator(
        base,
        DESCRIPTION_LIMITS.maxChars,
        evaluateMetaDescription,
        trimToSentences,
      );
      if (fitted && fitted.length >= DESCRIPTION_LIMITS.minChars) {
        return {
          metaDescription: fitted,
          source,
          rationale: `This page had no search snippet, but it already publishes ${source}. Reused those exact words — ${fitted.length} characters — so the snippet Google shows is the one you wrote.`,
        };
      }
    }
    return null;
  }

  // Too short — the page needs sentences nobody has written. AI pipe.
  return null;
}

/**
 * Plan the deterministic fix for one finding, or return null when the fix is
 * a judgement call. Never throws: a caller may hand it any item key and any
 * partial evidence.
 */
export function planDeterministicFix(
  evidence: FindingFixEvidence,
): FindingFixDraft | null {
  let draft: FindingFixDraft | null = null;
  switch (evidence.itemKey) {
    case "title_presence":
    case "title_length":
      draft = planTitle(evidence);
      break;
    case "meta_description_presence":
    case "meta_description_length":
      draft = planDescription(evidence);
      break;
    default:
      return null;
  }
  if (!draft) return null;

  // Never propose a change that is already the page's authored intent — the
  // user would click a button that changes nothing and learn to distrust it.
  const titleUnchanged =
    draft.metaTitle !== undefined &&
    clean(evidence.desiredTitle) === draft.metaTitle;
  const descriptionUnchanged =
    draft.metaDescription !== undefined &&
    clean(evidence.desiredMetaDescription) === draft.metaDescription;
  if (
    (draft.metaTitle === undefined || titleUnchanged) &&
    (draft.metaDescription === undefined || descriptionUnchanged)
  ) {
    return null;
  }
  return draft;
}
