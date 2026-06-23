/**
 * SEO meta-tag limits + measurement — the SINGLE source of truth.
 *
 * These numbers MUST match the Python backend
 * (aidream `seo/utils/meta_calculators.py`) so that:
 *   - the live SERP calculator page (which measures in-browser) and
 *   - the agent tool checks (which precompute `*_ok` flags server-side)
 * never disagree about whether a title/description "passes".
 *
 * Before this module existed there were three copies of these limits in the
 * frontend — the calculator page checked the title at 580px, the tool overlay
 * at 600px, and the backend at 600/500. Anything that needs an SEO limit or a
 * pixel measurement imports it from HERE.
 */

/** Google renders meta titles in ~20px Roboto/Google Sans (weight 400). */
export const TITLE_FONT_PX = 20;
/** Google renders meta descriptions in ~13px Roboto/Google Sans (weight 400). */
export const DESCRIPTION_FONT_PX = 13;

const SERP_FONT_STACK = "'Google Sans', Roboto, Arial, sans-serif";

/** Meta-title limits (mirror of `calculate_meta_title_metrics`). */
export const TITLE_LIMITS = {
  desktopPx: 600,
  mobilePx: 500,
  /** Width used for the desktop progress bar / visual truncation. */
  displayPx: 600,
  maxChars: 60,
  minChars: 15,
} as const;

/** Meta-description limits (mirror of `calculate_meta_description_metrics`). */
export const DESCRIPTION_LIMITS = {
  desktopPx: 920,
  mobilePx: 680,
  /** Width used for the desktop progress bar / visual truncation. */
  displayPx: 920,
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

let sharedCanvasCtx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (sharedCanvasCtx !== undefined) return sharedCanvasCtx;
  if (typeof document === "undefined") {
    sharedCanvasCtx = null;
    return null;
  }
  sharedCanvasCtx = document.createElement("canvas").getContext("2d") ?? null;
  return sharedCanvasCtx;
}

/**
 * Measure the rendered pixel width of SERP text in the browser. Returns 0 on
 * the server (no canvas) — callers that need a width during SSR should rely on
 * precomputed server values instead.
 */
export function measureSerpWidth(
  text: string,
  kind: "title" | "description",
): number {
  if (!text) return 0;
  const ctx = getCtx();
  if (!ctx) return 0;
  const size = kind === "title" ? TITLE_FONT_PX : DESCRIPTION_FONT_PX;
  ctx.font = `400 ${size}px ${SERP_FONT_STACK}`;
  return ctx.measureText(text).width;
}

export function evaluateMetaTitle(title: string): MetaEvaluation {
  const charCount = title.length;
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
  const desktopOk = pixelWidth <= TITLE_LIMITS.desktopPx;
  const mobileOk = pixelWidth <= TITLE_LIMITS.mobilePx;
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
  if (!desktopOk)
    issues.push(
      `Title exceeds the desktop width limit (${Math.round(pixelWidth)}px > ${TITLE_LIMITS.desktopPx}px) and may be truncated`,
    );
  if (!mobileOk)
    issues.push(
      `Title exceeds the mobile width limit (${Math.round(pixelWidth)}px > ${TITLE_LIMITS.mobilePx}px) and may be truncated on mobile`,
    );
  return {
    pixelWidth: Math.round(pixelWidth),
    charCount,
    desktopOk,
    mobileOk,
    seoLengthOk,
    tooShort,
    ok: desktopOk && mobileOk && seoLengthOk,
    issues,
  };
}

export function evaluateMetaDescription(description: string): MetaEvaluation {
  const charCount = description.length;
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
  const desktopOk = pixelWidth <= DESCRIPTION_LIMITS.desktopPx;
  const mobileOk = pixelWidth <= DESCRIPTION_LIMITS.mobilePx;
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
  if (!desktopOk)
    issues.push(
      `Description exceeds the desktop width limit (${Math.round(pixelWidth)}px > ${DESCRIPTION_LIMITS.desktopPx}px) and may be truncated`,
    );
  if (!mobileOk)
    issues.push(
      `Description exceeds the mobile width limit (${Math.round(pixelWidth)}px > ${DESCRIPTION_LIMITS.mobilePx}px) and may be truncated on mobile`,
    );
  return {
    pixelWidth: Math.round(pixelWidth),
    charCount,
    desktopOk,
    mobileOk,
    seoLengthOk,
    tooShort,
    ok: desktopOk && mobileOk && seoLengthOk,
    issues,
  };
}

/** Clamp a value/limit pair to a 0-100 percentage for progress bars. */
export function pctOf(value: number, limit: number): number {
  if (!limit) return 0;
  return Math.min((value / limit) * 100, 100);
}
