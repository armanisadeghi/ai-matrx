/**
 * The document canvas renders the colours it is given, VERBATIM — in every
 * theme.
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `@univerjs/engine-render` routes EVERY `ctx.fillStyle = <string>` and
 * `ctx.strokeStyle = <string>` on its own rendering context through
 * `ICanvasColorService.getRenderColor()` (engine-render 0.25.1 and 1.0.2,
 * `UniverRenderingContext`). The shipped implementation, `CanvasColorService`,
 * does two things once `ThemeService.darkMode` is true:
 *
 *   1. It INVERTS every colour through `invertColorByMatrix`. That is how
 *      Univer produces a dark document: the white page becomes near-black and
 *      the black ink becomes near-white. It happens to the colours the HOST
 *      pushes in too — a host that states "the page is white paper" gets a
 *      black page (cold walk 18's photograph, 2026-09-21).
 *   2. It calls `new ColorKit(color)` on anything that is not `#hex`,
 *      `rgb(...)` or `rgba(...)`, and ColorKit's `hslToColor` THROWS on the
 *      space-separated `hsl(240 4% 16%)` form that this app's design tokens
 *      are written in. The throw happens inside the fillStyle setter, i.e.
 *      inside the render pass, so the ENTIRE draw aborts and the canvas is
 *      left exactly as `clearRect` left it: empty. Cold walk 19 measured the
 *      result — a 1396x684 canvas with 0.00% non-background pixels, swallowing
 *      a 519-character paragraph that was being saved the whole time.
 *
 * ─── THE DECISION ───────────────────────────────────────────────────────────
 * THE PAGE IS PAPER WITH BLACK INK IN BOTH THEMES; THE FRAME FOLLOWS THE APP.
 *
 * That is what Word, Pages and Google Docs show by default, it is what the
 * document looks like when it is printed or exported, and it is the only
 * arrangement in which the ink is legible without the host also rewriting the
 * colour stored in every text run. It is unreachable while an inversion sits
 * between what the host states and what the canvas paints — invert the paper
 * and the ink inverts with it. So the document instance swaps the inverting
 * service for one that resolves Univer's THEME TOKENS and inverts nothing.
 *
 * NOT `DumbCanvasColorService` (used here until 2026-10-03). Univer 1.0 paints
 * its own fills as tokens (`"gray.0"` page, `"gray.100"` desk, `"gray.900"`
 * ink) and only `CanvasColorService` resolves them; the dumb service handed the
 * canvas `"gray.0"`, the canvas ignored it and kept its default black, and
 * every document page rendered solid black in every browser and theme — see
 * `univer-theme-token-color.ts`.
 *
 * This reaches the CANVAS only. Univer's chrome (ribbon, menus, popups) is
 * DOM + CSS keyed off the `univer-dark` class that `toggleDarkMode` adds, so
 * it still follows the app — see `useUniverDarkModeSync`.
 */
"use client";

import { ThemeService } from "@univerjs/core";
import { ICanvasColorService } from "@univerjs/engine-render";

import { resolveUniverCanvasColor } from "@/lib/univer/univer-theme-token-color";

/** The slice of redi's `Injector` this needs. Structural on purpose. */
export interface ReplaceableInjector {
  replace?: (dependency: [unknown, unknown]) => void;
}

/**
 * Swap the dark-mode colour inversion out of ONE Univer instance.
 *
 * MUST be called after `createUniver` and BEFORE the document unit is created:
 * `ICanvasColorService` is constructor-injected into `Engine`, and the engine
 * for a unit is built when that unit's render is created.
 *
 * Returns why it could not, never a success it did not earn.
 */
export function renderDocumentCanvasColorsVerbatim(
  injector: ReplaceableInjector | null | undefined,
): { applied: boolean; reason?: string } {
  if (!injector) return { applied: false, reason: "no injector" };
  if (typeof injector.replace !== "function") {
    return { applied: false, reason: "injector has no replace()" };
  }
  try {
    injector.replace([
      ICanvasColorService,
      {
        // Tokens resolved from the LIVE theme on every call (a theme change
        // reaches the next frame); real colours pass through untouched.
        useFactory: (themeService: ThemeService) => ({
          getRenderColor: (color: string) =>
            resolveUniverCanvasColor(color, (token) =>
              themeService.getColorFromTheme(token),
            ),
        }),
        deps: [ThemeService],
      },
    ]);
    return { applied: true };
  } catch (err) {
    return {
      applied: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
