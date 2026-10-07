/**
 * THE BLACK PAGE (2026-10-03): every Univer document page rendered solid
 * black — pixel 0,0,0,255 — from first boot, in every browser and theme.
 *
 * Univer 1.0 paints its own fills as theme TOKENS (`"gray.0"` page,
 * `"gray.100"` desk, `"gray.900"` ink). The document editor had replaced
 * Univer's colour service with `DumbCanvasColorService` (to stop dark mode
 * inverting the paper), and the dumb service hands `"gray.0"` to
 * `ctx.fillStyle` unchanged. A canvas ignores a colour it cannot parse and
 * keeps its default black. The real Univer half of this proof — every token
 * the shipped engine-render / docs-ui bundles paint resolves to a colour
 * Univer's own ColorKit accepts — is `pnpm check:univer-doc-theme`.
 */
import { resolveUniverCanvasColor } from "@/lib/univer/univer-theme-token-color";

/** A slice of Univer 1.0's default theme, as `ThemeService.getColorFromTheme` reads it. */
const THEME: Record<string, Record<string, string>> = {
  gray: { "0": "#ffffff", "50": "#f9fafb", "100": "#f3f4f6", "200": "#e5e7eb", "900": "#111827" },
  primary: { "600": "#0c81fb" },
};
const lookup = (token: string): unknown => {
  const [palette, shade] = token.split(".");
  return THEME[palette]?.[shade];
};

/** What a canvas does with a fillStyle: a colour it cannot parse is ignored. */
const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(.+\)|hsla?\(.+\)|transparent)$/i;
function paintedFill(fill: string): string {
  return CSS_COLOR.test(fill) ? fill : "#000000"; // the canvas default
}

describe("Univer's theme tokens reach the canvas as colours", () => {
  it("FAILS-BEFORE: a pass-through service (DumbCanvasColorService) paints the page black", () => {
    const dumb = (color: string) => color;
    expect(paintedFill(dumb("gray.0"))).toBe("#000000");
  });

  it("the page, desk, outline and ink tokens resolve from the live theme", () => {
    expect(resolveUniverCanvasColor("gray.0", lookup)).toBe("#ffffff");
    expect(resolveUniverCanvasColor("gray.100", lookup)).toBe("#f3f4f6");
    expect(resolveUniverCanvasColor("gray.200", lookup)).toBe("#e5e7eb");
    expect(resolveUniverCanvasColor("gray.900", lookup)).toBe("#111827");
    expect(paintedFill(resolveUniverCanvasColor("gray.0", lookup))).toBe("#ffffff");
  });

  it("real colours pass through untouched — nothing is inverted, in any theme", () => {
    for (const color of ["#000000", "rgb(255, 255, 255)", "rgba(0, 0, 0, 0.5)", "transparent", "hsl(240, 4%, 16%)"]) {
      expect(resolveUniverCanvasColor(color, lookup)).toBe(color);
    }
  });

  it("an unknown token is returned as given rather than invented", () => {
    expect(resolveUniverCanvasColor("gray.999", lookup)).toBe("gray.999");
  });
});
