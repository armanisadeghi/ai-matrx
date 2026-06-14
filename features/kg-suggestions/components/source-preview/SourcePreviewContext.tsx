// features/kg-suggestions/components/source-preview/SourcePreviewContext.tsx
//
// The wiring that lets ANY suggestion decision card (KgSuggestionRowItem, deep
// in the drawer or the manager table) ask to preview its source document —
// WITHOUT prop-drilling and, crucially, WITHOUT re-rendering or closing the
// inbox it lives in.
//
// A host (the drawer, the manager) owns the preview target via
// `useSourcePreviewController`, exposes only `openPreview` to descendants
// through this context, and renders the floating `SourcePreviewPanel` itself.
// A card calls `useOpenSourcePreview()`; when a provider is present it opens the
// in-place panel, otherwise (compact popover/chip surfaces with no host) the
// card falls back to a link-out / window open. Opening a preview only updates
// the host's local target state, so the inbox surface never unmounts.

"use client";

import { createContext, useCallback, useContext, useState } from "react";

export interface SourcePreviewTarget {
  kind: string;
  id: string;
  snippet: string | null;
  /** Pre-resolved title (optional) so the panel header can show it instantly. */
  title?: string | null;
}

interface SourcePreviewApi {
  openPreview: (target: SourcePreviewTarget) => void;
}

const SourcePreviewContext = createContext<SourcePreviewApi | null>(null);

export const SourcePreviewProvider = SourcePreviewContext.Provider;

/**
 * Card-side hook. Returns an `openPreview` fn when a host provides one, else
 * `null` so the card can gracefully fall back to a link-out / window open.
 */
export function useOpenSourcePreview():
  | ((target: SourcePreviewTarget) => void)
  | null {
  const api = useContext(SourcePreviewContext);
  return api?.openPreview ?? null;
}

export interface SourcePreviewController {
  target: SourcePreviewTarget | null;
  openPreview: (target: SourcePreviewTarget) => void;
  closePreview: () => void;
  /** True while a source preview is open — hosts use this to keep the inbox open. */
  isPreviewing: boolean;
}

/**
 * Host-side state. Owns the single active preview target. The same source
 * re-opening just updates the target (no flicker); a new source swaps it in.
 */
export function useSourcePreviewController(): SourcePreviewController {
  const [target, setTarget] = useState<SourcePreviewTarget | null>(null);

  const openPreview = useCallback((next: SourcePreviewTarget) => {
    setTarget(next);
  }, []);

  const closePreview = useCallback(() => {
    setTarget(null);
  }, []);

  return { target, openPreview, closePreview, isPreviewing: target !== null };
}
