/**
 * Aspect-ratio option sets — recognising them and ordering them for a picker.
 *
 * Model catalogs expose aspect ratio as a plain string enum ("1:1", "16:9",
 * "9:19.5", Runway's pixel pairs "1280:720", plus words like "auto" or
 * "match_input_image"). Any option list that is mostly ratios renders through
 * `AspectRatioSelect` — wherever it came from — so the rule lives on the data,
 * not on one control key.
 */

export interface ParsedRatio {
  w: number;
  h: number;
}

const RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)\s*$/i;

export function parseRatio(value: string): ParsedRatio | null {
  const m = RATIO_RE.exec(value);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0 && h > 0)) return null;
  return { w, h };
}

/** True when at least two options and every option but the words is a ratio. */
export function isAspectRatioOptionSet(options: readonly string[]): boolean {
  const ratios = options.filter((o) => parseRatio(o) !== null).length;
  return ratios >= 2 && ratios >= options.length - 2;
}

/** The ratios people reach for, in the order they reach for them. */
const COMMON_ORDER = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
];

function reduced(r: ParsedRatio): string {
  const scale = 1000;
  let a = Math.round(r.w * scale);
  let b = Math.round(r.h * scale);
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const g = gcd(a, b);
  a /= g;
  b /= g;
  return `${a}:${b}`;
}

/** "Square", "Landscape", … — a plain word for the shape. */
export function ratioShapeName(value: string): string | null {
  const r = parseRatio(value);
  if (!r) return null;
  const k = r.w / r.h;
  if (Math.abs(k - 1) < 0.02) return "Square";
  if (k >= 2.2) return "Ultrawide";
  if (k <= 1 / 2.2) return "Tall";
  if (k > 1.6) return "Widescreen";
  if (k < 1 / 1.6) return "Story";
  return k > 1 ? "Landscape" : "Portrait";
}

/** Words that are not ratios ("auto", "match_input_image") read as words. */
export function humanizeRatioWord(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface RatioGroups {
  /** Non-ratio words first (Auto, Match input image). */
  words: string[];
  common: string[];
  more: string[];
}

/** Split options into words, common ratios (fixed order) and the rest (by shape). */
export function groupRatioOptions(options: readonly string[]): RatioGroups {
  const words: string[] = [];
  const ratioOpts: string[] = [];
  for (const o of options) (parseRatio(o) ? ratioOpts : words).push(o);

  const byReduced = new Map<string, string>();
  for (const o of ratioOpts) {
    const key = reduced(parseRatio(o)!);
    if (!byReduced.has(key)) byReduced.set(key, o);
  }
  const common: string[] = [];
  for (const c of COMMON_ORDER) {
    const hit = byReduced.get(reduced(parseRatio(c)!));
    if (hit) common.push(hit);
  }
  const commonSet = new Set(common);
  const more = ratioOpts
    .filter((o) => !commonSet.has(o))
    .sort((a, b) => {
      const ra = parseRatio(a)!;
      const rb = parseRatio(b)!;
      return rb.w / rb.h - ra.w / ra.h;
    });
  // A short list has no "More": everything is common.
  if (ratioOpts.length <= 6) {
    return { words, common: [...common, ...more], more: [] };
  }
  return { words, common, more };
}
