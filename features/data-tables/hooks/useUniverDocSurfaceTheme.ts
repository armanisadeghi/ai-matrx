/**
 * useUniverDocSurfaceTheme — push this app's theme INTO a Univer document's
 * canvas, on boot and on every theme flip.
 *
 * `useUniverDarkModeSync` is the other half and is NOT enough on its own:
 * `univerAPI.toggleDarkMode()` recolours Univer's chrome and nothing else.
 * The page and the desk it sits on are painted by
 * `@univerjs/engine-render`'s `DocBackground` from module-level LIGHT
 * constants, and the canvas element's own background is set once by
 * `DocsRenderService` to `#fafafa`. Neither ever hears about a theme. The full
 * argument, and the decision about what the page should look like in dark
 * mode, live in `../univer-doc-surface-theme.ts`.
 *
 * So the host states the colours. Every Matrx surface that mounts a Univer
 * document goes through `DocumentEditor`, and `DocumentEditor` goes through
 * this hook — the `/documents/[id]` route and the canvas pane's
 * `DocumentCanvasBody` therefore inherit it without knowing it exists.
 */
"use client";

import { useEffect } from "react";

import { useThemeMode } from "@/styles/themes/useThemeMode";

import {
  domTokenReader,
  univerDocSurfaceColors,
  type UniverDocSurfaceColors,
} from "../univer-doc-surface-theme";

/** Univer's key for the object that paints the desk, the page and its border. */
export const DOC_BACKGROUND_COMPONENT_KEY = "__Document_Render_Background__";

interface FillColorTarget {
  setFillColors?: (
    backgroundFillColor?: string,
    pageFillColor?: string,
    pageStrokeColor?: string,
    marginStrokeColor?: string,
  ) => void;
  makeDirty?: (dirty: boolean) => void;
}

/** The narrow slice of Univer's `IRender` this needs. Structural on purpose. */
export interface UniverDocRenderLike {
  engine?: {
    getCanvas?: () => { getCanvasEle?: () => HTMLElement | null | undefined } | null;
  } | null;
  components?: { get(key: string): unknown } | null;
  mainComponent?: { makeDirty?: (dirty: boolean) => void } | null;
  scene?: { makeDirty?: (dirty: boolean) => void } | null;
}

/**
 * Paint one document render in `colors`.
 *
 * Returns what it could not reach, never an empty success it did not earn —
 * the caller announces a miss rather than leaving a surface silently wearing
 * Univer's light defaults.
 */
export function applyUniverDocSurfaceColors(
  render: UniverDocRenderLike | null | undefined,
  colors: UniverDocSurfaceColors,
): { applied: boolean; unreached: string[] } {
  if (!render) return { applied: false, unreached: ["render"] };
  const unreached: string[] = [];

  // The canvas ELEMENT's CSS background is what shows wherever the renderer
  // has not painted — the bright L-shaped margin in cold walk 18's screenshot.
  const canvasEle = render.engine?.getCanvas?.()?.getCanvasEle?.();
  if (canvasEle && "style" in canvasEle) {
    canvasEle.style.backgroundColor = colors.frame;
  } else {
    unreached.push("canvas element");
  }

  const background = render.components?.get(DOC_BACKGROUND_COMPONENT_KEY) as
    | FillColorTarget
    | undefined;
  if (typeof background?.setFillColors === "function") {
    background.setFillColors(
      colors.frame,
      colors.page,
      colors.pageStroke,
      colors.marginStroke,
    );
    // `setFillColors` only marks itself dirty when a value actually moved, and
    // the docs scene caches its layers — ask for the repaint explicitly so a
    // theme flip lands on a document nobody is typing into.
    background.makeDirty?.(true);
  } else {
    unreached.push(DOC_BACKGROUND_COMPONENT_KEY);
  }

  render.mainComponent?.makeDirty?.(true);
  render.scene?.makeDirty?.(true);

  return { applied: unreached.length === 0, unreached };
}

interface InjectorLike {
  get: <T>(token: unknown) => T | undefined;
}

type UniverLike = { __getInjector?: () => InjectorLike | undefined } | null;

/**
 * Resolve the render for `unitId` out of a booted Univer instance.
 *
 * The injector is the same door `registerUniverFacadeDependencies` and the
 * collab session already use; `IRenderManagerService` is imported lazily so a
 * surface that never mounts a document never pays for it.
 */
async function resolveDocRender(
  univer: UniverLike,
  unitId: string,
): Promise<UniverDocRenderLike | null> {
  const injector = univer?.__getInjector?.();
  if (!injector) return null;
  const { IRenderManagerService } = await import("@univerjs/engine-render");
  const manager = injector.get<{
    getRenderById?: (id: string) => UniverDocRenderLike | null;
  }>(IRenderManagerService as unknown);
  return manager?.getRenderById?.(unitId) ?? null;
}

/**
 * @param univerRef  Ref holding the Univer instance (set once it boots).
 * @param unitId     The document unit whose render should be painted.
 * @param ready      True once the instance has booted and created its document.
 */
export function useUniverDocSurfaceTheme(
  univerRef: React.RefObject<unknown>,
  unitId: string,
  ready: boolean,
): void {
  const mode = useThemeMode();

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;

    (async () => {
      const colors = univerDocSurfaceColors(mode, domTokenReader());
      const render = await resolveDocRender(
        univerRef.current as UniverLike,
        unitId,
      );
      if (cancelled) return;
      const result = applyUniverDocSurfaceColors(render, colors);
      if (!result.applied) {
        // NOTHING FAILS SILENTLY. A miss here means the document is wearing
        // Univer's hardcoded light page and desk inside whatever theme the
        // person actually chose — the cold walk 18 defect, back. It is
        // cosmetic, so it does not take the editor down, but it says so.
        console.warn(
          `[document] theme not applied to the page surface (could not reach: ${result.unreached.join(", ")}) — the page may keep Univer's light defaults in dark mode`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [univerRef, unitId, ready, mode]);
}
