/**
 * THE GUARD for cold walk 18's dark-mode document page.
 *
 * The defect: `/documents/[id]` (and every other surface that mounts a cloud
 * document) rendered a black sheet inside a bright frame in dark mode, because
 * the host told Univer nothing and Univer's docs renderer has no theme at all.
 *
 * The first test below is the FAILS-BEFORE proof, encoded permanently: it runs
 * the invariant against Univer's own upstream defaults — which is exactly what
 * this app shipped before this change, since it never called `setFillColors`
 * or touched the canvas element — and asserts they violate it in dark mode.
 * Every test after it asserts the colours this app now states pass.
 */
import {
  UNIVER_UPSTREAM_DEFAULT_COLORS,
  relativeLuminance,
  univerDocSurfaceColors,
  univerDocSurfaceViolations,
  type TokenReader,
} from "../univer-doc-surface-theme";

/** The real values in `app/globals.css`, so the test judges the real palette. */
const TOKENS: Record<"light" | "dark", Record<string, string>> = {
  light: { "--background": "240 5% 96%", "--border": "240 6% 84%" },
  dark: { "--background": "240 4% 16%", "--border": "240 4% 28%" },
};

const readerFor =
  (mode: "light" | "dark"): TokenReader =>
  (name) =>
    TOKENS[mode][name] ?? "";

describe("Univer document surface theme", () => {
  describe("the state this repo was in before the fix", () => {
    it("Univer's own defaults violate the invariant in dark mode", () => {
      const violations = univerDocSurfaceViolations(
        "dark",
        UNIVER_UPSTREAM_DEFAULT_COLORS,
      );
      expect(violations).not.toHaveLength(0);
      // The exact shape cold walk 18 photographed: a light frame in a dark app.
      expect(violations.join(" | ")).toMatch(/light surface in a dark app/);
    });

    it("a fill string the stack cannot parse is a violation, not a pass", () => {
      // An unparseable `fillStyle` leaves the context at its spec default of
      // opaque black — which is how a page renders `rgb(0, 0, 0)` while the
      // code that set it looks perfectly reasonable. And a string only
      // Univer's ColorKit rejects is worse still: it throws inside the render
      // pass and the page comes out blank (cold walk 19).
      const unparseable = univerDocSurfaceViolations("dark", {
        ...UNIVER_UPSTREAM_DEFAULT_COLORS,
        page: "var(--univer-bg-color)",
      });
      expect(unparseable.join(" | ")).toMatch(/not in the grammar/);

      const hslSpaceSyntax = univerDocSurfaceViolations("dark", {
        ...UNIVER_UPSTREAM_DEFAULT_COLORS,
        frame: "hsl(240 4% 16%)",
      });
      expect(hslSpaceSyntax.join(" | ")).toMatch(/ColorKit throws/);
    });

    it("a dark page under Univer's black ink is a violation", () => {
      const violations = univerDocSurfaceViolations("dark", {
        frame: "rgb(20, 20, 22)",
        page: "rgb(24, 24, 27)",
        pageStroke: "rgb(60, 60, 66)",
        marginStroke: "rgba(158, 158, 158, 1)",
      });
      expect(violations.join(" | ")).toMatch(/too dark for the black ink/);
    });
  });

  describe("the colours this app states", () => {
    it.each(["light", "dark"] as const)("%s is clean", (mode) => {
      const colors = univerDocSurfaceColors(mode, readerFor(mode));
      expect(univerDocSurfaceViolations(mode, colors)).toEqual([]);
    });

    it("the frame follows the app background in each theme", () => {
      const light = univerDocSurfaceColors("light", readerFor("light"));
      const dark = univerDocSurfaceColors("dark", readerFor("dark"));
      // Resolved to rgb() here, once — `hsl(h s% l%)` is the form Univer's
      // ColorKit throws on, and a token passed straight through is what
      // emptied the page in cold walk 19.
      expect(light.frame).toBe("rgb(244, 244, 245)");
      expect(dark.frame).toBe("rgb(39, 39, 42)");
      expect(relativeLuminance(dark.frame)!).toBeLessThan(
        relativeLuminance(light.frame)!,
      );
    });

    it("the page stays paper in both themes, so the black ink stays readable", () => {
      for (const mode of ["light", "dark"] as const) {
        const page = univerDocSurfaceColors(mode, readerFor(mode)).page;
        expect(relativeLuminance(page)!).toBeGreaterThan(0.8);
      }
    });

    it("falls back to the theme's own values when no token can be read", () => {
      // jsdom, SSR, or a boot before the stylesheet lands. A fallback that
      // returned "" would produce `hsl()` — unparseable — and a black page.
      const dark = univerDocSurfaceColors("dark", () => "");
      expect(univerDocSurfaceViolations("dark", dark)).toEqual([]);
      expect(relativeLuminance(dark.frame)).not.toBeNull();
    });
  });

  describe("relativeLuminance", () => {
    it("parses every notation this module can emit", () => {
      expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
      expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
      expect(relativeLuminance("rgb(255, 255, 255)")).toBeCloseTo(1, 5);
      expect(relativeLuminance("rgba(0, 0, 0, 1)")).toBeCloseTo(0, 5);
      expect(relativeLuminance("hsl(0 0% 100%)")).toBeCloseTo(1, 5);
      expect(relativeLuminance("hsl(240 4% 16%)")).toBeLessThan(0.05);
    });

    it("returns null rather than guessing", () => {
      expect(relativeLuminance("var(--whatever)")).toBeNull();
      expect(relativeLuminance("hsl()")).toBeNull();
      expect(relativeLuminance("")).toBeNull();
    });
  });
});
