/**
 * The colours are worthless unless they REACH Univer. This drives the applier
 * against a stand-in with the exact shape of Univer's `IRender` and asserts
 * every surface cold walk 18 measured is written:
 *
 *   • the canvas ELEMENT's CSS background — the bright margin around the page,
 *     which `DocsRenderService` otherwise pins to `#fafafa` for ever;
 *   • all four `DocBackground` fills — the desk, the paper, the page outline
 *     and the margin guides;
 *   • an explicit repaint, because `setFillColors` only dirties itself when a
 *     value moved and the docs scene caches its layers.
 */
import {
  DOC_BACKGROUND_COMPONENT_KEY,
  applyUniverDocSurfaceColors,
  type UniverDocRenderLike,
} from "@/features/documents/hooks/useUniverDocSurfaceTheme";
import { univerDocSurfaceColors } from "@/features/documents/univer-doc-surface-theme";

interface Harness {
  render: UniverDocRenderLike;
  canvasEle: { style: { backgroundColor: string } };
  fills: (string | undefined)[][];
  dirtied: string[];
}

function harness(
  options: { withBackground?: boolean; documentFlavor?: number } = {},
): Harness {
  const { withBackground = true, documentFlavor = 1 } = options;
  const canvasEle = { style: { backgroundColor: "#fafafa" } };
  const fills: (string | undefined)[][] = [];
  const dirtied: string[] = [];

  const background = {
    setFillColors: (...args: (string | undefined)[]) => fills.push(args),
    makeDirty: () => dirtied.push("background"),
    getSkeleton: () => ({
      getViewModel: () => ({
        getDataModel: () => ({
          getSnapshot: () => ({ documentStyle: { documentFlavor } }),
        }),
      }),
    }),
  };

  return {
    canvasEle,
    fills,
    dirtied,
    render: {
      engine: { getCanvas: () => ({ getCanvasEle: () => canvasEle as never }) },
      components: {
        get: (key: string) =>
          key === DOC_BACKGROUND_COMPONENT_KEY && withBackground
            ? background
            : undefined,
      },
      mainComponent: { makeDirty: () => dirtied.push("main") },
      scene: { makeDirty: () => dirtied.push("scene") },
    },
  };
}

describe("applyUniverDocSurfaceColors", () => {
  const dark = univerDocSurfaceColors("dark", () => "");
  const light = univerDocSurfaceColors("light", () => "");

  it("paints the canvas element and all four fills, then repaints", () => {
    const h = harness();
    const result = applyUniverDocSurfaceColors(h.render, dark);

    expect(result).toEqual({ applied: true, unreached: [] });
    expect(h.canvasEle.style.backgroundColor).toBe(dark.frame);
    expect(h.fills).toEqual([
      [dark.frame, dark.page, dark.pageStroke, dark.marginStroke],
    ]);
    expect(h.dirtied).toEqual(
      expect.arrayContaining(["background", "main", "scene"]),
    );
  });

  it("never leaves the frame lighter than the page", () => {
    // The literal inversion in the screenshot: a `#fafafa` canvas element
    // around a dark sheet. Whatever the theme, these two move together.
    for (const colors of [dark, light]) {
      const h = harness();
      applyUniverDocSurfaceColors(h.render, colors);
      expect(h.canvasEle.style.backgroundColor).toBe(colors.frame);
      expect(h.fills[0]![0]).toBe(colors.frame);
    }
  });

  it("a PAGELESS (modern) document's workspace is the paper, so the ink stays legible in dark mode", () => {
    // 2026-10-03: a modern document has no sheet — Univer paints the text
    // straight onto the workspace fill. Giving that fill the dark frame put
    // black ink on rgb(39, 39, 42).
    const h = harness({ documentFlavor: 2 });
    applyUniverDocSurfaceColors(h.render, dark);
    expect(h.fills[0]![0]).toBe(dark.page);
    expect(h.canvasEle.style.backgroundColor).toBe(dark.page);
    // …and it holds when Univer resets the fills on the next keystroke.
    const background = h.render.components!.get(DOC_BACKGROUND_COMPONENT_KEY) as {
      setFillColors: (...a: (string | undefined)[]) => void;
    };
    background.setFillColors(undefined, undefined, undefined, undefined);
    expect(h.fills.at(-1)![0]).toBe(dark.page);
  });

  it("a theme flip repaints the surface with the new colours", () => {
    const h = harness();
    applyUniverDocSurfaceColors(h.render, light);
    applyUniverDocSurfaceColors(h.render, dark);
    expect(h.canvasEle.style.backgroundColor).toBe(dark.frame);
    expect(h.fills).toHaveLength(2);
    expect(h.fills[1]![0]).toBe(dark.frame);
  });

  it("reports what it could not reach instead of claiming success", () => {
    expect(applyUniverDocSurfaceColors(null, dark)).toEqual({
      applied: false,
      unreached: ["render"],
    });
    const missing = applyUniverDocSurfaceColors(
      harness({ withBackground: false }).render,
      dark,
    );
    expect(missing.applied).toBe(false);
    expect(missing.unreached).toContain(DOC_BACKGROUND_COMPONENT_KEY);
  });
});
