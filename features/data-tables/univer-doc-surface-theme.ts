/**
 * The colours a Univer DOCUMENT surface paints itself with, in each theme.
 *
 * ─── THE DEFECT THIS EXISTS FOR ─────────────────────────────────────────────
 * Univer's docs renderer is THEME-BLIND at the top and THEME-SURGICAL at the
 * bottom, and both halves bite.
 *
 * At the top, `@univerjs/docs-ui` contains not one reference to `darkMode` or
 * the theme service, and `@univerjs/engine-render`'s `DocBackground` paints the
 * workspace and the page from four module-level LIGHT constants
 * (`DOCS_WORKSPACE_FILL_COLOR = "#fafafa"`, `PAGE_FILL_COLOR = white`, …).
 * `univerAPI.toggleDarkMode()` flips Univer's CHROME (it adds `univer-dark` to
 * `<html>`, which its own CSS keys off) and stops there. So the only inputs to
 * the page and the frame are the ones a host pushes in through
 * `DocBackground.setFillColors(...)` and the canvas element's `style`.
 *
 * At the bottom, every `ctx.fillStyle = <string>` on Univer's rendering context
 * goes through `ICanvasColorService.getRenderColor()`, which in dark mode
 * INVERTS the colour — and THROWS on anything its `ColorKit` cannot parse.
 * `features/data-tables/univer-doc-canvas-colors.ts` takes that service off the
 * document canvas so the colours below land verbatim; this file's job is to
 * make sure they are colours nothing in the stack can choke on.
 *
 * Two cold walks, same screen, 2026-09-21, production, dark:
 *   · WALK 18 — a BLACK sheet in a WHITE frame. The host stated nothing, so
 *     Univer painted its own white page and the inverter turned it black,
 *     inside the canvas element's un-themed CSS `#fafafa`.
 *   · WALK 19 — NOTHING AT ALL: a 1396x684 canvas, 0.00% non-background
 *     pixels, swallowing a 519-character paragraph that was being saved the
 *     whole time (light mode, reloaded, showed it sitting on the paper). The
 *     host had by then stated its colours — as `hsl(240 4% 16%)`, the
 *     space-separated CSS Color 4 form this app's tokens are written in.
 *     ColorKit's `hslToColor` splits on COMMAS and throws on it. The throw is
 *     raised inside the `fillStyle` setter, i.e. inside the render pass, so the
 *     whole draw aborted and the canvas stayed as `clearRect` left it. Every
 *     later frame threw again, which is why flipping back to light never
 *     brought the page back.
 *
 * ─── THE DECISION ───────────────────────────────────────────────────────────
 *   THE PAGE IS PAPER WITH BLACK INK IN BOTH THEMES; THE FRAME FOLLOWS THE APP.
 *
 * The page stays paper because the INK cannot follow the theme by itself:
 * Univer stores text colour in the document's own runs and defaults it to
 * black, so a dark page is black-on-black unless something inverts the ink too
 * — and the only thing that would is the service whose inversion also blanks
 * the page. Paper with black ink is legible in both themes, is what Word, Pages
 * and Google Docs show by default, and is what the document looks like printed
 * or exported. The frame, the page outline and the margin guides are the parts
 * that are genuinely chrome; they follow the app's semantic tokens so a dark
 * app never wraps a document in a white void.
 *
 * Tokens are read LIVE from `app/globals.css` (`--background`, `--border`) so
 * this file never becomes a second palette that drifts from the real one; the
 * fallbacks below are only for a context with no computed style (tests, SSR).
 * They are resolved to `rgb(...)` HERE, once, rather than passed through as
 * `hsl(...)` — see `rgbFromHslToken`.
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

/**
 * An hsl triple like `240 4% 16%` (Tailwind/shadcn token form) → `rgb(r, g, b)`.
 *
 * IT MUST BE `rgb(...)`, NOT `hsl(...)`. Browsers parse both, but every fill
 * this module produces is handed to Univer's `CanvasColorService`, and that
 * service calls `new ColorKit(color)` on anything that is not hex / rgb /
 * rgba. ColorKit's `hslToColor` splits on commas and THROWS
 * (`illegal hsl color`) on the space-separated form CSS Color 4 introduced and
 * this app's tokens are written in. The throw lands inside the `fillStyle`
 * setter, i.e. inside the render pass, and takes the whole page down with it —
 * cold walk 19's 1396x684 canvas with 0.00% non-background pixels. Resolving
 * the token to `rgb()` here means the colour is parseable by every consumer,
 * not just by the browser.
 */
function rgbFromHslToken(raw: string, fallback: string): string {
  const value = raw && /\d/.test(raw) ? raw : fallback;
  const parts = value.split(/[\s,/]+/).filter(Boolean);
  const h = Number.parseFloat(parts[0] ?? "");
  const s = Number.parseFloat(parts[1] ?? "") / 100;
  const l = Number.parseFloat(parts[2] ?? "") / 100;
  if ([h, s, l].some(Number.isNaN)) return rgbFromHslToken(fallback, fallback);
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgb(${r}, ${g}, ${b})`;
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
    frame: rgbFromHslToken(readToken("--background"), fallbacks.background),
    page: PAPER[mode],
    pageStroke: rgbFromHslToken(readToken("--border"), fallbacks.border),
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

/**
 * The colour grammar EVERY consumer in the stack accepts.
 *
 * Not "what a browser accepts" — the browser is the most permissive reader in
 * the chain and was green through both cold walks. The strictest reader is
 * Univer's own `ColorKit` (`@univerjs/core`), which every fill passes through
 * on its way to the canvas: hex, and `rgb()`/`rgba()`/`hsl()`/`hsla()` with
 * COMMAS. Hand it CSS Color 4's space-separated `hsl(240 4% 16%)` — the form
 * this app's design tokens are written in — and it throws inside the render
 * pass, which is how cold walk 19's page came out empty. So the rule is the
 * intersection, and this module only ever emits `rgb(...)` and `rgba(...)`.
 */
const UNIVER_PARSEABLE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\))$/i;

/**
 * Would every reader in the stack — the 2D context AND Univer's ColorKit —
 * accept this string?
 */
export function isUniverParseableColor(color: string): boolean {
  return UNIVER_PARSEABLE_COLOR.test(color.trim());
}

/** A frame lighter than this in dark mode is the white-void defect. */
const DARK_FRAME_MAX_LUMINANCE = 0.2;
/** Ink is black, so the paper has to stay genuinely paper. */
const PAGE_MIN_LUMINANCE = 0.6;

/**
 * Judge one theme's colours. Returns every violation, empty when clean.
 *
 * THE INVARIANT, in words: every colour is one EVERY reader in the stack
 * accepts — a string the browser takes and Univer's ColorKit throws on empties
 * the whole page (cold walk 19), and one nothing can parse leaves `fillStyle`
 * at its spec default of opaque black (cold walk 18); the page is always paper
 * the black ink can be read on; the frame is never LIGHTER than the page (the
 * white-frame-around-a-dark-page inversion cold walk 18 photographed); and in
 * dark mode the frame is genuinely dark.
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
    const value = colors[key];
    if (!value || !isUniverParseableColor(value)) {
      violations.push(
        `${mode}: ${key} is "${value}", which is not in the grammar every reader in the stack accepts (hex, or rgb/rgba/hsl/hsla with COMMAS) — Univer's ColorKit throws on it inside the render pass and the whole page comes out blank`,
      );
      continue;
    }
    const l = relativeLuminance(value);
    if (l === null) {
      violations.push(
        `${mode}: ${key} is "${value}", which a 2D context cannot parse — it would paint opaque black`,
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
