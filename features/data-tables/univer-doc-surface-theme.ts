/**
 * The colours a Univer DOCUMENT surface paints itself with, in each theme.
 *
 * ─── THE DEFECT THIS EXISTS FOR ─────────────────────────────────────────────
 * Univer's docs renderer is THEME-BLIND. `@univerjs/docs-ui` contains not one
 * reference to `darkMode` or the theme service, and `@univerjs/engine-render`'s
 * `DocBackground` paints the workspace and the page from four module-level
 * light constants (`DOCS_WORKSPACE_FILL_COLOR = "#fafafa"`,
 * `PAGE_FILL_COLOR = "rgba(255,255,255,1)"`, …). `univerAPI.toggleDarkMode()`
 * only flips Univer's CHROME (it adds `univer-dark` to `<html>`, which its own
 * `:is(.univer-dark, .univer-dark *)` CSS keys off) — it never reaches the
 * canvas. So the only inputs to the page and the frame are the ones a host
 * pushes in through `DocBackground.setFillColors(...)` and the canvas
 * element's own `style.backgroundColor`.
 *
 * Cold walk 18 (2026-09-21, production, dark) opened a Rulebook's
 * "Add more → New document" and measured the editing surface: page fill
 * `rgb(0, 0, 0)` inside a frame still painting `rgb(250, 250, 250)` — a black
 * sheet in a white frame, unreadable, in an app that was otherwise dark. The
 * frame was Univer's hardcoded light `#fafafa`; the page was black because a
 * fill string the 2D context could not parse leaves `ctx.fillStyle` at its
 * spec default of opaque black. Either way the host had told Univer NOTHING,
 * so whatever Univer happened to hold is what the Expert saw.
 *
 * ─── THE DECISION ───────────────────────────────────────────────────────────
 * The host now states all four colours explicitly, in both themes, every time
 * the theme changes. The shape of the answer is the one Word, Pages and Google
 * Docs all ship:
 *
 *   THE PAGE IS PAPER IN BOTH THEMES; THE FRAME AROUND IT FOLLOWS THE APP.
 *
 * The page stays paper because the INK cannot follow the theme: Univer stores
 * text colour in the document's own runs and defaults it to black, so a dark
 * page would be black-on-black — the defect, moved rather than fixed. Paper
 * with black ink is legible in both themes and is what the document will look
 * like when it is printed or exported. The frame, the page outline and the
 * margin guides are the parts that are genuinely chrome, and they follow the
 * app's semantic tokens so a dark app never wraps a document in a white void.
 *
 * Tokens are read LIVE from `app/globals.css` (`--background`, `--border`) so
 * this file never becomes a second palette that drifts from the real one; the
 * fallbacks below are only for a context with no computed style (tests, SSR).
 */

/** The four fills Univer's `DocBackground` takes, plus the canvas element's. */
export interface UniverDocSurfaceColors {
  /** Behind and around the page — the "desk". Also the canvas element's CSS background. */
  frame: string;
  /** The sheet the person types on. */
  page: string;
  /** The page's outline, seen against `frame`. */
  pageStroke: string;
  /** The little corner guides printed ON the page at the margins. */
  marginStroke: string;
}

export type ThemeModeName = "light" | "dark";

/**
 * Univer 0.25.x's own defaults, copied from
 * `@univerjs/engine-render` → `src/components/docs/doc-background.ts`.
 *
 * Here so the guard can prove, permanently and in one assertion, that leaving
 * the host silent violates the invariant in dark mode. Never rendered.
 */
export const UNIVER_UPSTREAM_DEFAULT_COLORS: UniverDocSurfaceColors = {
  frame: "#fafafa",
  page: "rgba(255, 255, 255, 1)",
  pageStroke: "rgba(198, 198, 198, 1)",
  marginStroke: "rgba(158, 158, 158, 1)",
};

/** Used only when no computed style is available (jsdom, SSR, boot). */
const TOKEN_FALLBACKS: Record<ThemeModeName, { background: string; border: string }> = {
  light: { background: "240 5% 96%", border: "240 6% 84%" },
  dark: { background: "240 4% 16%", border: "240 4% 28%" },
};

/**
 * The paper. Deliberately theme-independent — see the header. Kept a hair off
 * pure white in dark so an A4 sheet on a dark desk is a page and not a lamp,
 * while staying far above the contrast the black ink needs.
 */
const PAPER: Record<ThemeModeName, string> = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(245, 245, 247)",
};

/**
 * The margin guides sit ON the paper, so they are judged against the paper and
 * not against the app theme — Univer's own value reads correctly on both.
 */
const MARGIN_GUIDE = "rgba(158, 158, 158, 1)";

export type TokenReader = (name: string) => string;

/**
 * Read a `--token` off the document element. Returns "" when unavailable so
 * the caller falls back rather than painting an unparseable string — the exact
 * failure that produced the black page.
 */
export function domTokenReader(): TokenReader {
  return (name) => {
    if (typeof document === "undefined" || !document.documentElement) return "";
    try {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    } catch {
      return "";
    }
  };
}

/** An hsl triple like `240 4% 16%` → a string any canvas / CSS parser accepts. */
function hslFromToken(raw: string, fallback: string): string {
  const value = raw && /\d/.test(raw) ? raw : fallback;
  return `hsl(${value})`;
}

/**
 * The colours this app paints a Univer document surface with, in `mode`.
 *
 * Pure: hand it a reader and it is fully determined, which is what the guard
 * drives.
 */
export function univerDocSurfaceColors(
  mode: ThemeModeName,
  readToken: TokenReader = domTokenReader(),
): UniverDocSurfaceColors {
  const fallbacks = TOKEN_FALLBACKS[mode];
  return {
    frame: hslFromToken(readToken("--background"), fallbacks.background),
    page: PAPER[mode],
    pageStroke: hslFromToken(readToken("--border"), fallbacks.border),
    marginStroke: MARGIN_GUIDE,
  };
}

// ─── the invariant, and the machinery that judges it ────────────────────────

/**
 * Relative luminance (0 black → 1 white) of any colour string this module can
 * produce: `rgb()`, `rgba()`, `hsl()`, `hsla()` or `#rgb`/`#rrggbb`.
 *
 * Returns `null` for anything it cannot parse. That is not a gap — an
 * unparseable fill is precisely what a 2D context silently renders as black,
 * so the invariant below treats "cannot parse" as a violation rather than as
 * an excuse to pass.
 */
export function relativeLuminance(color: string): number | null {
  const rgb = toRgb(color);
  if (!rgb) return null;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  );
}

function toRgb(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    const short = digits.length <= 4;
    const at = (i: number) =>
      short
        ? Number.parseInt(digits[i]! + digits[i]!, 16)
        : Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    return [at(0), at(1), at(2)];
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return [parts[0]!, parts[1]!, parts[2]!];
  }

  const hsl = /^hsla?\(([^)]+)\)$/.exec(value);
  if (hsl) {
    const parts = hsl[1]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = Number.parseFloat(parts[0]!);
    const s = Number.parseFloat(parts[1]!) / 100;
    const l = Number.parseFloat(parts[2]!) / 100;
    if ([h, s, l].some(Number.isNaN)) return null;
    return hslToRgb(h, s, l);
  }

  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** A frame lighter than this in dark mode is the white-void defect. */
const DARK_FRAME_MAX_LUMINANCE = 0.2;
/** Ink is black, so the paper has to stay genuinely paper. */
const PAGE_MIN_LUMINANCE = 0.6;

/**
 * Judge one theme's colours. Returns every violation, empty when clean.
 *
 * THE INVARIANT, in words: the page is always paper the black ink can be read
 * on; the frame is never LIGHTER than the page (that is the white-frame-around-
 * a-dark-page inversion cold walk 18 photographed); in dark mode the frame is
 * genuinely dark; and every colour parses, because one that does not renders
 * as opaque black on a canvas.
 */
export function univerDocSurfaceViolations(
  mode: ThemeModeName,
  colors: UniverDocSurfaceColors,
): string[] {
  const violations: string[] = [];
  const luminance: Partial<Record<keyof UniverDocSurfaceColors, number>> = {};

  for (const key of [
    "frame",
    "page",
    "pageStroke",
    "marginStroke",
  ] as (keyof UniverDocSurfaceColors)[]) {
    const l = relativeLuminance(colors[key]);
    if (l === null) {
      violations.push(
        `${mode}: ${key} is "${colors[key]}", which a 2D context cannot parse — it would paint opaque black`,
      );
      continue;
    }
    luminance[key] = l;
  }

  const page = luminance.page;
  const frame = luminance.frame;

  if (page !== undefined && page < PAGE_MIN_LUMINANCE) {
    violations.push(
      `${mode}: the page (${colors.page}) is too dark for the black ink Univer writes — luminance ${page.toFixed(3)} < ${PAGE_MIN_LUMINANCE}`,
    );
  }
  if (page !== undefined && frame !== undefined && frame > page) {
    violations.push(
      `${mode}: the frame (${colors.frame}) is lighter than the page (${colors.page}) — a bright frame around a darker sheet is the inversion cold walk 18 found`,
    );
  }
  if (mode === "dark" && frame !== undefined && frame > DARK_FRAME_MAX_LUMINANCE) {
    violations.push(
      `dark: the frame (${colors.frame}) is a light surface in a dark app — luminance ${frame.toFixed(3)} > ${DARK_FRAME_MAX_LUMINANCE}`,
    );
  }

  return violations;
}
