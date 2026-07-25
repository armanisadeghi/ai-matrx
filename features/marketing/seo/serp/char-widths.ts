/**
 * Deterministic SERP character-width table — EXACT mirror of the Python
 * implementation in aidream `seo/utils/meta_calculators.py`
 * (`calculate_text_width`). Both sides MUST stay byte-identical so that a
 * width computed in the browser, on the server, or by the scraper at crawl
 * time is the same number.
 *
 * Ratios are average character widths for Roboto/Arial at 1px font size;
 * multiply by the font size to get pixels. Unmapped characters use
 * `DEFAULT_CHAR_WIDTH`.
 *
 * Changing ANY value here requires the same change in
 * `aidream/seo/utils/meta_calculators.py` in the same unit of work, plus
 * regenerating the parity fixtures in `metrics.parity.test.ts`.
 */

export const CHAR_WIDTHS: Readonly<Record<string, number>> = {
  // Narrow characters
  i: 0.25,
  j: 0.25,
  l: 0.25,
  t: 0.28,
  f: 0.28,
  r: 0.33,
  I: 0.25,
  J: 0.42,
  "!": 0.25,
  ".": 0.25,
  ",": 0.25,
  ":": 0.25,
  ";": 0.25,
  "|": 0.25,
  "'": 0.17,
  '"': 0.32,
  "`": 0.25,
  // Medium characters
  a: 0.56,
  c: 0.5,
  e: 0.56,
  g: 0.56,
  h: 0.56,
  k: 0.5,
  n: 0.56,
  o: 0.56,
  p: 0.56,
  q: 0.56,
  s: 0.5,
  u: 0.56,
  v: 0.5,
  x: 0.5,
  y: 0.5,
  z: 0.5,
  b: 0.56,
  d: 0.56,
  A: 0.67,
  B: 0.67,
  C: 0.72,
  D: 0.72,
  E: 0.61,
  F: 0.56,
  G: 0.78,
  H: 0.72,
  K: 0.67,
  L: 0.56,
  N: 0.72,
  O: 0.78,
  P: 0.67,
  Q: 0.78,
  R: 0.72,
  S: 0.67,
  T: 0.61,
  U: 0.72,
  V: 0.67,
  X: 0.67,
  Y: 0.67,
  Z: 0.61,
  // Wide characters
  m: 0.83,
  w: 0.72,
  M: 0.83,
  W: 0.94,
  // Numbers
  "0": 0.56,
  "1": 0.56,
  "2": 0.56,
  "3": 0.56,
  "4": 0.56,
  "5": 0.56,
  "6": 0.56,
  "7": 0.56,
  "8": 0.56,
  "9": 0.56,
  // Special characters
  " ": 0.28,
  "-": 0.33,
  _: 0.56,
  "=": 0.58,
  "+": 0.58,
  "(": 0.33,
  ")": 0.33,
  "[": 0.28,
  "]": 0.28,
  "{": 0.33,
  "}": 0.33,
  "<": 0.58,
  ">": 0.58,
  "?": 0.56,
  "/": 0.28,
  "\\": 0.28,
  "&": 0.67,
  "%": 0.89,
  $: 0.56,
  "#": 0.56,
  "@": 1.0,
};

export const DEFAULT_CHAR_WIDTH = 0.56;

/**
 * Approximate rendered pixel width of `text` at `fontSizePx`. Deterministic —
 * identical to Python `calculate_text_width(text, font_size)`.
 */
export function calculateTextWidth(text: string, fontSizePx: number): number {
  if (!text) return 0;
  let total = 0;
  for (const char of text) {
    total += (CHAR_WIDTHS[char] ?? DEFAULT_CHAR_WIDTH) * fontSizePx;
  }
  return total;
}
