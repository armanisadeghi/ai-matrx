/**
 * SEO meta-tag limits + measurement — the SINGLE source of truth.
 *
 * Measurement is DETERMINISTIC: a shared character-width table
 * (`char-widths.ts`) that is an exact mirror of the Python backend
 * (aidream `packages/matrx-scraper/matrx_scraper/meta_metrics.py`). The same
 * string produces the same pixel width in the browser, during SSR, in a unit
 * test, and in the scraper's crawl-time computation — so persisted metrics,
 * live previews, and agent tool checks can never disagree.
 *
 * History: this module originally measured via a browser canvas while Python
 * used the character table, which meant client and server widths could drift
 * a few percent and SSR always returned 0. Before THAT, there were three
 * copies of the limits in the frontend (580px / 600px / 600px…). Anything
 * that needs an SEO limit, a pixel measurement, or an evaluation imports it
 * from HERE — and any change to limits, table, or issue wording must land in
 * `matrx_scraper/meta_metrics.py` in the same unit of work (parity is
 * unit-tested in `metrics.parity.test.ts` against Python-generated fixtures).
 */

import { calculateTextWidth } from "./char-widths";

/** Google renders meta titles in ~20px Roboto/Google Sans (weight 400). */
export const TITLE_FONT_PX = 20;
/** Google renders meta descriptions in ~13px Roboto/Google Sans (weight 400). */
export const DESCRIPTION_FONT_PX = 13;

/**
 * ONE pixel limit per field, not a desktop/mobile pair. Google truncates on
 * rendered PIXEL WIDTH and publishes no separate desktop/mobile metadata rule
 * (customer report c2fad99f, 2026-07-28). The two limits had always carried
 * the same value, so a single overflow emitted TWO issues saying the same
 * thing in the audit report. `desktopPx` / `mobilePx` remain as aliases of the
 * one `maxPx` so existing readers keep working — never diverge them.
 */

/** Meta-title limits (mirror of `calculate_meta_title_metrics`). */
export const TITLE_LIMITS = {
  maxPx: 600,
  desktopPx: 600,
  mobilePx: 600,
  maxChars: 60,
  minChars: 15,
} as const;

/** Meta-description limits (mirror of `calculate_meta_description_metrics`). */
export const DESCRIPTION_LIMITS = {
  maxPx: 920,
  desktopPx: 920,
  mobilePx: 920,
  maxChars: 160,
  minChars: 70,
} as const;

export interface MetaEvaluation {
  pixelWidth: number;
  charCount: number;
  desktopOk: boolean;
  mobileOk: boolean;
  /** Within the SEO character window (not too short, not too long). */
  seoLengthOk: boolean;
  tooShort: boolean;
  /** Overall pass — fits every device AND the SEO character window. */
  ok: boolean;
  issues: string[];
}

/**
 * Measure the pixel width of SERP text. Deterministic and environment-free —
 * safe in RSC, SSR, workers, and tests.
 */
export function measureSerpWidth(
  text: string,
  kind: "title" | "description",
): number {
  if (!text) return 0;
  const size = kind === "title" ? TITLE_FONT_PX : DESCRIPTION_FONT_PX;
  return calculateTextWidth(text, size);
}

/** Unicode code-point count — matches Python `len(str)`, not UTF-16 units. */
export function countSeoCharacters(text: string): number {
  return Array.from(text).length;
}

export function evaluateMetaTitle(title: string): MetaEvaluation {
  const charCount = countSeoCharacters(title);
  if (!title.trim()) {
    return {
      pixelWidth: 0,
      charCount,
      desktopOk: false,
      mobileOk: false,
      seoLengthOk: false,
      tooShort: true,
      ok: false,
      issues: ["Title is empty"],
    };
  }
  const pixelWidth = measureSerpWidth(title, "title");
  const widthOk = pixelWidth <= TITLE_LIMITS.maxPx;
  const desktopOk = widthOk;
  const mobileOk = widthOk;
  const tooShort = charCount < TITLE_LIMITS.minChars;
  const tooLong = charCount > TITLE_LIMITS.maxChars;
  const seoLengthOk = !tooShort && !tooLong;
  const issues: string[] = [];
  if (tooShort)
    issues.push(
      `Title is too short (${charCount} chars; minimum is ${TITLE_LIMITS.minChars})`,
    );
  if (tooLong)
    issues.push(
      `Title is too long (${charCount} chars; maximum is ${TITLE_LIMITS.maxChars})`,
    );
  if (!widthOk)
    issues.push(
      `Title exceeds the width limit (${Math.round(pixelWidth)}px > ${TITLE_LIMITS.maxPx}px) and may be truncated`,
    );
  return {
    pixelWidth: Math.round(pixelWidth),
    charCount,
    desktopOk,
    mobileOk,
    seoLengthOk,
    tooShort,
    ok: widthOk && seoLengthOk,
    issues,
  };
}

export function evaluateMetaDescription(description: string): MetaEvaluation {
  const charCount = countSeoCharacters(description);
  if (!description.trim()) {
    return {
      pixelWidth: 0,
      charCount,
      desktopOk: false,
      mobileOk: false,
      seoLengthOk: false,
      tooShort: true,
      ok: false,
      issues: ["Description is empty"],
    };
  }
  const pixelWidth = measureSerpWidth(description, "description");
  const widthOk = pixelWidth <= DESCRIPTION_LIMITS.maxPx;
  const desktopOk = widthOk;
  const mobileOk = widthOk;
  const tooShort = charCount < DESCRIPTION_LIMITS.minChars;
  const tooLong = charCount > DESCRIPTION_LIMITS.maxChars;
  const seoLengthOk = !tooShort && !tooLong;
  const issues: string[] = [];
  if (tooShort)
    issues.push(
      `Description is too short (${charCount} chars; minimum is ${DESCRIPTION_LIMITS.minChars})`,
    );
  if (tooLong)
    issues.push(
      `Description is too long (${charCount} chars; maximum is ${DESCRIPTION_LIMITS.maxChars})`,
    );
  if (!widthOk)
    issues.push(
      `Description exceeds the width limit (${Math.round(pixelWidth)}px > ${DESCRIPTION_LIMITS.maxPx}px) and may be truncated`,
    );
  return {
    pixelWidth: Math.round(pixelWidth),
    charCount,
    desktopOk,
    mobileOk,
    seoLengthOk,
    tooShort,
    ok: widthOk && seoLengthOk,
    issues,
  };
}

/** Clamp a value/limit pair to a 0-100 percentage for progress bars. */
export function pctOf(value: number, limit: number): number {
  if (!limit) return 0;
  return Math.min((value / limit) * 100, 100);
}

// ---------------------------------------------------------------------------
// Stored metrics — the canonical persisted shape (`web.snapshot.seo_metrics`
// and `web.page.seo_metrics_desired`). snake_case because the scraper (Python)
// is a co-writer of the identical shape.
// ---------------------------------------------------------------------------

/**
 * One field's persisted metrics — identical whether written by TS or Python.
 * `type` (not `interface`) so it stays assignable to `Record<string, unknown>`
 * and jsonb columns without casts.
 */
export type StoredMetaFieldMetrics = {
  pixel_width: number;
  character_count: number;
  desktop_ok: boolean;
  mobile_ok: boolean;
  seo_length_ok: boolean;
  too_short: boolean;
  ok: boolean;
  issues: string[];
};

export type StoredSeoMetrics = {
  /** Payload contract version. Bump when the shape changes. */
  v: 1;
  /** Who computed it: "client" (browser recalc) or "scraper" (crawl time). */
  source: "client" | "scraper";
  computed_at: string;
  title: StoredMetaFieldMetrics;
  description: StoredMetaFieldMetrics;
  overall_ok: boolean;
};

function toStoredField(evaluation: MetaEvaluation): StoredMetaFieldMetrics {
  return {
    pixel_width: evaluation.pixelWidth,
    character_count: evaluation.charCount,
    desktop_ok: evaluation.desktopOk,
    mobile_ok: evaluation.mobileOk,
    seo_length_ok: evaluation.seoLengthOk,
    too_short: evaluation.tooShort,
    ok: evaluation.ok,
    issues: evaluation.issues,
  };
}

/** Build the canonical persisted payload from a title + description. */
export function buildStoredSeoMetrics(
  title: string,
  description: string,
  source: StoredSeoMetrics["source"] = "client",
): StoredSeoMetrics {
  const titleEval = evaluateMetaTitle(title);
  const descriptionEval = evaluateMetaDescription(description);
  return {
    v: 1,
    source,
    computed_at: new Date().toISOString(),
    title: toStoredField(titleEval),
    description: toStoredField(descriptionEval),
    overall_ok: titleEval.ok && descriptionEval.ok,
  };
}

/** Narrow an unknown JSON value (a jsonb column) to StoredSeoMetrics. */
export function parseStoredSeoMetrics(value: unknown): StoredSeoMetrics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredSeoMetrics>;
  if (candidate.v !== 1) return null;
  if (!candidate.title || !candidate.description) return null;
  if (
    typeof candidate.title.pixel_width !== "number" ||
    typeof candidate.description.pixel_width !== "number"
  )
    return null;
  return candidate as StoredSeoMetrics;
}

/** Convert a stored field back to the UI evaluation shape. */
export function storedFieldToEvaluation(
  field: StoredMetaFieldMetrics,
): MetaEvaluation {
  return {
    pixelWidth: field.pixel_width,
    charCount: field.character_count,
    desktopOk: field.desktop_ok,
    mobileOk: field.mobile_ok,
    seoLengthOk: field.seo_length_ok,
    tooShort: field.too_short,
    ok: field.ok,
    issues: field.issues,
  };
}
