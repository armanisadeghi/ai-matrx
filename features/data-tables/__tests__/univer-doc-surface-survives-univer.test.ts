/**
 * COLD WALK 19: the document page rendered NOTHING in dark mode.
 *
 * A 1396x684 canvas, 0.00% non-background pixels, silently swallowing a
 * 519-character paragraph that was being saved the whole time. Two independent
 * mechanisms in Univer produced it, and this file encodes both as
 * fails-before/passes-after proofs:
 *
 *  1. THE COLOUR THE RENDERER THROWS ON. Every `ctx.fillStyle = <string>` on
 *     Univer's rendering context passes through `CanvasColorService`, which in
 *     dark mode calls `new ColorKit(color)` on anything that is not hex / rgb
 *     / rgba. ColorKit's `hslToColor` splits on COMMAS and throws on the
 *     space-separated `hsl(240 4% 16%)` form this app's design tokens are
 *     written in. The throw is raised inside the fillStyle setter, i.e. inside
 *     the render pass, so the entire draw aborts. The test below drives the
 *     REAL `ColorKit` from `@univerjs/core`, not a description of it.
 *
 *  2. THE RESET ON EVERY KEYSTROKE. `DocRenderController._syncCanvasBackground`
 *     (docs-ui 0.25.1) re-pins the canvas element's CSS background to
 *     `#fafafa` and calls `setFillColors(undefined, undefined, undefined,
 *     undefined)` on every `RichTextEditingMutation`. A host that states its
 *     colours once watches the page turn white the moment somebody types.
 */
//
// NOTE ON WHERE THE VENDOR CODE IS DRIVEN: `@univerjs/core` is ESM-only and
// jest here cannot require it, so the assertion against the REAL `ColorKit`
// (the constructor that threw) lives in `scripts/check-univer-doc-theme.mjs`
// — run `pnpm check:univer-doc-theme:self-test`, which plants the 2026-09-21
// strings and proves Univer itself rejects them. This file owns the grammar
// and the reset behaviour.
import {
  applyUniverDocSurfaceColors,
  DOC_BACKGROUND_COMPONENT_KEY,
  type UniverDocRenderLike,
} from "../hooks/useUniverDocSurfaceTheme";
import {
  isUniverParseableColor,
  univerDocSurfaceColors,
  univerDocSurfaceViolations,
} from "../univer-doc-surface-theme";

const TOKENS: Record<"light" | "dark", Record<string, string>> = {
  light: { "--background": "240 5% 96%", "--border": "240 6% 84%" },
  dark: { "--background": "240 4% 16%", "--border": "240 4% 28%" },
};
const readerFor = (mode: "light" | "dark") => (name: string) =>
  TOKENS[mode][name] ?? "";

describe("every colour reaches Univer's renderer intact", () => {
  it("FAILS-BEFORE: the exact strings shipped on 2026-09-21 are violations", () => {
    // Verbatim what `hslFromToken` produced before this change, and what the
    // dark app therefore handed the canvas on every frame.
    expect(isUniverParseableColor("hsl(240 4% 16%)")).toBe(false);
    expect(isUniverParseableColor("hsl(240 5% 96%)")).toBe(false);
    const shipped = univerDocSurfaceViolations("dark", {
      frame: "hsl(240 4% 16%)",
      page: "rgb(245, 245, 247)",
      pageStroke: "hsl(240 4% 30%)",
      marginStroke: "rgba(158, 158, 158, 1)",
    });
    expect(shipped).toHaveLength(2);
    expect(shipped.join(" ")).toMatch(/ColorKit throws/);
  });

  it("the comma form Univer accepts is not rejected", () => {
    expect(isUniverParseableColor("hsl(240, 4%, 16%)")).toBe(true);
    expect(isUniverParseableColor("rgb(39, 39, 42)")).toBe(true);
    expect(isUniverParseableColor("rgba(158, 158, 158, 1)")).toBe(true);
    expect(isUniverParseableColor("#fafafa")).toBe(true);
  });

  it.each(["light", "dark"] as const)(
    "%s: every stated colour is in the grammar every reader accepts",
    (mode) => {
      const colors = univerDocSurfaceColors(mode, readerFor(mode));
      for (const [slot, value] of Object.entries(colors)) {
        expect(`${slot}:${value}:${isUniverParseableColor(value)}`).toBe(
          `${slot}:${value}:true`,
        );
      }
      expect(univerDocSurfaceViolations(mode, colors)).toEqual([]);
    },
  );

  it("resolves the app's hsl tokens to rgb rather than passing them through", () => {
    expect(univerDocSurfaceColors("dark", readerFor("dark")).frame).toBe(
      "rgb(39, 39, 42)",
    );
    expect(univerDocSurfaceColors("light", readerFor("light")).frame).toBe(
      "rgb(244, 244, 245)",
    );
  });
});

describe("Univer cannot reset the page back to its light defaults", () => {
  /** A stand-in with the exact shape of Univer's `IRender`. */
  function harness() {
    const canvasEle = { style: { backgroundColor: "#fafafa" } };
    const applied: (string | undefined)[][] = [];
    const background: {
      setFillColors?: (...args: (string | undefined)[]) => void;
      makeDirty?: (dirty: boolean) => void;
    } = {
      setFillColors: (...args: (string | undefined)[]) => applied.push(args),
      makeDirty: () => {},
    };
    const render: UniverDocRenderLike = {
      engine: { getCanvas: () => ({ getCanvasEle: () => canvasEle as never }) },
      components: {
        get: (key: string) =>
          key === DOC_BACKGROUND_COMPONENT_KEY ? background : undefined,
      },
      mainComponent: { makeDirty: () => {} },
      scene: { makeDirty: () => {} },
    };
    return { render, canvasEle, background, applied };
  }

  it("FAILS-BEFORE / PASSES-AFTER: the reset docs-ui runs on every keystroke lands on the host's colours", () => {
    const h = harness();
    const dark = univerDocSurfaceColors("dark", readerFor("dark"));
    expect(applyUniverDocSurfaceColors(h.render, dark).applied).toBe(true);
    h.applied.length = 0;

    // Exactly what `DocRenderController._syncCanvasBackground()` does on a
    // normal (non-editor) document: pin the canvas back to Univer's `#fafafa`
    // and wipe all four fills.
    h.canvasEle.style.backgroundColor = "#fafafa";
    h.background.setFillColors?.(undefined, undefined, undefined, undefined);

    // Before this change that landed four `undefined`s, which is Univer's
    // light page and desk. Now the host's palette IS the default.
    expect(h.applied).toEqual([
      [dark.frame, dark.page, dark.pageStroke, dark.marginStroke],
    ]);
    expect(h.canvasEle.style.backgroundColor).toBe(dark.frame);
  });

  it("a theme flip moves the palette instead of stacking a second wrapper", () => {
    const h = harness();
    const dark = univerDocSurfaceColors("dark", readerFor("dark"));
    const light = univerDocSurfaceColors("light", readerFor("light"));
    applyUniverDocSurfaceColors(h.render, dark);
    applyUniverDocSurfaceColors(h.render, light);
    h.applied.length = 0;

    h.background.setFillColors?.(undefined, undefined, undefined, undefined);

    expect(h.applied).toEqual([
      [light.frame, light.page, light.pageStroke, light.marginStroke],
    ]);
    expect(h.canvasEle.style.backgroundColor).toBe(light.frame);
  });

  it("a colour Univer DOES state explicitly still wins — this never overrides a real caller", () => {
    const h = harness();
    applyUniverDocSurfaceColors(
      h.render,
      univerDocSurfaceColors("dark", readerFor("dark")),
    );
    h.applied.length = 0;

    // An editor unit's `canvasStyle.backgroundColor` path passes a real value.
    h.background.setFillColors?.(
      "rgb(1, 2, 3)",
      "rgb(1, 2, 3)",
      "rgb(1, 2, 3)",
      "rgb(1, 2, 3)",
    );
    expect(h.applied).toEqual([
      ["rgb(1, 2, 3)", "rgb(1, 2, 3)", "rgb(1, 2, 3)", "rgb(1, 2, 3)"],
    ]);
  });
});
