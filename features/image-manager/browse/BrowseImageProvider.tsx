"use client";

/**
 * features/image-manager/browse/BrowseImageProvider.tsx
 *
 * Provides a single function `useBrowseAction()` that opens an image in
 * the floating `ImageViewerWindow` (via `openImageViewer`) when the user
 * clicks an image in the Image Manager hub while `selectionMode === "none"`
 * (Browse mode).
 *
 * The provider is intentionally lightweight — it doesn't hold any state
 * itself; it just shapes the dispatch into a stable callback.
 *
 * Why a provider at all (vs a bare hook)? Two reasons:
 *   1. Different surfaces (route, modal, embedded picker) may want to
 *      override the browse behaviour later — e.g. the modal might prefer
 *      to expand the tile inline rather than open the viewer overlay.
 *   2. The callback can take an *array* of images so consumers like the
 *      cloud-images grid can pass the entire visible page and let the
 *      viewer page through them.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openImageViewer } from "@/features/overlays/openers/imageViewer";

export interface BrowseImagesPayload {
  /** Resolved URLs to open in the viewer. Order matters. */
  images: string[];
  /** Index of the image clicked (defaults to 0). */
  initialIndex?: number;
  /** Optional alt text per image. */
  alts?: string[];
  /** Optional viewer title. */
  title?: string;
}

export type BrowseAction = (payload: BrowseImagesPayload) => void;

const BrowseImageContext = createContext<BrowseAction | null>(null);

export interface BrowseImageProviderProps {
  /**
   * Optional override — if supplied, replaces the default
   * `openImageViewer` dispatch. Useful for surfaces that want to expand
   * the image inline instead of opening a floating viewer.
   */
  onBrowse?: BrowseAction;
  children: React.ReactNode;
}

export function BrowseImageProvider({
  onBrowse,
  children,
}: BrowseImageProviderProps) {
  const dispatch = useAppDispatch();

  const browse = useCallback<BrowseAction>(
    (payload) => {
      if (onBrowse) {
        onBrowse(payload);
        return;
      }
      openImageViewer(dispatch, {
        images: payload.images,
        initialIndex: payload.initialIndex ?? 0,
        alts: payload.alts,
        title: payload.title,
      });
    },
    [dispatch, onBrowse],
  );

  // Stable identity unless dispatch/onBrowse changes.
  const value = useMemo(() => browse, [browse]);

  return (
    <BrowseImageContext.Provider value={value}>
      {children}
    </BrowseImageContext.Provider>
  );
}

/**
 * Returns a stable browse callback. If no provider is mounted, returns a
 * no-op so consumers don't have to null-check. (Components that *require*
 * the provider should call `useBrowseActionStrict` instead.)
 */
export function useBrowseAction(): BrowseAction {
  const ctx = useContext(BrowseImageContext);
  return ctx ?? noopBrowse;
}

/**
 * Same as `useBrowseAction` but throws if no provider is mounted. Use in
 * tests / strict consumers where a missing provider is a programming
 * error.
 */
export function useBrowseActionStrict(): BrowseAction {
  const ctx = useContext(BrowseImageContext);
  if (!ctx) {
    throw new Error(
      "useBrowseActionStrict must be used inside <BrowseImageProvider>",
    );
  }
  return ctx;
}

function noopBrowse(_payload: BrowseImagesPayload): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[image-manager] useBrowseAction was called outside <BrowseImageProvider> — click ignored.",
    );
  }
}
