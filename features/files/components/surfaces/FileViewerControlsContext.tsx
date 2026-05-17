/**
 * features/files/components/surfaces/FileViewerControlsContext.tsx
 *
 * Shared state contract between the SingleFileShell's left control rail
 * and the previewers / editor it controls. Each shell owns the state; the
 * rail reads + mutates it; the previewers consume it via `useFileViewerControls`.
 *
 * **Why a context (not props):** the body components (ImagePreview,
 * HtmlPreview, CloudFileInlineEditor) live behind `next/dynamic` and a
 * dispatch-on-previewKind switch in FilePreview. Threading 10+ control
 * props through that pipeline is a poor return on the complexity. A
 * context lets each previewer opt in only if it cares.
 *
 * **Fallback:** `useFileViewerControls()` returns `null` when not
 * inside a provider — i.e. when the previewer is rendered from the
 * compact `PreviewPane` (side panel). Each previewer must handle the
 * null case by falling back to sensible internal defaults so the
 * existing side-panel UX is untouched.
 */

"use client";

import { createContext, useContext, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Public state shape
// ---------------------------------------------------------------------------

/** How the image previewer fits the image inside its frame. */
export type ImageFitMode = "fit" | "actual";

/** How the HTML previewer constrains the rendered iframe width. */
export type HtmlViewport = "auto" | "mobile" | "tablet" | "desktop";

/** What the HTML previewer shows. */
export type HtmlMode = "rendered" | "source";

export interface FileViewerControlsState {
  // ─── Image previewer ────────────────────────────────────────────────
  imageZoom: number; // 1.0 = 100%
  imageRotation: 0 | 90 | 180 | 270;
  imageFit: ImageFitMode;
  imageTransparencyGrid: boolean;

  // ─── HTML previewer ─────────────────────────────────────────────────
  htmlMode: HtmlMode;
  htmlViewport: HtmlViewport;
  /** Monotonic counter — incremented to force-reload the iframe. */
  htmlReloadKey: number;

  // ─── Code editor (Monaco) ───────────────────────────────────────────
  editorFontSize: number;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorTabSize: 2 | 4 | 8;
}

export interface FileViewerControlsApi extends FileViewerControlsState {
  setImageZoom: (next: number | ((prev: number) => number)) => void;
  setImageRotation: (next: 0 | 90 | 180 | 270) => void;
  setImageFit: (next: ImageFitMode) => void;
  setImageTransparencyGrid: (next: boolean) => void;
  resetImage: () => void;

  setHtmlMode: (next: HtmlMode) => void;
  setHtmlViewport: (next: HtmlViewport) => void;
  reloadHtml: () => void;

  setEditorFontSize: (next: number | ((prev: number) => number)) => void;
  setEditorWordWrap: (next: boolean) => void;
  setEditorMinimap: (next: boolean) => void;
  setEditorTabSize: (next: 2 | 4 | 8) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONTROLS_STATE: FileViewerControlsState = {
  imageZoom: 1,
  imageRotation: 0,
  imageFit: "fit",
  imageTransparencyGrid: false,

  htmlMode: "rendered",
  htmlViewport: "auto",
  htmlReloadKey: 0,

  editorFontSize: 13,
  editorWordWrap: false,
  editorMinimap: true,
  editorTabSize: 2,
};

export const IMAGE_ZOOM_MIN = 0.1;
export const IMAGE_ZOOM_MAX = 8;
export const IMAGE_ZOOM_STEP = 0.25;

export const EDITOR_FONT_MIN = 10;
export const EDITOR_FONT_MAX = 28;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FileViewerControlsContext = createContext<FileViewerControlsApi | null>(
  null,
);

export interface FileViewerControlsProviderProps {
  children: React.ReactNode;
  /** Override initial state — used to persist preferences across mounts. */
  initial?: Partial<FileViewerControlsState>;
}

export function FileViewerControlsProvider({
  children,
  initial,
}: FileViewerControlsProviderProps) {
  const [state, setState] = useState<FileViewerControlsState>(() => ({
    ...DEFAULT_CONTROLS_STATE,
    ...initial,
  }));

  const api = useMemo<FileViewerControlsApi>(() => {
    const patch = (next: Partial<FileViewerControlsState>) =>
      setState((prev) => ({ ...prev, ...next }));

    const clampZoom = (z: number) =>
      Math.max(IMAGE_ZOOM_MIN, Math.min(IMAGE_ZOOM_MAX, z));
    const clampFont = (n: number) =>
      Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, Math.round(n)));

    return {
      ...state,
      setImageZoom: (next) =>
        setState((prev) => ({
          ...prev,
          imageZoom: clampZoom(
            typeof next === "function" ? next(prev.imageZoom) : next,
          ),
          // Any explicit zoom adjustment switches us out of fit mode so the
          // user's input isn't immediately undone by the auto-fit transform.
          imageFit: "actual",
        })),
      setImageRotation: (next) => patch({ imageRotation: next }),
      setImageFit: (next) =>
        setState((prev) => ({
          ...prev,
          imageFit: next,
          // Returning to fit mode resets the zoom — fit is "browser-decides
          // the size", manual zoom is what overrides it.
          imageZoom: next === "fit" ? 1 : prev.imageZoom,
        })),
      setImageTransparencyGrid: (next) =>
        patch({ imageTransparencyGrid: next }),
      resetImage: () =>
        patch({
          imageZoom: 1,
          imageRotation: 0,
          imageFit: "fit",
          imageTransparencyGrid: false,
        }),

      setHtmlMode: (next) => patch({ htmlMode: next }),
      setHtmlViewport: (next) => patch({ htmlViewport: next }),
      reloadHtml: () =>
        setState((prev) => ({
          ...prev,
          htmlReloadKey: prev.htmlReloadKey + 1,
        })),

      setEditorFontSize: (next) =>
        setState((prev) => ({
          ...prev,
          editorFontSize: clampFont(
            typeof next === "function" ? next(prev.editorFontSize) : next,
          ),
        })),
      setEditorWordWrap: (next) => patch({ editorWordWrap: next }),
      setEditorMinimap: (next) => patch({ editorMinimap: next }),
      setEditorTabSize: (next) => patch({ editorTabSize: next }),
    };
  }, [state]);

  return (
    <FileViewerControlsContext.Provider value={api}>
      {children}
    </FileViewerControlsContext.Provider>
  );
}

/**
 * Read the current viewer-controls API. Returns `null` when called outside
 * a `<FileViewerControlsProvider/>` — callers MUST handle the null case
 * (use internal defaults) so the previewers still render in the compact
 * PreviewPane / FilePreview surfaces that don't mount a provider.
 */
export function useFileViewerControls(): FileViewerControlsApi | null {
  return useContext(FileViewerControlsContext);
}
